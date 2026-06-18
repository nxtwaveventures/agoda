/*
 * Extract India hotels from the Agoda Hotel Data File (1.2 GB CSV) into a
 * compact JSON we can join against temples at build time.
 *   node scripts/extract-agoda-india.mjs "/path/to/hotel-data.csv"
 * Streaming CSV parser (handles quoted fields, embedded commas/quotes) — no deps.
 */
import { createReadStream, writeFileSync } from "node:fs";

const CSV = process.argv[2];
if (!CSV) { console.error("Usage: node scripts/extract-agoda-india.mjs <csv>"); process.exit(1); }
const OUT = "data/agoda-india.json";

const KEEP = ["hotel_id", "hotel_name", "city", "countryisocode", "star_rating",
  "longitude", "latitude", "url", "photo1", "number_of_reviews", "rating_average", "city_id", "accommodation_type"];

let header = null, idx = {}, field = "", record = [], inQuotes = false;
const out = [];

function endField() { record.push(field); field = ""; }
function endRecord() {
  endField();
  if (record.length === 1 && record[0] === "") { record = []; return; }
  if (!header) {
    header = record.map((h) => h.replace(/^﻿/, "").trim());
    KEEP.forEach((k) => (idx[k] = header.indexOf(k)));
    record = [];
    return;
  }
  const r = record; record = [];
  if (r[idx.countryisocode] !== "IN") return;
  const lat = parseFloat(r[idx.latitude]), lon = parseFloat(r[idx.longitude]);
  if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return;
  out.push({
    id: r[idx.hotel_id],
    name: r[idx.hotel_name],
    city: r[idx.city],
    star: parseFloat(r[idx.star_rating]) || 0,
    lat, lon,
    url: r[idx.url],
    photo: r[idx.photo1] || "",
    reviews: parseInt(r[idx.number_of_reviews]) || 0,
    score: parseFloat(r[idx.rating_average]) || 0,
    cityId: r[idx.city_id],
    type: r[idx.accommodation_type] || "",
  });
}

const stream = createReadStream(CSV, { encoding: "utf8" });
stream.on("data", (chunk) => {
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i];
    if (inQuotes) {
      if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') { if (field !== "") field += '"'; inQuotes = true; }
      else if (c === ",") endField();
      else if (c === "\n") endRecord();
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
});
stream.on("end", () => {
  if (field !== "" || record.length) endRecord();
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`India hotels extracted: ${out.length.toLocaleString()} -> ${OUT} (${(JSON.stringify(out).length / 1e6).toFixed(1)} MB)`);
  console.log("sample:", JSON.stringify(out[0]));
});
stream.on("error", (e) => { console.error("read error:", e.message); process.exit(1); });
