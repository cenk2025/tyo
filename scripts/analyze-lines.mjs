/**
 * How much of a tutkinnon osa's text is boilerplate shared with every other trade?
 *
 *   node scripts/analyze-lines.mjs            # all 328
 *   node scripts/analyze-lines.mjs --limit 40 # quick look
 *
 * Asked because the nearest neighbours of "asentaa pistorasioita" (fit sockets)
 * turned out to be stone masonry and rainwater systems, inside a similarity
 * band 0.014 wide. A spread that narrow across unrelated trades is not a
 * ranking problem; it means the vectors are mostly measuring text the trades
 * have in common. ePerusteet writes a great deal of shared institutional
 * phrasing into every requirement group — following documents and plans,
 * checking tools and protective equipment, planning one's work safely — and it
 * dilutes the one clause that actually names the work.
 *
 * Dropping those lines is easy. Choosing the cutoff by guesswork is how you
 * delete real content, so this prints the distribution first: how many distinct
 * requirement lines exist, how many qualifications each appears in, and the
 * lines at the top. No embedding, no database, ~2 minutes of polite fetching.
 */
const BASE = "https://eperusteet.opintopolku.fi/eperusteet-service/api/external";
const VOCATIONAL = new Set(["koulutustyyppi_1", "koulutustyyppi_11", "koulutustyyppi_12"]);
const args = process.argv.slice(2);
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) =>
  html ? html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ---- the qualification list -------------------------------------------------
const list = [];
for (let page = 0; ; page++) {
  const body = await fetchJson(`${BASE}/perusteet?sivu=${page}&sivukoko=100&tuleva=false&siirtyma=false&voimassa=true&poistunut=false`);
  const rows = body.data ?? [];
  if (rows.length === 0) break;
  for (const r of rows) if (VOCATIONAL.has(r.koulutustyyppi)) list.push(r);
  if (page >= (body.sivuja ?? 1) - 1) break;
  await sleep(150);
}
const targets = list.slice(0, LIMIT);
console.log(`\n  ${targets.length} qualification(s)\n`);

// ---- every requirement line, and which qualifications it appears in ----------
const programsOf = new Map(); // line -> Set(program id)
let totalLines = 0;
for (const [i, entry] of targets.entries()) {
  let osat = [];
  try {
    const body = await fetchJson(`${BASE}/peruste/${entry.id}/tutkinnonosat`);
    osat = Array.isArray(body) ? body : body.data ?? [];
  } catch {
    continue;
  }
  for (const osa of osat) {
    const html = osa.ammattitaitovaatimukset?.fi;
    if (!html) continue;
    for (const m of html.matchAll(/<(dd|li)[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const line = strip(m[2]);
      if (line.length <= 3) continue;
      totalLines++;
      const set = programsOf.get(line) ?? new Set();
      set.add(entry.id);
      programsOf.set(line, set);
    }
  }
  if ((i + 1) % 50 === 0 || i + 1 === targets.length) {
    console.log(`  ${i + 1} / ${targets.length} fetched, ${programsOf.size} distinct line(s)`);
  }
  await sleep(120);
}

// ---- what the distribution looks like ---------------------------------------
const n = targets.length;
const counts = [...programsOf.entries()].map(([line, set]) => [line, set.size]);
counts.sort((a, b) => b[1] - a[1]);

console.log(`\n  ${totalLines} requirement line(s), ${counts.length} distinct\n`);
console.log("  appears in ...            distinct lines   share of all occurrences");
const bands = [
  ["1 qualification only", (c) => c === 1],
  ["2-3", (c) => c >= 2 && c <= 3],
  ["4-10", (c) => c >= 4 && c <= 10],
  ["11-30", (c) => c >= 11 && c <= 30],
  ["31-80", (c) => c >= 31 && c <= 80],
  [`81+ (of ${n})`, (c) => c >= 81],
];
for (const [label, test] of bands) {
  const rows = counts.filter(([, c]) => test(c));
  const occurrences = rows.reduce((s, [, c]) => s + c, 0);
  console.log(
    `  ${label.padEnd(24)} ${String(rows.length).padStart(8)}   ` +
      `${((occurrences / totalLines) * 100).toFixed(1).padStart(5)}%`
  );
}

console.log("\n  most widespread lines:\n");
for (const [line, c] of counts.slice(0, 20)) {
  console.log(`  ${String(c).padStart(4)}  ${line.slice(0, 110)}`);
}
console.log();
