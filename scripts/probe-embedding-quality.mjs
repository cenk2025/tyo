/**
 * Does this embedding model actually rank Finnish skill phrases correctly?
 *
 *   node scripts/probe-embedding-quality.mjs
 *
 * The absolute cosine value of any single pair means little — models differ in
 * how wide a range they use. What matters for retrieval is SEPARATION: does the
 * right candidate score higher than the wrong ones? Each case below has one
 * intended match hidden among distractors, and the run passes only if the
 * intended one comes first.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const key = process.env.NVIDIA_API_KEY;
const model = process.env.NVIDIA_EMBED_MODEL || "nvidia/nemotron-3-embed-1b";
const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
if (!key) { console.error("\n  NVIDIA_API_KEY missing\n"); process.exit(1); }

/** Stand-ins for ESCO skill rows, phrased the way ESCO actually phrases them. */
const CANDIDATES = [
  "käsitellä maksutapahtumia — ottaa vastaan maksuja, antaa vaihtorahaa ja käyttää kassajärjestelmää",
  "ylläpitää asiakassuhteita — rakentaa pitkäaikaista luottamusta asiakkaiden kanssa",
  "johtaa tiimiä — organisoida työnjakoa ja tukea työntekijöiden kehittymistä",
  "pitää kirjanpitoa — kirjata liiketapahtumia ja täsmäyttää tilejä",
  "hitsata metallia — liittää metalliosia kaarihitsauksella",
  "analysoida dataa — tulkita numeerista aineistoa ja tunnistaa säännönmukaisuuksia",
  "hoitaa lapsia — huolehtia lasten turvallisuudesta ja päivittäisistä tarpeista",
  "kirjoittaa ohjelmakoodia — toteuttaa ohjelmistoja ohjelmointikielillä",
];

/** Free text as a jobseeker would type it → the candidate it should retrieve. */
const CASES = [
  ["olin kassalla ruokakaupassa", 0],
  ["vastasin viiden hengen porukasta", 2],
  ["tein tilinpäätöksiä pienelle firmalle", 3],
  ["olen ollut lastenhoitajana naapurin perheessä", 6],
  ["rakennan verkkosovelluksia", 7],
];

const embed = async (input, input_type) => {
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input, input_type, encoding_format: "float", truncate: "END" }),
  });
  if (!res.ok) { console.error(`\n  HTTP ${res.status}\n  ${(await res.text()).slice(0, 400)}\n`); process.exit(1); }
  const json = await res.json();
  const out = new Array(input.length);
  for (const d of json.data) out[d.index] = d.embedding;
  return out;
};

const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) / (norm(a) * norm(b));

const docs = await embed(CANDIDATES, "passage");
const queries = await embed(CASES.map(([q]) => q), "query");

console.log(`\n  model ${model}\n`);
let passed = 0;
CASES.forEach(([text, expected], i) => {
  const ranked = docs
    .map((d, j) => ({ j, score: cos(queries[i], d) }))
    .sort((a, b) => b.score - a.score);
  const hit = ranked[0].j === expected;
  if (hit) passed++;
  const margin = ranked[0].score - ranked[1].score;
  console.log(`  ${hit ? "OK  " : "MISS"}  "${text}"`);
  console.log(`        1. ${ranked[0].score.toFixed(3)}  ${CANDIDATES[ranked[0].j].split(" — ")[0]}`);
  console.log(`        2. ${ranked[1].score.toFixed(3)}  ${CANDIDATES[ranked[1].j].split(" — ")[0]}`);
  if (!hit) console.log(`        want:       ${CANDIDATES[expected].split(" — ")[0]}`);
  console.log(`        margin ${margin.toFixed(3)}\n`);
});

console.log(`  ${passed}/${CASES.length} correct at rank 1\n`);
