/**
 * Backfill Finnish embeddings for ESCO skills.
 *
 *   node scripts/backfill-skill-embeddings.mjs                 # transversal only
 *   node scripts/backfill-skill-embeddings.mjs --all           # every skill
 *   node scripts/backfill-skill-embeddings.mjs --limit 200     # cap this run
 *
 * Idempotent and resumable: it only selects rows where embedding_fi is null,
 * so an interrupted run (or an exhausted free-tier quota) is continued simply
 * by running it again. Reads .env.local directly — no dotenv dependency.
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
const BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_EMBED_MODEL || "nvidia/nemotron-3-embed-1b";

if (!SUPABASE_URL || !SERVICE_KEY) die("Supabase env missing in .env.local");
if (!NVIDIA_KEY || !NVIDIA_KEY.startsWith("nvapi-")) die("NVIDIA_API_KEY missing in .env.local");

// ---------------------------------------------------------------- args
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const BATCH = 32;
// Free tier is roughly 40 requests/minute; stay well under it.
const PAUSE_MS = 1800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------- text
/**
 * What actually gets embedded. Label carries most of the signal; alt labels
 * add the synonyms a jobseeker is more likely to type than the official term;
 * a trimmed description disambiguates near-identical labels. English is the
 * fallback so a skill with no Finnish translation still gets a usable vector.
 */
function skillText(row) {
  const label = row.preferred_label_fi || row.preferred_label_en || "";
  const alts = (row.alt_labels_fi || row.alt_labels_en || "")
    .split(/[\n|;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  const desc = (row.description_fi || row.description_en || "").slice(0, 600);
  return [label, alts, desc].filter(Boolean).join("\n").trim();
}

// ---------------------------------------------------------------- embed
async function embedBatch(texts, attempt = 1) {
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NVIDIA_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
      input_type: "passage",
      encoding_format: "float",
      truncate: "END",
    }),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`giving up after ${attempt} attempts (${res.status})`);
    const wait = 2000 * 2 ** (attempt - 1);
    console.log(`    ${res.status} — waiting ${wait / 1000}s then retrying`);
    await sleep(wait);
    return embedBatch(texts, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = await res.json();
  if (!json.data || json.data.length !== texts.length) {
    throw new Error("short or malformed embeddings response");
  }
  const out = new Array(texts.length);
  for (const row of json.data) out[row.index] = row.embedding;
  return out;
}

// ---------------------------------------------------------------- fetch
/**
 * PostgREST caps a response at its default page size (1000) when the query
 * has no .range(), so a single unpaginated select silently truncates on a
 * table this size. Page through with .range() until a short page comes back.
 */
async function fetchAllTodo() {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from("skills")
      .select(
        "concept_uri, preferred_label_fi, preferred_label_en, alt_labels_fi, alt_labels_en, description_fi, description_en"
      )
      .is("embedding_fi", null)
      .order("concept_uri")
      .range(from, from + PAGE - 1);
    if (!ALL) query = query.eq("reuse_level", "transversal");

    const { data, error } = await query;
    if (error) die(`select failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// ---------------------------------------------------------------- main
async function main() {
  const rows = await fetchAllTodo();
  if (!rows.length) {
    console.log("\n  Nothing to do — every selected skill already has an embedding.\n");
    return;
  }

  const todo = rows.filter((r) => skillText(r).length > 0).slice(0, LIMIT);
  console.log(
    `\n  ${todo.length} skill(s) to embed  ·  model ${MODEL}  ·  batch ${BATCH}\n`
  );

  let done = 0;
  let dims = null;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const vectors = await embedBatch(slice.map(skillText));

    if (dims === null) {
      dims = vectors[0].length;
      console.log(`  vector dimensions: ${dims}\n`);
    }

    // One upsert call for the whole batch, not 32 concurrent single-row
    // UPDATEs. The Promise.all version sent 32 simultaneous writes that all
    // touched the same HNSW index at once, contending with each other for
    // index maintenance — THAT contention, not the index by itself, is what
    // turned into statement timeouts as the index grew during the original
    // backfill. concept_uri is the primary key, so this is a plain update in
    // upsert's clothing, atomic as one statement. pgvector wants the literal
    // '[a,b,c]' form for the column value.
    const rows = slice.map((row, j) => ({
      concept_uri: row.concept_uri,
      embedding_fi: `[${vectors[j].join(",")}]`,
    }));
    const { error } = await db.from("skills").upsert(rows, { onConflict: "concept_uri" });
    if (error) die(`update failed: ${error.message}`);

    done += slice.length;
    console.log(`  ${String(done).padStart(5)} / ${todo.length}`);
    if (i + BATCH < todo.length) await sleep(PAUSE_MS);
  }

  console.log(`\n  Done. ${done} embedding(s) written.\n`);
}

main().catch((err) => die(err.message));
