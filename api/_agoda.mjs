/*
 * Shared Agoda Affiliate Long Tail Search client (server-side only).
 * Files prefixed with "_" are not treated as routes by Vercel.
 * Spec: Affiliate_Lite_API_V2.0.pdf  (endpoint lt_v1, Authorization: siteid:apikey)
 */
const BASE = process.env.AGODA_API_URL || "http://affiliateapi7643.agoda.com/affiliateservice/lt_v1";
const SITE_ID = process.env.AGODA_SITE_ID || "1967296";
const API_KEY = process.env.AGODA_API_KEY || "";

export const agodaReady = !!API_KEY;

export function defaultDates() {
  const d = new Date(); d.setDate(d.getDate() + 30);
  const ci = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 1);
  return { checkIn: ci, checkOut: d.toISOString().slice(0, 10) };
}

/**
 * Search live hotel rates. Provide either { cityId } or { hotelIds: [...] }.
 * Returns { results: [{hotelId,name,image,price,was,discount,currency,rating,reviewScore,bookUrl}], error }.
 */
export async function searchHotels({ hotelIds, cityId, checkIn, checkOut, currency = "INR", maxResult = 12 } = {}) {
  if (!API_KEY) return { error: "AGODA_API_KEY not set", results: [] };
  const dates = checkIn && checkOut ? { checkIn, checkOut } : defaultDates();
  const additional = {
    currency,
    discountOnly: false,
    language: "en-us",
    occupancy: { numberOfAdult: 2, numberOfChildren: 0 },
  };
  const criteria = { additional, checkInDate: dates.checkIn, checkOutDate: dates.checkOut };
  if (cityId) { additional.maxResult = maxResult; additional.sortBy = "Recommended"; criteria.cityId = Number(cityId); }
  else if (hotelIds && hotelIds.length) { criteria.hotelId = hotelIds.map(Number).filter(Boolean); }
  else return { error: "need cityId or hotelIds", results: [] };

  let data;
  try {
    const r = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip,deflate",
        Authorization: `${SITE_ID}:${API_KEY}`,
      },
      body: JSON.stringify({ criteria }),
    });
    data = await r.json();
  } catch (e) {
    return { error: "agoda request failed: " + e.message, results: [] };
  }
  if (data && data.error) return { error: data.error.message || "agoda error", results: [] };
  const results = (data.results || []).map((h) => ({
    hotelId: h.hotelId,
    name: h.hotelName,
    image: (h.imageURL || "").replace(/^http:/, "https:"),
    price: h.dailyRate,
    was: h.crossedOutRate,
    discount: h.discountPercentage,
    currency: h.currency,
    rating: h.starRating,
    reviewScore: h.reviewScore,
    bookUrl: h.landingURL,
    freeWifi: h.freeWifi,
    breakfast: h.includeBreakfast,
  }));
  return { results };
}
