/*
 * /api/deals?cityId=NNN  (or ?lat=&lon=)  → top discounted hotels in that city,
 * live from Agoda Affiliate Long Tail Search, sorted by discount %.
 */
import { searchHotels, agodaReady } from "./_agoda.mjs";

export default async function handler(req, res) {
  const { cityId, currency } = req.query || {};
  if (!agodaReady) return res.status(200).json({ error: "AGODA_API_KEY not set", deals: [] });
  if (!cityId) return res.status(400).json({ error: "cityId required", deals: [] });

  const { results, error } = await searchHotels({ cityId, currency, maxResult: 25 });
  const withDeal = (results || []).filter((h) => h.discount > 0).sort((a, b) => b.discount - a.discount);
  const deals = (withDeal.length ? withDeal : results || []).slice(0, 6);
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=86400");
  res.status(200).json({ cityId, error: error || null, deals });
}
