/*
 * Import India "famous spots" + "national parks" from Wikidata (with coordinates)
 * into data/places.json — same approach as the temple importer.
 *   node import-places.mjs
 */
import { writeFileSync } from "node:fs";

const EP = "https://query.wikidata.org/sparql";
const UA = "Etoffe/0.1 (https://etoffe.co.in; travel places) Node";

async function sparql(query) {
  const url = `${EP}?query=${encodeURIComponent(query)}&format=json`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(55000),
      });
      if (r.ok) return r.json();
      if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error("HTTP " + r.status);
    } catch (e) { if (attempt === 4) throw e; }
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

const pt = (w) => { const m = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(w || ""); return m ? { lon: +m[1], lat: +m[2] } : null; };

function rows(data, kind) {
  const out = [];
  for (const b of data.results.bindings) {
    const name = b.itemLabel?.value?.trim();
    const p = pt(b.coord?.value);
    if (!name || !p || /^Q\d+$/.test(name)) continue;
    out.push({ kind, name, town: b.adminLabel?.value && !/^Q\d+$/.test(b.adminLabel.value) ? b.adminLabel.value : "", lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) });
  }
  return out;
}

const Q = (vals, extra = "") => `
SELECT ?item ?itemLabel ?coord ?adminLabel WHERE {
  ${vals}
  ?item wdt:P17 wd:Q668 ; wdt:P625 ?coord . ${extra}
  OPTIONAL { ?item wdt:P131 ?admin. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

async function main() {
  console.log("Importing places from Wikidata (CC0)…");
  // National parks (Q46169)
  const parks = rows(await sparql(Q("?item wdt:P31 wd:Q46169 .")), "park");
  console.log("  • National parks:", parks.length);
  await new Promise((r) => setTimeout(r, 1200));
  // Beaches (own category)
  const beaches = rows(await sparql(Q("?item wdt:P31 wd:Q40080 .")), "beach");
  console.log("  • Beaches:", beaches.length);
  await new Promise((r) => setTimeout(r, 1200));
  // Famous spots: tourist attraction, World Heritage Site, fort, waterfall, hill station
  const spotsVals = "VALUES ?type { wd:Q570116 wd:Q9259 wd:Q57831 wd:Q34038 wd:Q1066984 } ?item wdt:P31 ?type .";
  const spots = rows(await sparql(Q(spotsVals) + " LIMIT 2500"), "spot");
  console.log("  • Famous spots:", spots.length);

  // dedupe by name+rounded coord
  const all = [...parks, ...beaches, ...spots];
  const seen = new Set(), uniq = [];
  for (const r of all) { const k = r.name.toLowerCase() + "|" + r.lat.toFixed(2) + "|" + r.lon.toFixed(2); if (!seen.has(k)) { seen.add(k); uniq.push(r); } }

  writeFileSync("data/places.json", JSON.stringify(uniq));
  const byKind = uniq.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {});
  console.log(`✓ Wrote data/places.json — ${uniq.length} places`, byKind);
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
