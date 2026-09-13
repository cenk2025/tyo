/**
 * Import Finnish vocational qualifications from ePerusteet (Opetushallitus's
 * public curriculum API, no auth) and link them to ESCO occupations/skills.
 *
 *   node scripts/import-education-programs.mjs                 # all ~328
 *   node scripts/import-education-programs.mjs --limit 10       # smoke test
 *   node scripts/import-education-programs.mjs --relink-only    # free re-link
 *
 * A FULL re-import of the units runs in two passes, because the HNSW index on
 * education_program_units cannot be in place while 23k vectors are loaded (per
 * insert graph maintenance times the load out) and must be in place before the
 * linking step (14,257 sequential scans do not finish). In the SQL editor and
 * the shell, in this order:
 *
 *   drop index if exists idx_epu_embedding_hnsw;
 *   node scripts/import-education-programs.mjs --skip-link
 *   create index idx_epu_embedding_hnsw on public.education_program_units
 *     using hnsw (embedding halfvec_cosine_ops);
 *   node scripts/import-education-programs.mjs --relink-only
 *
 * Embeddings are cached in .cache/unit-embeddings.jsonl as they arrive, so a
 * failure anywhere after them — and there have been several — costs no quota to
 * retry. Delete that file to force re-embedding.
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
 *   - skills: each tutkinnon osa is embedded and stored in
 *     education_program_units, and the link table is then built by asking, for
 *     every ESCO skill, which osat are nearest to IT (link_skills_to_units,
 *     0011). The obvious direction — each osa's nearest skills — was tried
 *     twice and does not work: 42% of skills never enter any osa's candidate
 *     list while a few enter a third of them. 0011's header has the numbers.
 *
 * --relink-only skips the ePerusteet fetch and the embedding entirely and
 * re-runs just the linking step over the units already stored. Changing
 * PROGRAMS_PER_SKILL or MIN_SIMILARITY costs nothing that way; a full run
 * spends ~266 embedding requests of a free-tier quota to arrive at the same
 * vectors.
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
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

/**
 * Re-link from the units already in the database instead of fetching and
 * embedding them again. The embeddings are the expensive part and they do not
 * change between runs; the linking parameters are what actually gets tuned, and
 * a tuning loop that costs a quarter of a day's free quota is a tuning loop
 * nobody runs enough times to learn anything from.
 */
const RELINK_ONLY = args.includes("--relink-only");
/**
 * Stop after storing the units, before linking.
 *
 * The two halves want opposite things from the HNSW index on
 * education_program_units: loading 23k vectors wants it GONE (maintaining the
 * graph per insert is what makes a bulk load time out — the same lesson 0010
 * learned on skills.embedding_fi), and linking cannot run without it (14,257
 * sequential scans do not finish). pgvector's own advice is load first, index
 * after, so the import runs in two passes with the index rebuilt between them.
 * See the header for the exact sequence.
 */
const SKIP_LINK = args.includes("--skip-link");

/**
 * Embedded texts, cached on disk, keyed by a hash of the text.
 *
 * Three runs in a row have now spent the full embedding quota and then died
 * before the vectors reached Postgres — on a duplicate key, on a stale schema
 * cache, on a statement timeout. The vectors were correct every time; only the
 * write failed. Appending each one to a local file as it arrives means the next
 * attempt costs nothing, and it makes re-running after ANY downstream failure
 * cheap enough to stop being a reason not to try something.
 */
const EMBED_CACHE = ".cache/unit-embeddings.jsonl";

const EPERUSTEET_BASE = "https://eperusteet.opintopolku.fi/eperusteet-service/api/external";
const VOCATIONAL_TYPES = new Set(["koulutustyyppi_1", "koulutustyyppi_11", "koulutustyyppi_12"]);
/** Below this, a trigram "match" is more likely noise than a real degree-title correspondence. */
const OCCUPATION_SIMILARITY_FLOOR = 0.3;
/**
 * How many qualifications each skill may point at, and how many osat are looked
 * at before collapsing them to qualifications.
 *
 * These two are what make hubness structurally impossible rather than merely
 * penalised: a skill contributes at most PROGRAMS_PER_SKILL links, so no skill
 * can appear under 170 qualifications however central its vector is. The old
 * direction had no such ceiling — a hub simply won every pool it entered.
 *
 * 8 rather than 3 because a skill is genuinely taught in more than three
 * trades, and because the page ranks qualifications by how much of their
 * content the overlap is (0018), not by raw link counts — so the extra recall
 * is sorted out at read time rather than showing up as noise. At 3, two of the
 * five electrical skills checked by hand never reached the electrical
 * qualification at all.
 *
 * UNIT_PROBE is larger than PROGRAMS_PER_SKILL because a skill's nearest osat
 * are frequently several osat of the SAME qualification (a qualification
 * teaching cable work has several units about cable work). Probing 40 and then
 * collapsing leaves room for three DISTINCT qualifications to survive.
 */
const numArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : fallback;
};
// Overridable from the command line, because with the index in memory a full
// re-link takes under a minute and these are the numbers actually worth trying
// several values of: `--relink-only --k 8 --min-sim 0.45`.
const PROGRAMS_PER_SKILL = numArg("--k", 8);
const UNIT_PROBE = numArg("--probe", 40);
/**
 * Cosine floor below which a skill's best osa is not a match at all.
 *
 * Every skill gets a nearest osa whether or not it has anything to do with
 * Finnish vocational education — ESCO carries neuroanatomy and Estonian
 * comprehension, and no tutkinto teaches either. The floor is what keeps those
 * out. 0.40 sits below the 0.5-0.8 band of the matches that were checked by
 * hand and above the ~0.38 where unrelated Finnish text starts scoring.
 */
const MIN_SIMILARITY = numArg("--min-sim", 0.4);
/**
 * Added to a candidate's score when a unit names the skill outright (0016).
 *
 * A bonus rather than an override: a rare term is strong evidence, not proof,
 * and a qualification should still have to beat the others. 0.25 is roughly
 * twice the spread between the top candidates of a typical skill, so a lexical
 * hit reliably outranks a near-tie without erasing a much stronger vector match.
 */
const LEX_BONUS = numArg("--lex-bonus", 0.25);
/**
 * Skills per link_skills_to_units call, and the floor it may back off to.
 *
 * A vector lookup is 1.9 ms once the index fits in memory (0013), but the
 * lexical arm added in 0016 costs far more and varies per skill — a trigram
 * bitmap scan measured 119 ms cold for two prefixes, and skills carry up to
 * three. That put 500 right on the statement-timeout boundary: the same batch
 * size succeeded one minute and failed the next, which is the worst place to
 * sit. So the loop halves the batch and retries when it sees a timeout instead
 * of dying, and starts low enough that it rarely needs to.
 */
const SKILL_BATCH = numArg("--batch", 200);
const MIN_SKILL_BATCH = 25;
/**
 * Dimensions actually stored in Postgres, out of the model's 2048.
 *
 * The model is Matryoshka-trained, so the first 512 dimensions are a usable
 * embedding on their own — scripts/probe-truncation.mjs measures recall@20 of
 * 0.866 against the full vector, at a quarter of the distance cost. 0013 has
 * the reasoning and the rest of the table.
 *
 * The FULL vectors stay in .cache/unit-embeddings.jsonl, so changing this
 * number is a re-upload, not a re-embedding.
 */
const STORE_DIMS = 512;
/**
 * Requirements per embedded chunk, and the character cap on one.
 *
 * A <b> group in ePerusteet is usually 4-12 requirements; the cap only splits
 * the unusually long ones. Both numbers trade specificity against context: one
 * requirement per vector would match individual ESCO skills most sharply but
 * strips the surrounding trade ("rakentaa johtotiet" alone could be roading),
 * while a whole osa is the 3,000-character blob this replaces.
 */
const ITEMS_PER_CHUNK = 8;
const CHUNK_CHARS = 2000;
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

/**
 * The units of a qualification, each as one embeddable text.
 *
 * Matching one summary per qualification was too coarse to be useful: the
 * summary is written in institutional abstractions ("osaa toimia turvallisesti
 * sahkoasennuksia sisaltavissa tyotehtavissa"), so the ESCO skills it retrieved
 * were abstractions too. Measured on a real learning list, 28 of 30 concrete
 * electrician skills — fitting sockets, joining cables, testing equipment —
 * had no qualification linked at all.
 *
 * A tutkinnon osa is where the concrete work is written down. Embedding at that
 * level costs about 7,200 texts across all qualifications (~225 requests),
 * against ~72,000 for every individual requirement line, and each osa is still
 * a single coherent topic rather than a whole trade.
 */
async function fetchOsaTexts(perusteId) {
  let body;
  try {
    body = await fetchJson(`${EPERUSTEET_BASE}/peruste/${perusteId}/tutkinnonosat`);
  } catch {
    return [];
  }
  const arr = Array.isArray(body) ? body : body.data ?? [];
  const out = [];
  for (const osa of arr) {
    // osa_id identifies the unit within its qualification, so a unit without
    // one cannot be stored idempotently and is skipped rather than duplicated.
    const id = osa.id ?? osa.osaId ?? null;
    if (id == null) continue;
    const title = osa.nimi?.fi ?? "";
    for (const chunk of osaChunks(osa.ammattitaitovaatimukset?.fi, title)) {
      out.push({ id, title, ...chunk });
    }
  }
  return out;
}

/**
 * Split one osa's ammattitaitovaatimukset into embeddable requirement groups.
 *
 * ePerusteet writes them as a <b> heading followed by the requirements that sit
 * under it, repeated for each area of competence:
 *
 *   <b>Opiskelija tekee pien- ja pienoisjännitesähköasennukset</b>
 *     <dd style="display: list-item;">toteuttaa ... pistorasioiden kytkennät</dd>
 *     <dd style="display: list-item;">rakentaa johtotiet</dd>
 *
 * so the headings are the boundaries and no heuristic is needed to find them.
 * Each group carries the osa title as well, because a heading on its own
 * ("Opiskelija valmistautuu asennuksiin") says nothing about which trade.
 *
 * Note the <dd>: this document type uses a definition list styled as a bulleted
 * one and contains no <li> at all. Looking only for <li>, as this function did
 * originally, silently produced one unsplit blob per osa — which is how the
 * perustutkinto ended up with 7 skills against its ammattitutkinto's 198.
 */
function osaChunks(html, title) {
  if (!html) return [];

  const groups = [];
  // Splitting on the opening tag keeps each heading with the items that follow
  // it; parts[0] is whatever precedes the first heading, usually nothing.
  const parts = html.split(/<b[^>]*>/i);
  for (const part of parts.slice(1)) {
    const close = part.search(/<\/b>/i);
    const heading = close >= 0 ? stripHtml(part.slice(0, close)) : "";
    const items = listItems(close >= 0 ? part.slice(close + 4) : part);
    if (heading || items.length) groups.push({ heading, items });
  }

  // Documents that use no headings at all still have to yield something: their
  // items, or failing that the whole stripped text as one group.
  if (groups.length === 0) {
    const items = listItems(html);
    const whole = stripHtml(html);
    if (items.length) groups.push({ heading: "", items });
    else if (whole) groups.push({ heading: "", items: [whole] });
  }

  const chunks = [];
  for (const g of groups) {
    // A group longer than ITEMS_PER_CHUNK is split further rather than
    // truncated — losing the tail of a long group loses exactly the specific
    // requirements this whole change exists to expose.
    const slices = g.items.length ? [] : [[]];
    for (let i = 0; i < g.items.length; i += ITEMS_PER_CHUNK) {
      slices.push(g.items.slice(i, i + ITEMS_PER_CHUNK));
    }
    for (const slice of slices) {
      const text = [title, g.heading, ...slice].filter(Boolean).join("\n").slice(0, CHUNK_CHARS);
      if (text.length > 20) chunks.push({ heading: g.heading, text });
    }
  }
  return chunks.map((c, i) => ({ ...c, chunkIndex: i }));
}

/**
 * The individual requirements inside a group. Both markups appear across
 * ePerusteet's document types — <dd> in the vocational qualifications read so
 * far, <li> elsewhere — and matching either costs nothing.
 */
function listItems(html) {
  if (!html) return [];
  return [...html.matchAll(/<(dd|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => stripHtml(m[2]))
    .filter((t) => t.length > 3);
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


/**
 * Embed every tutkinnon osa and store it, vector included, in
 * education_program_units.
 *
 * The vectors are kept rather than consumed because the linking query runs
 * inside Postgres, next to the skill vectors — 14,257 nearest-neighbour lookups
 * is not something to route through this script one HTTP request at a time.
 * Keeping them also makes --relink-only possible.
 */
/** Load the on-disk embedding cache: text hash -> pgvector literal. */
function loadEmbedCache() {
  const cache = new Map();
  if (!existsSync(EMBED_CACHE)) return cache;
  for (const line of readFileSync(EMBED_CACHE, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const { h, v } = JSON.parse(line);
      // float32 as base64 rather than a JSON array of 2048 numbers: about a
      // tenth the bytes, and this file holds ~11k of them.
      const buf = Buffer.from(v, "base64");
      const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
      cache.set(h, `[${f.subarray(0, STORE_DIMS).join(",")}]`);
    } catch {
      // A half-written last line after a kill is expected; skip it.
    }
  }
  return cache;
}

const hashOf = (text) => createHash("sha1").update(text).digest("hex");

async function storeUnits(units) {
  // One row per (programme, unit, chunk), deduped on exactly the key the table
  // is unique on — Postgres refuses an upsert batch naming the same conflict
  // target twice, and the same osa occasionally appears twice in a peruste.
  const rows = new Map();
  for (const u of units) {
    rows.set(`${u.programId}::${u.osaId}::${u.chunkIndex}`, {
      osa_id: u.osaId,
      program_id: u.programId,
      chunk_index: u.chunkIndex,
      title_fi: u.title,
      heading: u.heading,
      body: u.text,
    });
  }
  if (rows.size < units.length) {
    console.log(`  ${units.length - rows.size} repeated (programme, unit, chunk) row(s) collapsed`);
  }

  // ePerusteet's yhteiset tutkinnon osat are shared records, so the same
  // requirement group arrives under dozens of qualifications. Each distinct
  // text is embedded once and its vector attached to every row carrying it.
  const byText = new Map();
  for (const row of rows.values()) {
    const list = byText.get(row.body) ?? [];
    list.push(row);
    byText.set(row.body, list);
  }
  const texts = [...byText.keys()];

  const cache = loadEmbedCache();
  const missing = texts.filter((t) => !cache.has(hashOf(t)));
  console.log(
    `\n  ${rows.size} row(s), ${texts.length} distinct requirement group(s), ` +
      `${texts.length - missing.length} already embedded`
  );
  if (missing.length) console.log(`  Embedding ${missing.length} new group(s)...`);

  mkdirSync(".cache", { recursive: true });
  for (let i = 0; i < missing.length; i += EMBED_BATCH) {
    const batch = missing.slice(i, i + EMBED_BATCH);
    const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NVIDIA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: batch,
        input_type: "passage",
        encoding_format: "float",
        truncate: "END",
      }),
    });
    if (!res.ok) die(`embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();

    // Appended before anything else can fail. This line is the whole point of
    // the cache: whatever happens next, this batch is never paid for twice.
    let lines = "";
    for (const row of json.data) {
      const text = batch[row.index];
      const f = new Float32Array(row.embedding);
      // The cache keeps every dimension; only the database gets the truncation.
      lines += JSON.stringify({ h: hashOf(text), v: Buffer.from(f.buffer).toString("base64") }) + "\n";
      cache.set(hashOf(text), `[${row.embedding.slice(0, STORE_DIMS).join(",")}]`);
    }
    appendFileSync(EMBED_CACHE, lines);

    if (i % (EMBED_BATCH * 20) === 0 || i + EMBED_BATCH >= missing.length) {
      console.log(`    embedded ${Math.min(i + EMBED_BATCH, missing.length)} / ${missing.length}`);
    }
    if (i + EMBED_BATCH < missing.length) await sleep(1800);
  }

  console.log(`  Storing ${rows.size} unit row(s)...`);
  const list = [...rows.values()].map((r) => ({ ...r, embedding: cache.get(hashOf(r.body)) }));
  // 100 at a time: each row carries a 512-dimension vector serialised as text,
  // so the request body, not the row count, is what caps the batch.
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await db
      .from("education_program_units")
      .upsert(list.slice(i, i + 100), { onConflict: "program_id,osa_id,chunk_index" });
    if (error) {
      die(
        `education_program_units upsert failed after ${i} row(s): ${error.message}` +
          (error.message.includes("timeout")
            ? "\n  The HNSW index is probably still in place. Drop it, re-run with " +
              "--skip-link, rebuild it, then run --relink-only (see the header)."
            : "\n  The embeddings are cached, so re-running costs no quota.")
      );
    }
    if (i % 2000 === 0 || i + 100 >= list.length) {
      console.log(`    ${Math.min(i + 100, list.length)} / ${list.length} stored`);
    }
  }
  return list.length;
}

/**
 * Build education_program_skills by walking every embedded ESCO skill and
 * asking which tutkinnon osat are nearest to it.
 *
 * Batched because 14,257 nearest-neighbour lookups in a single statement is the
 * shape that hit the statement timeout in 0010; each call is sized to finish
 * comfortably and the loop just advances an offset.
 */
async function linkSkills() {
  const { count: total, error: countErr } = await db
    .from("skill_query_embeddings")
    .select("concept_uri", { count: "exact", head: true });
  if (countErr) die(`counting skill query vectors failed: ${countErr.message}`);
  if (!total) {
    die(
      "skill_query_embeddings is empty.\n" +
        "  Run scripts/backfill-skill-query-embeddings.mjs, then scripts/build-skill-anchors.mjs."
    );
  }

  console.log(
    `\n  Linking ${total} embedded skill(s) to their nearest tutkinnon osat ` +
      `(k=${PROGRAMS_PER_SKILL}, min-sim=${MIN_SIMILARITY}, probe=${UNIT_PROBE}, ` +
      `lex-bonus=${LEX_BONUS})...`
  );
  let written = 0;
  let batch = Math.max(SKILL_BATCH, MIN_SKILL_BATCH);
  let offset = 0;
  while (offset < total) {
    const { data, error } = await db.rpc("link_skills_to_units", {
      p_k: PROGRAMS_PER_SKILL,
      p_min_similarity: MIN_SIMILARITY,
      p_offset: offset,
      p_limit: batch,
      p_probe: UNIT_PROBE,
      p_lex_bonus: LEX_BONUS,
    });

    if (error) {
      // A timeout means this batch asked for more than one statement's worth of
      // work, not that anything is broken — halve it and ask again from the
      // same offset. Nothing was written, so there is nothing to undo.
      if (/timeout/i.test(error.message) && batch > MIN_SKILL_BATCH) {
        batch = Math.max(MIN_SKILL_BATCH, Math.floor(batch / 2));
        console.log(`    timed out at offset ${offset} — retrying with batch ${batch}`);
        continue;
      }
      die(`link_skills_to_units failed at offset ${offset} (batch ${batch}): ${error.message}`);
    }

    written += data ?? 0;
    offset += batch;
    console.log(`    ${Math.min(offset, total)} / ${total} skill(s), ${written} link(s)`);
  }
  return written;
}

// ---------------------------------------------------------------- main
async function main() {
  if (RELINK_ONLY) {
    const { count, error } = await db
      .from("education_program_units")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null);
    if (error) die(`reading education_program_units failed: ${error.message}`);
    if (!count) {
      die(
        "no embedded tutkinnon osat stored yet.\n  Run once without --relink-only to " +
          "fetch and embed them; every re-link after that is free."
      );
    }
    console.log(`\n  Re-linking from ${count} stored tutkinnon osa(t) — no fetch, no embedding.`);
    const { data: ids, error: idErr } = await db.from("education_programs").select("id");
    if (idErr) die(`reading education_programs failed: ${idErr.message}`);
    await clearLinks("education_program_skills", (ids ?? []).map((r) => r.id));
    const written = await linkSkills();
    console.log(`\n  Done. ${written} skill link(s) from ${count} osa(t).\n`);
    return;
  }

  console.log("\n  Fetching vocational qualification list...");
  const list = await fetchVocationalList().then((l) => l.slice(0, LIMIT));
  console.log(`  ${list.length} vocational qualification(s) to import\n`);

  const programs = [];
  for (const [i, entry] of list.entries()) {
    const detail = await fetchJson(`${EPERUSTEET_BASE}/peruste/${entry.id}`);
    const titles = (detail.tutkintonimikkeet ?? [])
      .map((t) => ({ en: t.nimi?.en, fi: t.nimi?.fi }))
      .filter((t) => t.en || t.fi);
    const osaTexts = await fetchOsaTexts(entry.id);

    programs.push({
      id: entry.id,
      koulutustyyppi: entry.koulutustyyppi,
      name_fi: entry.nimi.fi,
      name_en: entry.nimi.en ?? null,
      name_sv: entry.nimi.sv ?? null,
      diaarinumero: entry.diaarinumero ?? null,
      titles,
      osaTexts,
    });

    // One line per qualification is 328 lines of noise that hides the counts
    // the run is actually judged on; every 25th is enough to see it is alive.
    if ((i + 1) % 25 === 0 || i + 1 === list.length) {
      console.log(`  ${String(i + 1).padStart(4)} / ${list.length}  ${entry.nimi.fi}`);
    }
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

  // ---- skill matching, one text per tutkinnon osa ----
  const units = [];
  for (const p of programs) {
    for (const chunk of p.osaTexts) {
      units.push({
        programId: p.id,
        osaId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        title: chunk.title,
        heading: chunk.heading,
        text: chunk.text,
      });
    }
  }

  // Wholesale, like everything else here: a unit dropped or renumbered upstream
  // would otherwise linger with a stale vector and keep winning matches.
  await clearLinks("education_program_units", programs.map((p) => p.id));
  const storedUnits = await storeUnits(units);

  if (SKIP_LINK) {
    console.log(
      `\n  Done. ${programs.length} program(s), ${occLinks.length} occupation link(s), ` +
        `${storedUnits} requirement group(s) stored.\n\n` +
        "  Next: rebuild the vector index, then link.\n" +
        "    create index idx_epu_embedding_hnsw on public.education_program_units\n" +
        "      using hnsw (embedding halfvec_cosine_ops);\n" +
        "    node scripts/import-education-programs.mjs --relink-only\n"
    );
    return;
  }

  await clearLinks("education_program_skills", programs.map((p) => p.id));
  const skillLinkCount = await linkSkills();
  console.log(
    `  ${skillLinkCount} program-skill link(s) from ${storedUnits} requirement group(s)`
  );

  console.log(
    `\n  Done. ${programs.length} program(s), ${occLinks.length} occupation link(s), ${skillLinkCount} skill link(s).\n`
  );
}

main().catch((err) => die(err.message));
