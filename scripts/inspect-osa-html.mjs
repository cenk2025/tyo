/**
 * Dump the RAW ammattitaitovaatimukset HTML of a few tutkinnon osat.
 *
 *   node scripts/inspect-osa-html.mjs [perusteId]
 *
 * Written because the stored unit texts came back as one unsplit blob —
 * "työskentelee turvallisesti työmaalla liikkuu ja toimii turvallisesti" —
 * which means listItems() in import-education-programs.mjs is not finding the
 * requirement boundaries in this document. Fixing a regex against a guess about
 * the markup is how you get a second wrong regex; this prints the actual markup.
 */
const BASE = "https://eperusteet.opintopolku.fi/eperusteet-service/api/external";
const perusteId = process.argv[2] ?? "7854766"; // Sähkö- ja automaatioalan perustutkinto

const res = await fetch(`${BASE}/peruste/${perusteId}/tutkinnonosat`);
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}
const body = await res.json();
const arr = Array.isArray(body) ? body : body.data ?? [];
console.log(`\n  ${arr.length} tutkinnon osa(t) in peruste ${perusteId}\n`);

// The two longest, since length is what broke the matching.
const withFi = arr
  .filter((o) => o.ammattitaitovaatimukset?.fi)
  .sort((a, b) => b.ammattitaitovaatimukset.fi.length - a.ammattitaitovaatimukset.fi.length)
  .slice(0, 2);

for (const osa of withFi) {
  const html = osa.ammattitaitovaatimukset.fi;
  console.log("=".repeat(78));
  console.log(`  ${osa.nimi?.fi}   (id ${osa.id}, ${html.length} chars of HTML)`);
  const tags = new Map();
  for (const [, t] of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)/g)) {
    tags.set(t.toLowerCase(), (tags.get(t.toLowerCase()) ?? 0) + 1);
  }
  console.log(`  tags: ${[...tags].map(([t, n]) => `${t}=${n}`).join("  ")}`);
  console.log("-".repeat(78));
  console.log(html.slice(0, 2200));
  console.log(html.length > 2200 ? `\n  ...(${html.length - 2200} more chars)` : "");
  console.log();
}
