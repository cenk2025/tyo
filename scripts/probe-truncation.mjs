/**
 * Does truncating the embedding preserve who is near whom?
 *
 *   node scripts/probe-truncation.mjs
 *
 * A single nearest-neighbour lookup over education_program_units measures at
 * ~172ms warm, which is CPU on 2048-dimension distances, not I/O — 14,257 of
 * them is 41 minutes. Cutting the dimension is the only lever that changes that
 * by a factor rather than a percentage, and it needs no re-embedding IF the
 * model was trained with Matryoshka representation learning: with MRL the first
 * k dimensions are themselves a usable embedding, without it they are noise.
 *
 * Nothing in the model card is worth trusting over a measurement, and the
 * measurement is free — every unit vector is already in .cache. This compares
 * each truncation's top-20 neighbours against the full-dimension top-20 and
 * reports the overlap. Recall near 1.0 means the shorter vector retrieves what
 * the long one did; recall near 0.2 means the tail carried the meaning.
 */
import { readFileSync } from "node:fs";

const CACHE = ".cache/unit-embeddings.jsonl";
const SAMPLE = 1200;   // vectors to search among
const QUERIES = 60;
const TOP_K = 20;
const DIMS = [1024, 768, 512, 384, 256];

const vectors = [];
for (const line of readFileSync(CACHE, "utf8").split("\n")) {
  if (!line || vectors.length >= SAMPLE) continue;
  const buf = Buffer.from(JSON.parse(line).v, "base64");
  vectors.push(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
}
console.log(`\n  ${vectors.length} vector(s), ${vectors[0].length} dimension(s)\n`);

/** Cosine over the first `d` dimensions, renormalised — what a truncated index would compute. */
function cos(a, b, d) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < d; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function topK(qi, d) {
  const scored = [];
  for (let i = 0; i < vectors.length; i++) {
    if (i === qi) continue;
    scored.push([i, cos(vectors[qi], vectors[i], d)]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, TOP_K).map(([i]) => i);
}

const full = vectors[0].length;
const queries = Array.from({ length: QUERIES }, (_, i) => Math.floor((i * vectors.length) / QUERIES));
const truth = queries.map((q) => new Set(topK(q, full)));

console.log(`  recall@${TOP_K} against the full ${full} dimensions:\n`);
for (const d of DIMS) {
  let hits = 0;
  for (const [n, q] of queries.entries()) {
    for (const i of topK(q, d)) if (truth[n].has(i)) hits++;
  }
  const recall = hits / (QUERIES * TOP_K);
  const bar = "#".repeat(Math.round(recall * 40));
  console.log(`    ${String(d).padStart(4)}  ${recall.toFixed(3)}  ${bar}`);
}
console.log();
