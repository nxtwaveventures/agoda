/*
 * /api/hotels — live hotel rates via Agoda Affiliate Long Tail Search.
 *   /api/hotels?cityId=9395
 *   /api/hotels?hotelId=463019,1144213
 *   &checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&currency=INR
 */
import { searchHotels, agodaReady } from "./_agoda.mjs";

export default async function handler(req, res) {
  const { cityId, hotelId, checkIn, checkOut, currency } = req.query || {};
  const hotelIds = hotelId ? String(hotelId).split(",") : null;

  if (!agodaReady) {
    return res.status(200).json({ source: "no-key", error: "AGODA_API_KEY not set in Vercel env", hotels: [] });
  }
  const { results, error } = await searchHotels({ cityId, hotelIds, checkIn, checkOut, currency });
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
  res.status(200).json({ source: "agoda-longtail", error: error || null, hotels: results });
}
