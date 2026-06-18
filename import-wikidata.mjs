/*
 * Wikidata importer — pulls REAL Hindu temples (with real coordinates) for a
 * given Indian state and merges them into data/temples.json.
 *
 *   node import-wikidata.mjs <state> [limit]
 *   node import-wikidata.mjs tamil-nadu 80
 *   node import-wikidata.mjs odisha
 *   node import-wikidata.mjs all            # every state in the map below
 *
 * Source: Wikidata (CC0). Curated entries already in temples.json are preserved
 * (Wikidata never overwrites a hand-written page). Imported temples come in as
 * skeletons (name, coords, district, deity, Wikipedia source) for later
 * enrichment + fact-checking — never as fabricated content.
 */
import { readFileSync, writeFileSync } from "node:fs";

const EP = "https://query.wikidata.org/sparql";
const UA = "TempleYatra/0.1 (https://aikid.in; temple encyclopedia) Node";

// state -> Wikidata QID
const STATES = {
  "andhra-pradesh": ["Q1159", "Andhra Pradesh"],
  "bihar": ["Q1165", "Bihar"],
  "gujarat": ["Q1061", "Gujarat"],
  "karnataka": ["Q1185", "Karnataka"],
  "kerala": ["Q1186", "Kerala"],
  "madhya-pradesh": ["Q1188", "Madhya Pradesh"],
  "maharashtra": ["Q1191", "Maharashtra"],
  "odisha": ["Q22048", "Odisha"],
  "rajasthan": ["Q1437", "Rajasthan"],
  "tamil-nadu": ["Q1445", "Tamil Nadu"],
  "telangana": ["Q677037", "Telangana"],
  "uttar-pradesh": ["Q1498", "Uttar Pradesh"],
  "uttarakhand": ["Q1499", "Uttarakhand"],
  "west-bengal": ["Q1356", "West Bengal"],
};

const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 70);

// Lean query: direct typing (no P279* explosion), no Wikipedia join (we cite the
// Wikidata entity itself). Retries on the transient 429/500/503/504 the public
// endpoint throws under load.
async function sparql(qid, limit) {
  const q = `
SELECT ?item ?itemLabel ?coord ?adminLabel ?deityLabel WHERE {
  ?item wdt:P31 wd:Q842402 ;
        wdt:P131* wd:${qid} ;
        wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P131 ?admin. }
  OPTIONAL { ?item wdt:P140 ?deity. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}${limit ? " LIMIT " + limit : ""}`;
  const url = `${EP}?query=${encodeURIComponent(q)}&format=json`;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const ctrl = AbortSignal.timeout(55000);
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: ctrl,
      });
      if (r.ok) return r.json();
      if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`HTTP ${r.status}`);
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < 4) {
      const wait = 2000 * attempt;
      process.stdout.write(`(retry ${attempt} after ${lastErr.message}) `);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastErr;
}

function parsePoint(wkt) {
  const m = /Point\(([-0-9.]+) ([-0-9.]+)\)/.exec(wkt || "");
  return m ? { lon: +m[1], lat: +m[2] } : null;
}

function toRecord(row, stateName) {
  const name = row.itemLabel?.value?.trim();
  const pt = parsePoint(row.coord?.value);
  if (!name || !pt || /^Q\d+$/.test(name)) return null; // skip unlabeled / coordless
  const town = row.adminLabel?.value && !/^Q\d+$/.test(row.adminLabel.value) ? row.adminLabel.value : "";
  const deity = row.deityLabel?.value && !/^Q\d+$/.test(row.deityLabel.value) ? row.deityLabel.value : "";
  return {
    slug: slugify(name),
    name,
    deity: deity || "Hindu deity",
    category: "Hindu Temple",
    town: town || stateName,
    state: stateName,
    lat: +pt.lat.toFixed(5),
    lon: +pt.lon.toFixed(5),
    significance: `${name} is a Hindu temple in ${town || stateName}, ${stateName}.`,
    history: "",
    architecture: "",
    festivals: [],
    timings: "",
    howToReach: "",
    sources: row.item?.value ? [row.item.value] : [],
    enriched: false,
    source: "wikidata",
  };
}

async function importState(key, limit) {
  const entry = STATES[key];
  if (!entry) throw new Error(`Unknown state "${key}". Options: ${Object.keys(STATES).join(", ")}, all`);
  const [qid, name] = entry;
  process.stdout.write(`  • ${name} (${qid}) … `);
  const data = await sparql(qid, limit);
  const recs = data.results.bindings.map((r) => toRecord(r, name)).filter(Boolean);
  console.log(`${recs.length} temples`);
  return recs;
}

async function main() {
  const arg = (process.argv[2] || "").toLowerCase();
  const limit = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
  if (!arg) {
    console.log(`Usage: node import-wikidata.mjs <state> [limit]\nStates: ${Object.keys(STATES).join(", ")}, all`);
    process.exit(1);
  }

  const existing = JSON.parse(readFileSync("data/temples.json", "utf8"));
  const haveSlug = new Set(existing.map((t) => t.slug));
  const haveName = new Set(existing.map((t) => t.name.toLowerCase()));

  console.log("Importing from Wikidata (real data, CC0):");
  const keys = arg === "all" ? Object.keys(STATES) : [arg];
  let incoming = [];
  for (const k of keys) {
    try {
      incoming.push(...(await importState(k, limit)));
    } catch (e) {
      console.log(`  ! ${k} failed (${e.message}) — skipped`);
    }
    if (keys.length > 1) await new Promise((r) => setTimeout(r, 1200)); // be polite
  }

  // merge: curated wins; dedupe imported by slug + name; fix slug collisions
  let added = 0, skipped = 0;
  for (const rec of incoming) {
    if (haveName.has(rec.name.toLowerCase())) { skipped++; continue; }
    let slug = rec.slug;
    let n = 2;
    while (haveSlug.has(slug)) slug = `${rec.slug}-${n++}`;
    rec.slug = slug;
    haveSlug.add(slug);
    haveName.add(rec.name.toLowerCase());
    existing.push(rec);
    added++;
  }

  writeFileSync("data/temples.json", JSON.stringify(existing, null, 2) + "\n");
  console.log(`\n✓ Added ${added} new real temples (skipped ${skipped} duplicates). Dataset now: ${existing.length} temples.`);
  console.log("  Next: node build.mjs");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
