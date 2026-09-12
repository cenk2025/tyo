/**
 * Import Finnish vocational qualifications from ePerusteet (Opetushallitus's
 * public curriculum API, no auth) and link them to ESCO occupations/skills.
 *
 *   node scripts/import-education-programs.mjs                # all ~328
 *   node scripts/import-education-programs.mjs --limit 10      # smoke test
 *
 * Idempotent: re-running re-fetches and re-upserts everything (there's no
 * "already done" marker — the whole dataset is small enough, ~328 programs,
 * that a wholesale re-import is simpler than incremental tracking).
 *
 * Two matching methods, because the source text differs:
 *   - occupations: from each qualification's official degree titles
 *     (tutkintonimikkeet, e.g. "Vehicle Mechanic") via trigram similarity
 *     (search_occupations_fuzzy RPC, 0009) — these are short, standardized
 *     labels, already close to ESCO's own naming.
 *   - skills: from each qualification's overall competence summary + job-task
 *     description (Finnish prose) via the existing embedding_fi /
 *     match_skills_semantic infrastructure (0007) — qualification-level
 *     granularity (one combined text per program), not per-unit. Matching
 *     every one of the ~78 units per program down to atomic skill statements
 *     would mean hundreds of thousands of embedding calls for a first pass;
 *     this keeps it a ~11-batch job.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- env
function loadEnv(file = ".env.local") {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    die(`${file} not found — run this from the project root.`);
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

loadEnv();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const EMBED_MODEL = process.env.NVIDIA_EMBED_MODEL || "nvidia/nemotron-3-embed-1b";

if (!SUPABASE_URL || !SERVICE_KEY) die("Supabase env missing in .env.local");
if (!NVIDIA_KEY || !NVIDIA_KEY.startsWith("nvapi-")) die("NVIDIA_API_KEY missing in .env.local");

const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const EPERUSTEET_BASE = "https://eperusteet.opintopolku.fi/eperusteet-service/api/external";
const VOCATIONAL_TYPES = new Set(["koulutustyyppi_1", "koulutustyyppi_11", "koulutustyyppi_12"]);
/** Below this, a trigram "match" is more likely noise than a real degree-title correspondence. */
const OCCUPATION_SIMILARITY_FLOOR = 0.3;
/**
 * Candidates pulled per program before hub correction, and links kept after.
 *
 * The pool is deliberately much larger than the final cut: the correction below
 * needs to see how widely each skill matches across ALL programs, and it can
 * only see what the pool contains. Both numbers cost nothing extra in NVIDIA
 * quota — the embedding call already happened; this is a wider LIMIT on a
 * Postgres query.
 */
const CANDIDATE_POOL = 50;
const SKILLS_PER_PROGRAM = 10;
/**
 * How hard to penalise a skill for being close to many programs. 0 disables the
 * correction. Weight 1 (the skill's plain cross-program mean) turned out to be
 * too weak to matter: the penalty spread between a hub and a specialised skill
 * is only ~0.025, against a ~0.18 spread of similarities inside one program's
 * pool, so it only ever reordered near-ties. 3 puts the two on comparable
 * footing. Lower it if specialised qualifications start losing their obvious
 * matches; raise it if hub skills still dominate the frequency counts.
 *
 * The knob has a ceiling, though: it penalises breadth, and it cannot tell
 * spurious breadth ("huoltaa jalkineiden kokoonpanovälineitä" in 24 unrelated
 * programs) from real breadth ("ohjata ryhmätyötä", which genuinely does span
 * trades). Pushing it far enough to kill the former will start eating the
 * latter. Past that point the fix is better query text, not a bigger weight.
 */
const HUB_PENALTY = 3.0;
const EMBED_BATCH = 32;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------- ePerusteet fetch
async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`giving up on ${url} after ${attempt} attempts (${res.status})`);
    const wait = 2000 * 2 ** (attempt - 1);
    console.log(`    ${res.status} on ${url} — waiting ${wait / 1000}s then retrying`);
    await sleep(wait);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} on ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function fetchVocationalList() {
  const out = [];
  for (let page = 0; ; page++) {
    const json = await fetchJson(`${EPERUSTEET_BASE}/perusteet?sivu=${page}&sivukoko=50`);
    out.push(...json.data.filter((p) => VOCATIONAL_TYPES.has(p.koulutustyyppi)));
    if ((page + 1) * 50 >= json.kokonaismäärä) break;
    await sleep(150); // be polite to a public gov API
  }
  return out;
}

/**
 * Drop the existing links for the programs about to be rewritten.
 *
 * This import recomputes a program's links from scratch every run, so upsert
 * alone is not enough: it refreshes the rows it writes but leaves behind rows
 * from an earlier run that the current matching no longer produces. Those
 * stale links accumulate silently — the first full import left ~117 of them
 * after a partially-timed-out earlier attempt, and they are indistinguishable
 * from current results once in the table.
 */
async function clearLinks(table, programIds, column = "program_id") {
  for (let i = 0; i < programIds.length; i += 100) {
    const { error } = await db
      .from(table)
      .delete()
      .in(column, programIds.slice(i, i + 100));
    if (error) die(`clearing ${table} failed: ${error.message}`);
  }
}

/**
 * Re-rank each program's candidate pool so that skills which match EVERYTHING
 * stop winning, and keep the top SKILLS_PER_PROGRAM of what survives.
 *
 * The problem this solves, measured on the first full import: a handful of very
 * specific ESCO skills ("huoltaa jalkineiden kokoonpanovälineitä" — maintain
 * footwear assembly tools) were linked to 40-75 of the 328 qualifications, and
 * not as filler at the bottom of the list — several ranked FIRST for some
 * program. Neither a similarity floor nor a rank cut removes them, because the
 * problem is that they genuinely score high against almost any query.
 *
 * That is hubness: in a high-dimensional embedding space some points sit close
 * to the centre of the distribution and therefore turn up among the nearest
 * neighbours of a disproportionate share of queries, regardless of meaning. It
 * bites hardest here because the query is a long prose qualification summary,
 * whose vector lands near the average of all Finnish vocational text — and the
 * nearest neighbours of an average vector are hubs, not matches.
 *
 * The correction is CSLS (cross-domain similarity local scaling), reduced to
 * what a batch import can do for free: every program's candidates are already
 * in hand, so each skill's mean similarity ACROSS PROGRAMS is computable
 * without another API call. Score each pairing by
 *
 *     similarity(program, skill) - HUB_PENALTY * mean similarity(skill, ALL
 *     programs, absences imputed at the pool cut-off)
 *
 * A skill that is close to everything carries a large penalty; one that is
 * close to only a few programs carries almost none, so genuinely specific
 * matches rise and hubs fall. The penalty is estimated from the candidate
 * pools, not the whole 14k-row table — a skill absent from every pool is not
 * a hub by definition, so its unseen mean cannot change the ranking.
 *
 * The stored `similarity` stays the raw cosine: it is what the column
 * documents, and the corrected score is a ranking device, not a measure of
 * how close the two texts actually are.
 */
function correctForHubs(pools) {
  const programCount = pools.size;
  if (programCount === 0) return [];

  // A skill missing from a program's pool did not score zero there — it scored
  // somewhere below that pool's cut-off. Averaging only over the pools a skill
  // DOES appear in silently averages over its best matches, which inverts the
  // whole correction: a specialised skill matching three programs at 0.62 ends
  // up penalised harder than a hub matching a hundred at 0.52. So absences are
  // imputed at the mean cut-off and the mean is taken over EVERY program, which
  // is what makes breadth itself the thing being penalised.
  let cutoffSum = 0;
  for (const candidates of pools.values()) {
    cutoffSum += candidates.length ? candidates[candidates.length - 1].similarity : 0;
  }
  const impliedFloor = cutoffSum / programCount;

  const stats = new Map(); // skill_uri -> { sum, n }
  for (const candidates of pools.values()) {
    for (const c of candidates) {
      const stat = stats.get(c.skill_uri) ?? { sum: 0, n: 0 };
      stat.sum += c.similarity;
      stat.n += 1;
      stats.set(c.skill_uri, stat);
    }
  }

  const penalty = new Map();
  for (const [uri, stat] of stats) {
    const imputed = stat.sum + (programCount - stat.n) * impliedFloor;
    penalty.set(uri, imputed / programCount);
  }

  const links = [];
  for (const [programId, candidates] of pools) {
    const scored = candidates.map((c) => ({
      ...c,
      adjusted: c.similarity - HUB_PENALTY * penalty.get(c.skill_uri),
    }));
    scored.sort((a, b) => b.adjusted - a.adjusted);
    for (const c of scored.slice(0, SKILLS_PER_PROGRAM)) {
      links.push({ program_id: programId, skill_uri: c.skill_uri, similarity: c.similarity });
    }
  }
  return dedupeByKey(links, (l) => `${l.program_id}\u0000${l.skill_uri}`);
}

/**
 * Collapse rows sharing a composite primary key, keeping the strongest match.
 *
 * Needed because Postgres refuses an upsert whose batch names the same
 * conflict target twice ("ON CONFLICT DO UPDATE command cannot affect row a
 * second time") — it will not silently pick a winner. That happens here
 * routinely: one qualification carries several tutkintonimikkeet that resolve
 * to the SAME ESCO occupation, so (program_id, occupation_uri) repeats. The
 * per-title dedupe upstream only catches identical LABELS, not identical
 * resolved URIs.
 */
function dedupeByKey(rows, key) {
  const best = new Map();
  for (const row of rows) {
    const k = key(row);
    const prev = best.get(k);
    if (!prev || row.similarity > prev.similarity) best.set(k, row);
  }
  return Array.from(best.values());
}

/**
 * Fail loudly, with evidence, if a batch still carries a repeated primary key.
 * Postgres's "cannot affect row a second time" names neither the table nor the
 * offending values, so catching it here — with the raw values and their JS
 * types printed — turns a dead end into a diagnosis.
 */
function assertUniqueKeys(rows, key, table) {
  const seen = new Map();
  const dupes = [];
  for (const row of rows) {
    const k = key(row);
    if (seen.has(k)) dupes.push([seen.get(k), row]);
    else seen.set(k, row);
  }
  if (dupes.length === 0) return;
  console.error(`\n  ${dupes.length} duplicate key(s) still present for ${table}:`);
  for (const [a, b] of dupes.slice(0, 5)) {
    console.error("    A:", JSON.stringify(a), "types:", Object.entries(a).map(([k2, v]) => `${k2}=${typeof v}`).join(" "));
    console.error("    B:", JSON.stringify(b), "types:", Object.entries(b).map(([k2, v]) => `${k2}=${typeof v}`).join(" "));
  }
  die(`${table}: duplicate primary keys survived dedupe (see above)`);
}

/** Strips the light HTML (<p>, <dl>, <b>, etc.) ePerusteet embeds in rich-text fields. */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- main
async function main() {
  console.log("\n  Fetching vocational qualification list...");
  const list = await fetchVocationalList().then((l) => l.slice(0, LIMIT));
  console.log(`  ${list.length} vocational qualification(s) to import\n`);

  const programs = [];
  for (const [i, entry] of list.entries()) {
    const detail = await fetchJson(`${EPERUSTEET_BASE}/peruste/${entry.id}`);
    const titles = (detail.tutkintonimikkeet ?? [])
      .map((t) => ({ en: t.nimi?.en, fi: t.nimi?.fi }))
      .filter((t) => t.en || t.fi);
    const skillText = [
      detail.nimi?.fi,
      stripHtml(detail.tyotehtavatJoissaVoiToimia?.fi),
      stripHtml(detail.suorittaneenOsaaminen?.fi),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 3000);

    programs.push({
      id: entry.id,
      koulutustyyppi: entry.koulutustyyppi,
      name_fi: entry.nimi.fi,
      name_en: entry.nimi.en ?? null,
      name_sv: entry.nimi.sv ?? null,
      diaarinumero: entry.diaarinumero ?? null,
      titles,
      skillText,
    });

    console.log(`  ${String(i + 1).padStart(4)} / ${list.length}  ${entry.nimi.fi}`);
    await sleep(150);
  }

  // ---- upsert program rows ----
  console.log("\n  Upserting education_programs...");
  const { error: progErr } = await db.from("education_programs").upsert(
    programs.map((p) => ({
      id: p.id,
      koulutustyyppi: p.koulutustyyppi,
      name_fi: p.name_fi,
      name_en: p.name_en,
      name_sv: p.name_sv,
      diaarinumero: p.diaarinumero,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" }
  );
  if (progErr) die(`education_programs upsert failed: ${progErr.message}`);

  // ---- occupation matching (trigram, no NVIDIA quota) ----
  console.log("  Matching degree titles to ESCO occupations...");
  let occLinks = [];
  for (const p of programs) {
    const seenLabels = new Set();
    for (const title of p.titles) {
      const query = title.en || title.fi;
      const dedupeKey = query.toLowerCase();
      if (seenLabels.has(dedupeKey)) continue;
      seenLabels.add(dedupeKey);

      const { data, error } = await db.rpc("search_occupations_fuzzy", {
        p_query: query,
        p_locale: title.en ? "en" : "fi",
        p_limit: 1,
      });
      if (error) { console.log(`    RPC error for "${query}": ${error.message}`); continue; }
      const best = data?.[0];
      if (best && best.similarity >= OCCUPATION_SIMILARITY_FLOOR) {
        occLinks.push({
          program_id: p.id,
          occupation_uri: best.concept_uri,
          source_label: query,
          similarity: best.similarity,
        });
      }
    }
  }
  const occRaw = occLinks.length;
  occLinks = dedupeByKey(occLinks, (l) => `${l.program_id}\u0000${l.occupation_uri}`);
  console.log(`  ${occLinks.length} program-occupation link(s) found (${occRaw} before dedupe)`);
  assertUniqueKeys(occLinks, (l) => `${l.program_id}\u0000${l.occupation_uri}`, "education_program_occupations");
  await clearLinks("education_program_occupations", programs.map((p) => p.id));
  for (let i = 0; i < occLinks.length; i += 500) {
    const { error } = await db
      .from("education_program_occupations")
      .upsert(occLinks.slice(i, i + 500), { onConflict: "program_id,occupation_uri" });
    if (error) die(`education_program_occupations upsert failed (slice ${i}-${i + 500}): ${error.message}`);
  }

  // ---- skill matching (embeddings, batched to conserve NVIDIA quota) ----
  console.log("\n  Embedding qualification competence summaries...");
  const embeddable = programs.filter((p) => p.skillText.length > 0);
  const vectors = new Map();
  for (let i = 0; i < embeddable.length; i += EMBED_BATCH) {
    const batch = embeddable.slice(i, i + EMBED_BATCH);
    const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NVIDIA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: batch.map((p) => p.skillText),
        input_type: "passage",
        encoding_format: "float",
        truncate: "END",
      }),
    });
    if (!res.ok) die(`embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    for (const row of json.data) vectors.set(batch[row.index].id, row.embedding);
    console.log(`    ${Math.min(i + EMBED_BATCH, embeddable.length)} / ${embeddable.length}`);
    if (i + EMBED_BATCH < embeddable.length) await sleep(1800);
  }

  console.log("\n  Matching competence summaries to ESCO skills...");
  const pools = new Map(); // program id -> [{ skill_uri, similarity }]
  for (const p of embeddable) {
    const vector = vectors.get(p.id);
    if (!vector) continue;
    const { data, error } = await db.rpc("match_skills_semantic", {
      p_embedding: `[${vector.join(",")}]`,
      p_limit: CANDIDATE_POOL,
      p_min_similarity: 0,
    });
    if (error) { console.log(`    RPC error for program ${p.id}: ${error.message}`); continue; }
    pools.set(
      p.id,
      (data ?? []).map((s) => ({ skill_uri: s.concept_uri, similarity: s.similarity }))
    );
  }

  let skillLinks = correctForHubs(pools);
  console.log(`  ${skillLinks.length} program-skill link(s) after hub correction`);
  assertUniqueKeys(skillLinks, (l) => `${l.program_id}\u0000${l.skill_uri}`, "education_program_skills");
  await clearLinks("education_program_skills", programs.map((p) => p.id));
  for (let i = 0; i < skillLinks.length; i += 500) {
    const { error } = await db
      .from("education_program_skills")
      .upsert(skillLinks.slice(i, i + 500), { onConflict: "program_id,skill_uri" });
    if (error) die(`education_program_skills upsert failed: ${error.message}`);
  }

  console.log(
    `\n  Done. ${programs.length} program(s), ${occLinks.length} occupation link(s), ${skillLinks.length} skill link(s).\n`
  );
}

main().catch((err) => die(err.message));
