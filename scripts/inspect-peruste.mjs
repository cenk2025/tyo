/**
 * Print one qualification's raw ePerusteet fields, to see what a matching rule
 * would actually be working with before writing one.
 *
 *   node scripts/inspect-peruste.mjs "automaatioalan perustutkinto"
 */
const needle = (process.argv[2] || "").toLowerCase();
if (!needle) {
  console.error("\n  usage: node scripts/inspect-peruste.mjs <part of the name>\n");
  process.exit(1);
}

const BASE = "https://eperusteet.opintopolku.fi/eperusteet-service/api/external";
const strip = (h) =>
  (h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

let hit = null;
for (let page = 0; page < 12 && !hit; page++) {
  const list = await (await fetch(`${BASE}/perusteet?sivu=${page}&sivukoko=50`)).json();
  hit = list.data.find((p) => (p.nimi?.fi || "").toLowerCase().includes(needle));
  if ((page + 1) * 50 >= list.kokonaismäärä) break;
}
if (!hit) {
  console.error(`\n  no qualification matched "${needle}"\n`);
  process.exit(1);
}

const d = await (await fetch(`${BASE}/peruste/${hit.id}`)).json();

console.log(`\n  ${d.nimi?.fi}   (id ${hit.id}, ${hit.koulutustyyppi})\n`);
console.log("  --- tutkintonimikkeet ---");
for (const t of d.tutkintonimikkeet ?? []) console.log("   ", t.nimi?.fi, "|", t.nimi?.en);
console.log("\n  --- tyotehtavatJoissaVoiToimia (fi) ---");
console.log("   ", strip(d.tyotehtavatJoissaVoiToimia?.fi).slice(0, 1500) || "(empty)");
console.log("\n  --- suorittaneenOsaaminen (fi), first 400 chars ---");
console.log("   ", strip(d.suorittaneenOsaaminen?.fi).slice(0, 400) || "(empty)");
console.log();
