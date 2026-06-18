/*
 * /api/cron-price-drop — polls watched hotels' live prices and emails on a drop.
 * Triggered by Vercel Cron (see vercel.json). Reads watches from KV, batches a
 * Long Tail search, compares to each watcher's baseline, emails via Resend, and
 * resets the baseline to the new lower price.
 */
import { searchHotels } from "./_agoda.mjs";
import { kv, kvEnabled } from "./_kv.mjs";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.ALERT_FROM || "Etoffe Alerts <alerts@etoffe.co.in>";

async function sendDropEmail(to, h, oldPrice) {
  const drop = Math.round(oldPrice - h.price);
  const subject = `Price drop: ${h.name} — save ${h.currency} ${drop.toLocaleString()}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="margin:0 0 8px">🔔 The price dropped</h2>
      <p style="margin:0 0 4px"><b>${h.name}</b></p>
      <p style="margin:0 0 12px">Now <b>${h.currency} ${Number(h.price).toLocaleString()}</b>
        <span style="color:#888;text-decoration:line-through">${h.currency} ${Number(oldPrice).toLocaleString()}</span>
        — down ${h.currency} ${drop.toLocaleString()}.</p>
      <p><a href="${h.bookUrl}" style="background:#ff2d9c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Book now on Agoda →</a></p>
      <p style="font-size:12px;color:#999;margin-top:20px">You asked Etoffe to watch this hotel's price. Reply to this email to stop alerts.</p>
    </div>`;
  if (!RESEND_KEY) { console.log("[would email]", to, h.name, h.price); return; }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
}

export default async function handler(req, res) {
  if (!kvEnabled) { return res.status(200).json({ ok: true, note: "KV not configured" }); }
  const watches = await kv.hgetall("alerts");
  const fields = Object.keys(watches);
  if (!fields.length) return res.status(200).json({ ok: true, watched: 0, sent: 0 });

  const recs = fields.map((f) => { try { return [f, JSON.parse(watches[f])]; } catch { return null; } }).filter(Boolean);
  const hotelIds = [...new Set(recs.map(([, r]) => r.hotelId))];

  // Long Tail Search supports a hotelId list — batch it (chunks of 25 to be safe).
  const priceById = {};
  for (let i = 0; i < hotelIds.length; i += 25) {
    const { results } = await searchHotels({ hotelIds: hotelIds.slice(i, i + 25) });
    for (const h of results) priceById[String(h.hotelId)] = h;
  }

  let sent = 0;
  for (const [field, rec] of recs) {
    const cur = priceById[rec.hotelId];
    if (!cur || cur.price == null) continue;
    if (rec.baseline == null) {
      rec.baseline = cur.price; rec.currency = cur.currency;
      await kv.hset("alerts", field, JSON.stringify(rec));
    } else if (cur.price < rec.baseline) {
      await sendDropEmail(rec.email, cur, rec.baseline);
      sent++;
      rec.baseline = cur.price; // reset so we only alert on further drops
      await kv.hset("alerts", field, JSON.stringify(rec));
    }
  }
  res.status(200).json({ ok: true, watched: hotelIds.length, alerts: recs.length, sent });
}
