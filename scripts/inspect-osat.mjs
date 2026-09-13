/**
 * Dump one qualification's tutkinnon osat, to see what an ammattitaitovaatimus
 * actually looks like before building a matching rule on it.
 *
 *   node scripts/inspect-osat.mjs "automaatioalan perustutkinto"
 */
const needle = (process.argv[2] || "").toLowerCase();
if (!needle) {
  console.error("\n  usage: node scripts/inspect-osat.mjs <part of the name>\n");
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
console.log(`\n  ${hit.nimi.fi}  (id ${hit.id})\n`);

for (const path of ["tutkinnonosat", "tutkinnonOsat", "osat"]) {
  const res = await fetch(`${BASE}/peruste/${hit.id}/${path}`);
  console.log(`  GET /peruste/${hit.id}/${path}  ->  ${res.status}`);
  if (!res.ok) continue;

  const body = await res.json();
  const arr = Array.isArray(body) ? body : body.data ?? [];
  console.log(`  ${arr.length} item(s); keys of first: ${Object.keys(arr[0] ?? {}).join(", ")}\n`);

  for (const osa of arr.slice(0, 3)) {
    console.log("  ---", osa.nimi?.fi ?? osa.nimi ?? "(no nimi)");
    const a = osa.ammattitaitovaatimukset;
    if (typeof a === "string") console.log("     vaatimukset(str):", strip(a).slice(0, 500));
    else if (a && typeof a === "object") {
      console.log("     vaatimukset keys:", Object.keys(a).join(", "));
      console.log("     fi:", strip(a.fi).slice(0, 500));
      if (Array.isArray(a.kohdealueet)) {
        console.log("     kohdealueet:", a.kohdealueet.length);
        console.log("     sample:", JSON.stringify(a.kohdealueet[0]).slice(0, 600));
      }
    } else console.log("     ammattitaitovaatimukset:", a);
    if (osa.ammattitaitovaatimuksetLista) {
      console.log("     lista:", JSON.stringify(osa.ammattitaitovaatimuksetLista).slice(0, 600));
    }
    console.log();
  }
  break;
}
