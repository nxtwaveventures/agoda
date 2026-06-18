/*
 * /api/alert — register a price-drop watch.
 * POST { email, hotelId, name }
 * Captures the current live price as the baseline, stores in KV.
 */
import { searchHotels } from "./_agoda.mjs";
import { kv, kvEnabled } from "./_kv.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { email, hotelId, name } = body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: "valid email required" }); return; }
  if (!hotelId) { res.status(400).json({ error: "hotelId required" }); return; }

  // capture current price as baseline (best effort)
  let baseline = null, currency = "INR";
  try {
    const { results } = await searchHotels({ hotelIds: [hotelId] });
    if (results[0] && results[0].price != null) { baseline = results[0].price; currency = results[0].currency || "INR"; }
  } catch { /* ignore — store without baseline, cron will set it */ }

  const rec = JSON.stringify({ email, hotelId: String(hotelId), name: name || "", baseline, currency, created: Date.now() });
  if (kvEnabled) {
    try { await kv.hset("alerts", `${hotelId}|${email.toLowerCase()}`, rec); }
    catch (e) { console.error("kv hset failed:", e.message); }
  } else {
    console.log("price-drop alert (KV not configured):", rec);
  }
  res.status(200).json({ ok: true, baseline, currency });
}
