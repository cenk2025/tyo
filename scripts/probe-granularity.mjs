/**
 * Does a shorter unit text actually retrieve the skill it names?
 *
 *   node scripts/probe-granularity.mjs
 *
 * The nearest neighbours of "asentaa pistorasioita" (fit sockets) are currently
 * stone masonry and rainwater systems, in a similarity band 0.014 wide. The
 * first explanation tried — shared boilerplate padding every group — was
 * measured and rejected: scripts/analyze-lines.mjs shows 48% of requirement
 * lines occur in exactly one qualification, and the phrases that DO repeat do
 * so in each trade's own words, not verbatim.
 *
 * That leaves granularity. A stored vector is currently a heading plus up to
 * eight requirements, of which "toteuttaa ... pistorasioiden kytkennät" is one.
 * If the dilution is what hides it, the SAME requirement embedded alone should
 * score far higher against the skill than the group containing it does.
 *
 * Three embedding calls settle that, against the real stored skill vectors
 * rather than a re-embedding of the label — so the number printed here is the
 * number the matcher would see.
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

const SKILLS = ["asentaa pistorasioita", "jatkaa kaapeleita", "liittää johtoja"];

// Taken verbatim from Sähkö- ja automaatioalan perustutkinto, osa
// "Pien- ja pienoisjännitesähköasennukset" — the group that SHOULD win.
const TITLE = "Pien- ja pienoisjännitesähköasennukset";
const HEADING = "Opiskelija tekee pien- ja pienoisjännitesähköasennukset";
const LINES = [
  "käyttää turvallisesti ohjeiden mukaisia suojaimia, työvälineitä, työmenetelmiä ja materiaaleja",
  "tekee pien- ja pienoisjännitesähköasennukset voimassa olevien säädösten, standardien, valmistajan ohjeiden ja asiakasympäristön vaatimusten mukaan",
  "tekee pienjännitteisen jakeluverkon asennukset voimassa olevien säädösten, standardien, valmistajan ohjeiden ja asiakasympäristön vaatimusten mukaan",
  "toteuttaa viestintä- ja tietoverkkojärjestelmien rasioinnin, johdotuksen ja pistorasioiden kytkennät",
  "toteuttaa potentiaalintasauksen ja maadoitukset",
  "tekee kiinteistön sähköasennukset (lämmitys, valaistus, pistorasiat, kytkimet)",
  "rakentaa johtotiet",
  "asentaa erilaiset sähkö- ja tiedonsiirtokaapelit",
];

const variants = {
  "1 line (the socket one)": LINES[3],
  "1 line + title": `${TITLE}\n${LINES[3]}`,
  "3 lines + title + heading": [TITLE, HEADING, ...LINES.slice(3, 6)].join("\n"),
  "8 lines + title + heading (current)": [TITLE, HEADING, ...LINES].join("\n"),
};

async function embed(inputs, inputType) {
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs, input_type: inputType, encoding_format: "float", truncate: "END" }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
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

// The skill vectors as STORED, so these numbers are the matcher's numbers.
const { data: rows, error } = await db
  .from("skills")
  .select("preferred_label_fi, embedding_fi")
  .in("preferred_label_fi", SKILLS)
  .not("embedding_fi", "is", null);
if (error) throw new Error(error.message);

const skillVecs = new Map();
for (const r of rows ?? []) {
  const v = typeof r.embedding_fi === "string" ? JSON.parse(r.embedding_fi) : r.embedding_fi;
  if (!skillVecs.has(r.preferred_label_fi)) skillVecs.set(r.preferred_label_fi, v);
}
console.log(`\n  ${skillVecs.size} skill vector(s) loaded from the database\n`);

const labels = [...variants.keys?.() ?? Object.keys(variants)];
const vecs = await embed(Object.values(variants), "passage");

const DIMS = [2048, 512];
for (const d of DIMS) {
  console.log(`  cosine at ${d} dimension(s):\n`);
  console.log("    " + "unit text".padEnd(38) + SKILLS.map((s) => s.slice(0, 14).padStart(16)).join(""));
  for (const [i, label] of labels.entries()) {
    const cells = SKILLS.map((s) => {
      const sv = skillVecs.get(s);
      return sv ? cos(vecs[i], sv, d).toFixed(3).padStart(16) : "—".padStart(16);
    });
    console.log("    " + label.padEnd(38) + cells.join(""));
  }
  console.log();
}
