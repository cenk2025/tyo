/**
 * Is the skill side being embedded with the wrong input_type?
 *
 *   node scripts/probe-input-type.mjs
 *
 * Everything else has been ruled out by measurement. Boilerplate: rejected —
 * 48% of requirement lines occur in exactly one qualification. Granularity:
 * rejected — the single line naming sockets scores 0.525 against "asentaa
 * pistorasioita" while the eight-line group containing it scores 0.536, and an
 * unrelated stone-masonry group scores 0.640. The correct text ranks BELOW the
 * wrong one, which no amount of re-chunking fixes.
 *
 * What has not been checked is the retrieval setup itself. NVIDIA's embedding
 * endpoint takes an input_type, and it is how the model is told which side of
 * an asymmetric search a text is on: the corpus is "passage", the thing being
 * looked up is "query". Both sides here are embedded as "passage" —
 * backfill-skill-embeddings.mjs line 92, and the unit import. On a model
 * trained asymmetrically that is not a small inefficiency; it puts the two
 * sides in different parts of the space.
 *
 * This embeds the SAME skill text both ways and ranks the same candidates under
 * each, with the correct answer and three distractors from the trades that
 * currently outrank it. If "query" pulls the electrical text above the masonry
 * and heating ones, the fix is one parameter and a re-embedding of the skills.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const BASE = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_EMBED_MODEL || "nvidia/nemotron-3-embed-1b";

const SKILLS = ["asentaa pistorasioita", "jatkaa kaapeleita", "liittää johtoja", "testata sähkölaitteita"];

const CANDIDATES = {
  "RIGHT  sähkö: pien- ja pienoisjännitesähköasennukset":
    "Pien- ja pienoisjännitesähköasennukset\nOpiskelija tekee pien- ja pienoisjännitesähköasennukset\n" +
    "toteuttaa viestintä- ja tietoverkkojärjestelmien rasioinnin, johdotuksen ja pistorasioiden kytkennät\n" +
    "tekee kiinteistön sähköasennukset (lämmitys, valaistus, pistorasiat, kytkimet)\n" +
    "rakentaa johtotiet\nasentaa erilaiset sähkö- ja tiedonsiirtokaapelit\ntoteuttaa potentiaalintasauksen ja maadoitukset",
  "wrong  talotekniikka: lämmitysjärjestelmä":
    "Lämmitysjärjestelmän laitteiden ja varusteiden asentaminen\n" +
    "asentaa lämmitysjärjestelmän laitteet ja varusteet suunnitelman mukaisesti\n" +
    "tekee lämmitysjärjestelmän putkiasennukset\nvarmistaa asennusten tiiviyden",
  "wrong  talotekniikka: käyttövesijärjestelmä":
    "Käyttövesijärjestelmän varusteiden ja kalusteiden asentaminen\n" +
    "asentaa käyttövesijärjestelmän varusteet ja kalusteet\ntekee vesikalusteiden kytkennät",
  "wrong  merenkulku: koneautomaatiojärjestelmät":
    "Koneautomaatiojärjestelmien asentaminen\n" +
    "asentaa koneautomaatiojärjestelmän komponentit\ntekee automaatiojärjestelmän kytkennät",
};

async function embed(inputs, inputType) {
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs, input_type: inputType, encoding_format: "float", truncate: "END" }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status} (${inputType}): ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const out = new Array(inputs.length);
  for (const row of json.data) out[row.index] = row.embedding;
  return out;
}

const cos = (a, b, d) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < d; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

// The exact text backfill-skill-embeddings.mjs embeds: label, alt labels, description.
function skillText(row) {
  const alts = (row.alt_labels_fi || row.alt_labels_en || "")
    .split(/[\n|;,]/).map((s) => s.trim()).filter(Boolean).slice(0, 6).join(", ");
  const desc = (row.description_fi || row.description_en || "").slice(0, 600);
  return [row.preferred_label_fi, alts, desc].filter(Boolean).join("\n").trim();
}

const { data: rows, error } = await db
  .from("skills")
  .select("preferred_label_fi, alt_labels_fi, alt_labels_en, description_fi, description_en")
  .in("preferred_label_fi", SKILLS);
if (error) throw new Error(error.message);

const seen = new Map();
for (const r of rows ?? []) if (!seen.has(r.preferred_label_fi)) seen.set(r.preferred_label_fi, skillText(r));
const skills = [...seen.entries()];

const candLabels = Object.keys(CANDIDATES);
const candVecs = await embed(Object.values(CANDIDATES), "passage");
const asPassage = await embed(skills.map(([, t]) => t), "passage");
const asQuery = await embed(skills.map(([, t]) => t), "query");

const D = 512;
for (const [mode, vecs] of [["passage (current)", asPassage], ["query (asymmetric)", asQuery]]) {
  console.log(`\n  skill embedded as ${mode} — cosine at ${D} dimensions\n`);
  console.log("    " + "candidate".padEnd(52) + skills.map(([s]) => s.slice(0, 13).padStart(15)).join(""));
  for (const [i, label] of candLabels.entries()) {
    const cells = skills.map((_, j) => cos(candVecs[i], vecs[j], D).toFixed(3).padStart(15));
    console.log("    " + label.padEnd(52) + cells.join(""));
  }
}
console.log("\n  The RIGHT row should be the highest in its column. Is it?\n");
