/*
 * /api/hotels — Vercel serverless function.
 * Holds the Agoda API key server-side and returns normalized hotel cards for
 * the journey / temple pages.
 *
 * Query: /api/hotels?cityId=NNN   (preferred — resolved from the Hotel Data File)
 *        /api/hotels?lat=..&lon=..&name=..   (we map to nearest cityId)
 *
 * Env (set in Vercel → Settings → Environment Variables):
 *   AGODA_API_KEY   — your Affiliate Lite API key
 *   AGODA_SITE_ID   — your CID (1967296)
 *
 * Until the Affiliate Lite endpoint/params are wired (see TODO), this returns a
 * graceful fallback card that deep-links to Agoda search (still affiliate-tracked).
 */
const SITE_ID = process.env.AGODA_SITE_ID || "1967296";
const API_KEY = process.env.AGODA_API_KEY || "";

function deepLink(query) {
  return `https://www.agoda.com/search?cid=${encodeURIComponent(SITE_ID)}&textToSearch=${encodeURIComponent(query)}`;
}

export default async function handler(req, res) {
  const { cityId, lat, lon, name = "" } = req.query || {};
  const label = name || (cityId ? `city ${cityId}` : `${lat},${lon}`);

  // ---- TODO: real Affiliate Lite API call (needs spec from Affiliate_Lite_API_V2.0.pdf) ----
  // Shape will be roughly:
  //   const r = await fetch(`${AFFILIATE_LITE_BASE}/...?cityId=${cityId}&...`, {
  //     headers: { Authorization: `${SITE_ID}:${API_KEY}` }  // exact header per the PDF
  //   });
  //   const data = await r.json();
  //   const hotels = data.results.map(h => ({
  //     name: h.hotelName, image: h.imageURL, price: h.dailyRate, currency: h.currency,
  //     rating: h.starRating, reviewScore: h.reviewScore, bookUrl: h.landingURL,
  //   }));
  //   return res.status(200).json({ source: "agoda-affiliate-lite", hotels });

  if (!API_KEY) {
    // No key configured yet → fallback so the UI still works and still earns.
    return res.status(200).json({
      source: "fallback-deeplink",
      hotels: [{
        name: `Hotels near ${label}`,
        image: null, price: null, currency: null, rating: null, reviewScore: null,
        bookUrl: deepLink(`hotels near ${label}`),
      }],
    });
  }

  // key present but real call not wired yet → same safe fallback
  return res.status(200).json({
    source: "fallback-deeplink-keyed",
    hotels: [{
      name: `Hotels near ${label}`,
      image: null, price: null, currency: null, rating: null, reviewScore: null,
      bookUrl: deepLink(`hotels near ${label}`),
    }],
  });
}
