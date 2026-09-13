/**
 * Fill skill_query_embeddings — the skill text embedded as a QUERY.
 *
 *   node scripts/backfill-skill-query-embeddings.mjs
 *   node scripts/backfill-skill-query-embeddings.mjs --limit 200   # smoke test
 *
 * Same text as backfill-skill-embeddings.mjs writes to embedding_fi (label,
 * alt labels, description), embedded with input_type "query" instead of
 * "passage" and truncated to 512 dimensions. 0014 explains why both vectors
 * have to exist: the app searches FOR skills, the education import searches
 * FROM them, and an asymmetric model puts those in different places. 0015
 * explains why they live in their own table rather than a column on skills.
 *
 * Resumable and cached. Skills that already have a vector are skipped, and
 * every vector is appended to .cache/skill-query-embeddings.jsonl the moment it
 * arrives, so a failure anywhere downstream costs no quota to retry.
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const BASE = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_EMBED_MODEL || "nvidia/nemotron-3-embed-1b";
const KEY = process.env.NVIDIA_API_KEY;
if (!KEY?.startsWith("nvapi-")) die("NVIDIA_API_KEY missing in .env.local");

const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const CACHE = ".cache/skill-query-embeddings.jsonl";
const STORE_DIMS = 512;
const BATCH = 32;
const PAUSE = 1800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashOf = (t) => createHash("sha1").update(t).digest("hex");

/** Exactly the text backfill-skill-embeddings.mjs builds, so both vectors describe the same thing. */
function skillText(row) {
  const label = row.preferred_label_fi || row.preferred_label_en || "";
  const alts = (row.alt_labels_fi || row.alt_labels_en || "")
    .split(/[\n|;,]/).map((s) => s.trim()).filter(Boolean).slice(0, 6).join(", ");
  const desc = (row.description_fi || row.description_en || "").slice(0, 600);
  return [label, alts, desc].filter(Boolean).join("\n").trim();
}

function loadCache() {
  const cache = new Map();
  if (!existsSync(CACHE)) return cache;
  for (const line of readFileSync(CACHE, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const { h, v } = JSON.parse(line);
      const buf = Buffer.from(v, "base64");
      const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
      cache.set(h, `[${f.subarray(0, STORE_DIMS).join(",")}]`);
    } catch {
      // Half-written last line after a kill; skip.
    }
  }
  return cache;
}

// ---- rows still needing a vector -------------------------------------------
const done = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("skill_query_embeddings")
    .select("concept_uri")
    .order("concept_uri")
    .range(from, from + 999);
  if (error) die(`reading skill_query_embeddings failed: ${error.message}`);
  if (!data?.length) break;
  for (const r of data) done.add(r.concept_uri);
  if (data.length < 1000) break;
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("skills")
    .select("concept_uri, preferred_label_fi, preferred_label_en, alt_labels_fi, alt_labels_en, description_fi, description_en")
    .not("embedding_fi", "is", null)
    .order("concept_uri")
    .range(from, from + 999);
  if (error) die(`reading skills failed: ${error.message}`);
  if (!data?.length) break;
  for (const r of data) if (!done.has(r.concept_uri)) rows.push(r);
  if (data.length < 1000) break;
}
if (done.size) console.log(`\n  ${done.size} skill(s) already have a query vector`);
const targets = rows.slice(0, LIMIT);
if (targets.length === 0) {
  console.log("\n  Nothing to do — every embedded skill already has a query vector.\n");
  process.exit(0);
}

const cache = loadCache();
const texts = targets.map(skillText);
const missing = [...new Set(texts.filter((t) => t && !cache.has(hashOf(t))))];
console.log(`\n  ${targets.length} skill(s) to fill, ${missing.length} still need embedding\n`);

mkdirSync(".cache", { recursive: true });
for (let i = 0; i < missing.length; i += BATCH) {
  const batch = missing.slice(i, i + BATCH);
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: batch, input_type: "query", encoding_format: "float", truncate: "END" }),
  });
  if (!res.ok) die(`embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();

  let lines = "";
  for (const row of json.data) {
    const text = batch[row.index];
    const f = new Float32Array(row.embedding);
    lines += JSON.stringify({ h: hashOf(text), v: Buffer.from(f.buffer).toString("base64") }) + "\n";
    cache.set(hashOf(text), `[${row.embedding.slice(0, STORE_DIMS).join(",")}]`);
  }
  appendFileSync(CACHE, lines);

  if (i % (BATCH * 20) === 0 || i + BATCH >= missing.length) {
    console.log(`    embedded ${Math.min(i + BATCH, missing.length)} / ${missing.length}`);
  }
  if (i + BATCH < missing.length) await sleep(PAUSE);
}

// ---- write them back --------------------------------------------------------
// 200 at a time is fine here and 25 was not on skills: skill_query_embeddings
// has no vector index, so a write costs a heap insert instead of an HNSW one.
// That difference is the whole reason for the separate table (0015).
const WRITE_BATCH = 200;
console.log(`\n  Writing ${targets.length} vector(s)...`);
let written = 0;
for (let i = 0; i < targets.length; i += WRITE_BATCH) {
  const slice = targets.slice(i, i + WRITE_BATCH).map((r, j) => ({
    concept_uri: r.concept_uri,
    embedding: cache.get(hashOf(texts[i + j])) ?? null,
  })).filter((r) => r.embedding);
  if (slice.length === 0) continue;
  const { error } = await db.from("skill_query_embeddings").upsert(slice, { onConflict: "concept_uri" });
  if (error) {
    die(
      `writing skill_query_embeddings failed after ${written}: ${error.message}\n` +
        "  Vectors are cached and written rows are skipped, so just run it again; " +
        "lower WRITE_BATCH if it keeps timing out."
    );
  }
  written += slice.length;
  if (i % 2000 === 0 || i + WRITE_BATCH >= targets.length) {
    console.log(`    ${written} / ${targets.length} written`);
  }
}

console.log(`\n  Done. ${written} query vector(s).\n`);
