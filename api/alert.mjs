/*
 * /api/alert — capture a price-drop alert signup.
 * POST { email, hotelId, name }
 *
 * MVP: validates + logs. To persist + actually send drops, add Vercel KV and a
 * cron poller (see AGODA_INTEGRATION notes): kv.sadd("alerts", {...}).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { email, hotelId, name } = body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ error: "valid email required" }); return;
  }
  // TODO (phase 2): persist to Vercel KV and have a cron poll Affiliate Lite prices.
  console.log("price-drop alert signup:", { email, hotelId, name, ts: new Date().toISOString() });
  res.status(200).json({ ok: true });
}
