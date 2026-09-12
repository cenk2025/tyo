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
const SKILLS_PER_PROGRAM = 15;
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
  console.log(`  ${occLinks.length} program-occupation link(s) found`);
  for (let i = 0; i < occLinks.length; i += 500) {
    const { error } = await db
      .from("education_program_occupations")
      .upsert(occLinks.slice(i, i + 500), { onConflict: "program_id,occupation_uri" });
    if (error) die(`education_program_occupations upsert failed: ${error.message}`);
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
  let skillLinks = [];
  for (const p of embeddable) {
    const vector = vectors.get(p.id);
    if (!vector) continue;
    const { data, error } = await db.rpc("match_skills_semantic", {
      p_embedding: `[${vector.join(",")}]`,
      p_limit: SKILLS_PER_PROGRAM,
      p_min_similarity: 0,
    });
    if (error) { console.log(`    RPC error for program ${p.id}: ${error.message}`); continue; }
    for (const s of data ?? []) {
      skillLinks.push({ program_id: p.id, skill_uri: s.concept_uri, similarity: s.similarity });
    }
  }
  console.log(`  ${skillLinks.length} program-skill link(s) found`);
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
