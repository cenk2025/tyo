/**
 * One-shot probe: confirms the NVIDIA embedding key works and prints the
 * vector dimension, which the pgvector column type has to match exactly.
 *
 *   node scripts/probe-embedding-dims.mjs
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const key = process.env.NVIDIA_API_KEY;
if (!key || !key.startsWith("nvapi-")) {
  console.error("\n  NVIDIA_API_KEY missing from .env.local\n");
  process.exit(1);
}

const model = process.env.NVIDIA_EMBED_MODEL || "nvidia/nemotron-3-embed-1b";
const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

const res = await fetch(`${base}/embeddings`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    input: ["asiakaspalvelu ja kassatyö", "customer service and cashier work"],
    input_type: "passage",
    encoding_format: "float",
    truncate: "END",
  }),
});

if (!res.ok) {
  console.error(`\n  HTTP ${res.status}\n  ${(await res.text()).slice(0, 500)}\n`);
  process.exit(1);
}

const json = await res.json();
const [a, b] = json.data.map((d) => d.embedding);

// Sanity check: the Finnish and English phrasings of the same idea should sit
// close together. If this number is low, the model is not doing what we need.
const dot = a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const cosine = dot / (norm(a) * norm(b));

console.log(`\n  model       ${model}`);
console.log(`  DIMENSIONS  ${a.length}`);
console.log(`  fi↔en cos   ${cosine.toFixed(4)}   (want > 0.7)`);
console.log(`  tokens      ${json.usage?.total_tokens ?? "n/a"}\n`);
