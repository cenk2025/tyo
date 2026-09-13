/**
 * Pick each skill's lexical anchors and store them for link_skills_to_units.
 *
 *   node scripts/build-skill-anchors.mjs
 *   node scripts/build-skill-anchors.mjs --dry-run     # print, write nothing
 *
 * An anchor is a prefix of a word in the skill's Finnish label that occurs in
 * few enough QUALIFICATIONS to point at one. Prefixes rather than stems because
 * Finnish inflects by suffix and Postgres's Finnish stemmer splits one word
 * across lexemes ('pistorasioiden' -> pistorasio, 'pistorasiat' -> pistorasia);
 * 'pistorasi' covers every form. 0016 has the full reasoning.
 *
 * Selectivity is counted in qualifications, not in text occurrences, because
 * that is what the anchor has to discriminate between. It is also what
 * separates the useful terms from the treacherous ones: measured over the real
 * corpus, 'pistorasi' occurs in 2 qualifications and 'kaapel' in 24, while
 * 'johto' occurs in 105 — johto is a wire and also a management, and an anchor
 * that matches a third of all qualifications is not identifying anything.
 *
 * Re-run this whenever education_program_units changes. It costs no quota: it
 * reads text and writes an array, with no embedding involved.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const die = (msg) => { console.error(`\n  ${msg}\n`); process.exit(1); };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const DRY = process.argv.includes("--dry-run");

/**
 * A prefix in more than this many qualifications is not identifying one.
 *
 * 40 of 328 is about 12%. It admits 'kaapel' (24) and 'sähkölaitt' (28) and
 * rejects 'johto' (105) and 'asent' (105) — which is the line worth drawing,
 * since those two are exactly the ambiguous and the generic case.
 */
const MAX_PROGRAMS = 40;
/** Shorter than this, a prefix stops being a word and starts being a syllable. */
const MIN_PREFIX = 5;
/** Words shorter than this in Finnish are mostly grammar, not content. */
const MIN_WORD = 6;
/** More than a few anchors per skill turns the bonus into noise. */
const MAX_ANCHORS = 3;

const words = (text) =>
  (text ?? "").toLowerCase().split(/[^a-zà-öø-ÿåäö]+/i).filter((w) => w.length >= MIN_WORD);

// ---- every unit's text, with the qualification it belongs to -----------------
console.log("\n  Reading requirement groups...");
const units = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("education_program_units")
    .select("program_id, title_fi, heading, body")
    .order("id")
    .range(from, from + 999);
  if (error) die(`reading education_program_units failed: ${error.message}`);
  if (!data?.length) break;
  units.push(...data);
  if (data.length < 1000) break;
}
if (units.length === 0) die("no units stored — run the education import first");
console.log(`  ${units.length} group(s)`);

// ---- how many qualifications each prefix occurs in ---------------------------
// One pass: for every word in every unit, every prefix of it from MIN_PREFIX up
// records the unit's programme. Bounded by word length, so this stays linear.
console.log("  Counting prefix selectivity...");
const programsOf = new Map(); // prefix -> Set(program_id)
for (const u of units) {
  const seen = new Set();
  for (const w of words(`${u.title_fi} ${u.heading} ${u.body}`)) {
    for (let n = MIN_PREFIX; n <= w.length; n++) seen.add(w.slice(0, n));
  }
  for (const prefix of seen) {
    let set = programsOf.get(prefix);
    if (!set) programsOf.set(prefix, (set = new Set()));
    set.add(u.program_id);
  }
}
console.log(`  ${programsOf.size} distinct prefix(es)`);

/**
 * The longest prefix of `word` that still appears somewhere and identifies few
 * enough qualifications. Longest first because a longer prefix is a more
 * specific claim; shortening is what lets a Finnish compound the corpus does
 * not contain whole ("sähkötarvikkeita") fall back to a part that it does.
 */
function anchorFor(word) {
  for (let n = word.length; n >= MIN_PREFIX; n--) {
    const prefix = word.slice(0, n);
    const count = programsOf.get(prefix)?.size ?? 0;
    if (count === 0) continue;                 // nothing has it; try shorter
    if (count <= MAX_PROGRAMS) return { prefix, count };
    return null;                               // and every shorter one is worse
  }
  return null;
}

// ---- the skills ---------------------------------------------------------------
console.log("  Reading skills...");
const skills = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("skill_query_embeddings")
    .select("concept_uri, skills!inner(preferred_label_fi, alt_labels_fi)")
    .order("concept_uri")
    .range(from, from + 999);
  if (error) die(`reading skills failed: ${error.message}`);
  if (!data?.length) break;
  skills.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${skills.length} skill(s)`);

const updates = [];
let withAnchor = 0;
const histogram = new Map();
for (const row of skills) {
  const label = row.skills?.preferred_label_fi ?? "";
  const found = new Map();
  for (const w of words(label)) {
    const hit = anchorFor(w);
    // Keep the most selective spelling when two words share a prefix.
    if (hit && (!found.has(hit.prefix) || hit.count < found.get(hit.prefix))) {
      found.set(hit.prefix, hit.count);
    }
  }
  const anchors = [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_ANCHORS)
    .map(([prefix]) => prefix);
  if (anchors.length) withAnchor++;
  histogram.set(anchors.length, (histogram.get(anchors.length) ?? 0) + 1);
  updates.push({ concept_uri: row.concept_uri, anchor_prefixes: anchors.length ? anchors : null });
}

console.log(`\n  ${withAnchor} of ${skills.length} skill(s) have at least one anchor`);
for (const n of [...histogram.keys()].sort()) {
  console.log(`    ${n} anchor(s): ${histogram.get(n)} skill(s)`);
}

console.log("\n  examples:");
for (const u of updates.filter((u) => u.anchor_prefixes).slice(0, 10)) {
  const label = skills.find((s) => s.concept_uri === u.concept_uri)?.skills?.preferred_label_fi;
  console.log(`    ${String(label).slice(0, 44).padEnd(46)} ${u.anchor_prefixes.join(", ")}`);
}

if (DRY) {
  console.log("\n  --dry-run: nothing written.\n");
  process.exit(0);
}

// Through an RPC rather than an upsert: skill_query_embeddings.embedding is
// NOT NULL, so the INSERT half of an upsert is rejected even for rows that
// already exist, and a PATCH per skill would be 14,257 round trips.
console.log(`\n  Writing ${updates.length} row(s)...`);
let written = 0;
for (let i = 0; i < updates.length; i += 500) {
  const slice = updates.slice(i, i + 500).map((u) => ({ u: u.concept_uri, a: u.anchor_prefixes }));
  const { data, error } = await db.rpc("set_skill_anchors", { p_rows: slice });
  if (error) die(`writing anchors failed after ${written}: ${error.message}`);
  written += data ?? slice.length;
  if (i % 2500 === 0 || i + 500 >= updates.length) console.log(`    ${written} / ${updates.length}`);
}
console.log(`\n  Done.\n`);
