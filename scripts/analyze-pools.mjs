/**
 * Read the cached osa candidate pools and answer one question: how much of the
 * ESCO vocabulary is reachable at all in the osa -> skills direction?
 *
 *   node scripts/analyze-pools.mjs
 *
 * A skill only ever gets linked if it lands in some osa's top-N candidates. If
 * a large share of skills never appear in ANY pool, the direction of the search
 * is the problem, not the ranking applied afterwards.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { pools } = JSON.parse(readFileSync(".cache/osa-pools.json", "utf8"));
const counts = new Map();
let poolSize = 0;
for (const [, candidates] of pools) {
  poolSize = candidates.length;
  for (const c of candidates) counts.set(c.skill_uri, (counts.get(c.skill_uri) ?? 0) + 1);
}

const { count: totalSkills } = await db
  .from("skills")
  .select("concept_uri", { count: "exact", head: true })
  .not("embedding_fi", "is", null);

console.log(`\n  ${pools.length} pool(s) of ${poolSize} candidates each`);
console.log(`  ${counts.size} distinct skill(s) appear in at least one pool`);
console.log(`  ${totalSkills} embedded skill(s) exist in total`);
console.log(`  ${totalSkills - counts.size} skill(s) are unreachable in this direction\n`);

const freq = [...counts.values()].sort((a, b) => b - a);
const at = (p) => freq[Math.floor(freq.length * p)] ?? 0;
console.log(`  appearances per reachable skill: max ${freq[0]}, p10 ${at(0.1)}, median ${at(0.5)}, p90 ${at(0.9)}`);

const probes = [
  "asentaa pistorasioita",
  "jatkaa kaapeleita",
  "liittää johtoja",
  "testata sähkölaitteita",
];
const { data } = await db
  .from("skills")
  .select("concept_uri, preferred_label_fi")
  .in("preferred_label_fi", probes);
console.log();
for (const row of data ?? []) {
  console.log(`  "${row.preferred_label_fi}" appears in ${counts.get(row.concept_uri) ?? 0} pool(s)`);
}
console.log();
