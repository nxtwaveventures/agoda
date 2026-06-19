/*
 * Import Hindu temples within a geographic bounding box (fast WDQS spatial
 * query — avoids the P131* timeout for big states). Merges into temples.json.
 *   node scripts/import-bbox.mjs "<State>" <wLon> <sLat> <eLon> <nLat>
 *   node scripts/import-bbox.mjs "Karnataka" 74.0 11.5 78.6 18.5
 */
import { readFileSync, writeFileSync } from "node:fs";

const [stateName, wLon, sLat, eLon, nLat] = process.argv.slice(2);
if (!stateName || !nLat) { console.error("usage: import-bbox.mjs <State> <wLon> <sLat> <eLon> <nLat>"); process.exit(1); }

const EP = "https://query.wikidata.org/sparql";
const UA = "Etoffe/0.1 (https://etoffe.co.in) Node";
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 70);

const query = `
SELECT ?item ?itemLabel ?coord ?adminLabel WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerWest "Point(${wLon} ${sLat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "Point(${eLon} ${nLat})"^^geo:wktLiteral .
  }
  ?item wdt:P31/wdt:P279* wd:Q842402 .
  OPTIONAL { ?item wdt:P131 ?admin. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

async function run() {
  const url = `${EP}?query=${encodeURIComponent(query)}&format=json`;
  let data;
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(60000) });
      if (r.ok) { data = await r.json(); break; }
    } catch (e) { if (a === 4) throw e; }
    await new Promise((res) => setTimeout(res, 2000 * a));
  }
  const pt = (w) => { const m = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(w || ""); return m ? { lon: +m[1], lat: +m[2] } : null; };
  const recs = [];
  for (const b of data.results.bindings) {
    const name = b.itemLabel?.value?.trim(); const p = pt(b.coord?.value);
    if (!name || !p || /^Q\d+$/.test(name)) continue;
    const town = b.adminLabel?.value && !/^Q\d+$/.test(b.adminLabel.value) ? b.adminLabel.value : stateName;
    recs.push({ slug: slugify(name), name, deity: "Hindu deity", category: "Hindu Temple", town, state: stateName, lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5), significance: `${name} is a Hindu temple in ${town}, ${stateName}.`, history: "", architecture: "", festivals: [], timings: "", howToReach: "", sources: [b.item.value], enriched: false, source: "wikidata" });
  }
  console.log(`${stateName}: fetched ${recs.length}`);

  const existing = JSON.parse(readFileSync("data/temples.json", "utf8"));
  const haveSlug = new Set(existing.map((t) => t.slug)); const haveName = new Set(existing.map((t) => t.name.toLowerCase()));
  let added = 0;
  for (const rec of recs) {
    if (haveName.has(rec.name.toLowerCase())) continue;
    let slug = rec.slug, n = 2; while (haveSlug.has(slug)) slug = `${rec.slug}-${n++}`;
    rec.slug = slug; haveSlug.add(slug); haveName.add(rec.name.toLowerCase()); existing.push(rec); added++;
  }
  writeFileSync("data/temples.json", JSON.stringify(existing, null, 2) + "\n");
  console.log(`✓ Added ${added} (dataset now ${existing.length})`);
}
run().catch((e) => { console.error("✗", e.message); process.exit(1); });
