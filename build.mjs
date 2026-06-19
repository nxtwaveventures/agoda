/*
 * Temples of India — static site generator.
 * Reads data/temples.json and emits:
 *   - index.html              (searchable directory homepage)
 *   - temples/<slug>.html      (one SEO page per temple, with JSON-LD)
 *   - sitemap.xml
 * Pure Node, no dependencies. Run: node build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const SITE = process.env.SITE_URL || "https://etoffe.co.in";
const BRAND = "Etoffe"; // brand/wordmark — single source of truth
const TAGLINE = "every temple, one place";
const AGODA_CID = process.env.AGODA_CID || "1967296"; // your Agoda Partner CID
const OUT = ".";

const temples = JSON.parse(readFileSync("data/temples.json", "utf8"));

// --- Agoda India hotels (real, bookable cards) ---
let HOTELS = [];
try { HOTELS = JSON.parse(readFileSync("data/agoda-india.json", "utf8")); } catch { /* optional at build */ }
const _R = 6371, _rad = (d) => (d * Math.PI) / 180;
function hkm(a, b) {
  const dLat = _rad(b.lat - a.lat), dLon = _rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(_rad(a.lat)) * Math.cos(_rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * _R * Math.asin(Math.sqrt(s));
}
const _CELL = 0.5, _grid = new Map();
for (const h of HOTELS) { const k = Math.floor(h.lat / _CELL) + "," + Math.floor(h.lon / _CELL); let a = _grid.get(k); if (!a) { a = []; _grid.set(k, a); } a.push(h); }
function nearestHotels(t, n = 3) {
  if (!HOTELS.length) return [];
  const ci = Math.floor(t.lat / _CELL), cj = Math.floor(t.lon / _CELL);
  let cand = [];
  for (let r = 1; r <= 6; r++) {
    cand = [];
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const a = _grid.get(i + "," + j); if (a) cand.push(...a); }
    if (cand.length >= n * 4) break;
  }
  return cand.map((h) => ({ h, km: hkm(t, h) })).sort((a, b) => a.km - b.km).slice(0, n).map((x) => x.h);
}

// ---- helpers ---------------------------------------------------------------
const esc = (s = "") =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// Agoda affiliate deep link for "hotels near <place>"
const agoda = (place) => `https://www.agoda.com/search?cid=${AGODA_CID}&textToSearch=${encodeURIComponent(place)}`;

// Real bookable hotel cards (nearest hotels from the Agoda data file)
function hotelsSection(t) {
  const list = nearestHotels(t, 3);
  if (!list.length) {
    return `<a class="book-cta" href="${agoda("hotels near " + t.name + ", " + (t.town || t.state))}" target="_blank" rel="sponsored noopener">🏨 Book a stay near ${esc(t.name)}</a>`;
  }
  const cards = list.map((h) => {
    const photo = (h.photo || "").replace(/^http:/, "https:");
    const book = h.url + (h.url.includes("?") ? "&" : "?") + "cid=" + AGODA_CID;
    const meta = [h.star ? h.star + "★" : "", h.score ? h.score + "/10" : "", h.reviews ? h.reviews.toLocaleString() + " reviews" : ""].filter(Boolean).join(" · ");
    return `<article class="hotel">
      <a class="hotel-photo" href="${book}" target="_blank" rel="sponsored noopener">${photo ? `<img src="${esc(photo)}" loading="lazy" alt="${esc(h.name)}">` : ""}</a>
      <div class="hotel-info">
        <h3>${esc(h.name)}</h3>
        <p class="hotel-meta">${esc(meta || h.city || "")}</p>
        <div class="hotel-actions">
          <a class="book-btn" href="${book}" target="_blank" rel="sponsored noopener">Book on Agoda →</a>
          <button class="alert-btn" data-hid="${esc(h.id)}" data-name="${esc(h.name)}">🔔 Price-drop alert</button>
        </div>
      </div>
    </article>`;
  }).join("");
  return `<section class="hotels"><h2>Where to stay near ${esc(t.name)}</h2><div class="hotel-cards">${cards}</div></section>`;
}

const head = (title, desc, canonical, extraHead = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="website" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9B%95%3C/text%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Mukta:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="${canonical.includes("/temples/") ? "../assets/temple.css" : "assets/temple.css"}" />
${extraHead}
</head>`;

const nav = (root = "") => `<header class="topbar">
  <a class="brand" href="${root}index.html" aria-label="${BRAND}"><span class="om">ॐ</span></a>
  <nav><a href="${root}stays.html">Stays</a> <a href="${root}index.html">Temples</a> <a href="${root}journey.html">Journeys</a> <a class="navcta" href="${root}yatra.html">Near Me</a></nav>
</header>`;

const footer = `<footer class="sitefoot">
  <p><strong>${BRAND}</strong> — a free, sourced encyclopedia of India's temples.</p>
  <p class="disc">Facts are compiled from public sources (cited on each page). Timings, darshan rules and access change often — always confirm with the temple before you travel. Legends are noted as tradition, not historical fact.</p>
</footer>`;

// ---- temple page -----------------------------------------------------------
function templePage(t) {
  const canonical = `${SITE}/temples/${t.slug}.html`;
  const desc = `${t.name} in ${t.town}, ${t.state}. History, significance, architecture, timings, festivals and how to reach. ${t.significance}`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": ["HinduTemple", "TouristAttraction", "Place"],
    name: t.name,
    description: t.significance,
    address: {
      "@type": "PostalAddress",
      addressLocality: t.town,
      addressRegion: t.state,
      addressCountry: "IN",
    },
    geo: { "@type": "GeoCoordinates", latitude: t.lat, longitude: t.lon },
    url: canonical,
    isAccessibleForFree: true,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: BRAND, item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: t.name, item: canonical },
    ],
  };

  const li = (label, val) =>
    val ? `<div class="fact"><dt>${label}</dt><dd>${esc(val)}</dd></div>` : "";
  const festivals = (t.festivals || []).map((f) => `<span class="tag">${esc(f)}</span>`).join("");
  const sources = (t.sources || [])
    .map((u) => `<li><a href="${esc(u)}" rel="nofollow noopener" target="_blank">${esc(u.replace(/^https?:\/\//, ""))}</a></li>`)
    .join("");

  const extraHead =
    `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` +
    `<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;

  return `${head(`${t.name} — History, Timings & How to Reach | ${BRAND}`, desc, canonical, extraHead)}
<body>
${nav("../")}
<main class="temple">
  <nav class="crumbs"><a href="../index.html">All Temples</a> <span>›</span> ${esc(t.name)}</nav>
  <p class="eyebrow">${esc(t.category)} · ${esc(t.state)}</p>
  <h1>${esc(t.name)}</h1>
  <p class="lead">${esc(t.significance)}</p>

  <div class="quickfacts">
    <dl>
      ${li("Primary deity", t.deity)}
      ${li("Location", `${t.town}, ${t.state}`)}
      ${li("Category", t.category)}
      ${li("Coordinates", `${t.lat}, ${t.lon}`)}
    </dl>
    <a class="mapbtn" href="https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lon}" target="_blank" rel="noopener">View on map →</a>
  </div>

  ${hotelsSection(t)}

  ${t.history ? `<section><h2>History</h2><p>${esc(t.history)}</p></section>` : ""}
  ${t.architecture ? `<section><h2>Architecture</h2><p>${esc(t.architecture)}</p></section>` : ""}
  ${t.legend ? `<section><h2>Legend &amp; tradition</h2><p>${esc(t.legend)}</p></section>` : ""}
  ${festivals ? `<section><h2>Festivals</h2><div class="tags">${festivals}</div></section>` : ""}
  ${t.timings ? `<section><h2>Darshan &amp; timings</h2><p>${esc(t.timings)}</p></section>` : ""}
  ${t.howToReach ? `<section><h2>How to reach</h2><p>${esc(t.howToReach)}</p></section>` : ""}
  ${!t.history && !t.architecture ? `<section class="pending"><p><em>Detailed history and visiting information for this temple are being compiled and verified. ${sources ? "See the source below in the meantime." : ""}</em></p></section>` : ""}
  ${sources ? `<section class="sources"><h2>Sources</h2><ul>${sources}</ul></section>` : ""}

</main>
${footer}
<script src="../assets/alert.js"></script>
</body></html>`;
}

// ---- index page ------------------------------------------------------------
function indexPage() {
  const canonical = `${SITE}/`;
  const desc =
    "A free, sourced encyclopedia of India's temples — history, architecture, timings, festivals and how to reach, from the great Jyotirlingas to the smallest local shrines.";
  const cards = temples
    .map(
      (t) => `<a class="card" href="temples/${t.slug}.html" data-search="${esc(
        (t.name + " " + t.town + " " + t.state + " " + t.category + " " + t.deity).toLowerCase()
      )}">
      <span class="card-eyebrow">${esc(t.category)} · ${esc(t.state)}</span>
      <h3>${esc(t.name)}</h3>
      <p>${esc(t.town)}</p>
      <span class="card-go">Read →</span>
    </a>`
    )
    .join("\n");

  const states = [...new Set(temples.map((t) => t.state))].sort();

  return `${head(`${BRAND} — ${TAGLINE} · A Sourced Encyclopedia`, desc, canonical)}
<body>
${nav("")}
<main class="home">
  <section class="hero">
    <p class="eyebrow"><i>ॐ</i> must to visit</p>
    <h1>everything worth<br />visiting, near you.</h1>
    <p class="lead">Exploration is the key to human nature — <em>explore the world through god's eye.</em></p>
    <div class="searchwrap">
      <input id="q" type="search" placeholder='Try "Kashi Vishwanath", "Tamil Nadu", or "Jyotirlinga"…' aria-label="Search temples" />
    </div>
    <div class="examples" id="exs">
      <button class="chip" type="button">Jyotirlinga</button>
      <button class="chip" type="button">Varanasi</button>
      <button class="chip" type="button">Tamil Nadu</button>
      <button class="chip" type="button">Shiva</button>
      <button class="chip" type="button">Odisha</button>
    </div>
    <p class="stat"><strong id="count">${temples.length}</strong> temples and counting · ${states.length} states</p>
  </section>

  <section class="nearyou" id="nearYou" hidden>
    <p class="nearyou-sub" id="nearYouSub"></p>
    <h2 class="sec-title">Top destinations near you</h2>
    <div class="near-grid ny" id="destGrid"></div>
    <h2 class="sec-title">🔥 Top hotel deals near you</h2>
    <div class="hotel-cards deals" id="dealGrid"></div>
  </section>

  <section class="grid" id="grid">
    ${cards}
  </section>
  <p class="noresult" id="noresult" hidden>No temples match that search yet — more are being added.</p>
</main>
${footer}
<script src="temples-data.js"></script>
<script src="cities-data.js"></script>
<script src="assets/geo.js"></script>
<script>
  const q = document.getElementById('q');
  const cards = [...document.querySelectorAll('.card')];
  const count = document.getElementById('count');
  const noresult = document.getElementById('noresult');
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) {
      const hit = !v || c.dataset.search.includes(v);
      c.style.display = hit ? '' : 'none';
      if (hit) shown++;
    }
    count.textContent = shown;
    noresult.hidden = shown !== 0;
  });
  var exs = document.getElementById('exs');
  if (exs) exs.addEventListener('click', function (e) {
    if (e.target.classList.contains('chip')) { q.value = e.target.textContent; q.dispatchEvent(new Event('input')); }
  });
</script>
<script>
  // Auto-locate every visitor by IP (silent, city-level) and surface the
  // nearest temples + Agoda stay links the moment they land.
  (function () {
    var CID = window.__AGODA_CID__ || "1967296";
    var T = window.__TEMPLES__ || [];
    var P = window.__PLACES__ || {};
    var CITIES = window.__CITIES__ || [];
    if (!window.Geo) return;
    var ALL = T.concat(P.spot || [], P.park || []);
    var agoda = function (place) { return "https://www.agoda.com/search?cid=" + encodeURIComponent(CID) + "&textToSearch=" + encodeURIComponent(place); };
    var money = function (c, v) { return v != null ? (c || "") + " " + Number(v).toLocaleString() : ""; };

    function destCard(n) {
      var t = n.temple, h = t.hotel;
      var stay = h
        ? '<a class="ny-hotel" href="' + h.url + '" target="_blank" rel="sponsored noopener">'
          + (h.photo ? '<img src="' + h.photo + '" loading="lazy" alt="">' : '')
          + '<div class="ny-hotel-info"><strong>Stay: ' + h.name + '</strong><span>'
          + (h.star ? h.star + '★ ' : '') + (h.score ? h.score + '/10 · ' : '') + 'Book on Agoda →</span></div></a>'
        : '<a class="ny-hotel none" href="' + agoda("hotels near " + t.name + ", " + (t.town || "")) + '" target="_blank" rel="sponsored noopener">🏨 Find a stay near here →</a>';
      var read = t.slug
        ? '<a class="cta-temple" href="temples/' + t.slug + '.html">Read about it →</a>'
        : '<a class="cta-temple" href="https://www.google.com/maps/search/?api=1&query=' + t.lat + ',' + t.lon + '" target="_blank" rel="noopener">View on map →</a>';
      return '<article class="ny-card"><div class="ny-temple"><span class="ny-km">' + Math.round(n.km) + ' km ' + n.dir + '</span>'
        + '<h3>' + t.name + '</h3><p>' + (t.town || "") + '</p>' + read + '</div>' + stay + '</article>';
    }
    function dealCard(h) {
      var img = (h.image || "").replace(/^http:/, "https:");
      var off = h.discount ? '<span class="off">-' + Math.round(h.discount) + '%</span>' : '';
      var price = h.price != null ? '<span class="price">' + (h.was && h.was > h.price ? '<s>' + money(h.currency, h.was) + '</s> ' : '') + '<b>' + money(h.currency, h.price) + '</b></span>' : '';
      return '<article class="hotel deal"><a class="hotel-photo" href="' + h.bookUrl + '" target="_blank" rel="sponsored noopener">'
        + (img ? '<img src="' + img + '" loading="lazy" alt="">' : '') + off + '</a>'
        + '<div class="hotel-info"><h3>' + h.name + '</h3>'
        + '<p class="hotel-meta">' + (h.rating ? h.rating + '★ ' : '') + (h.reviewScore ? h.reviewScore + '/10' : '') + '</p>'
        + '<div class="hotel-actions">' + price + '<a class="book-btn" href="' + h.bookUrl + '" target="_blank" rel="sponsored noopener">Book →</a></div></div></article>';
    }
    function embeddedDeals(me) {
      return Geo.nearest(me, ALL, 14).map(function (n) { return n.temple.hotel; }).filter(Boolean).slice(0, 3)
        .map(function (h) { return dealCard({ name: h.name, image: h.photo, bookUrl: h.url, rating: h.star, reviewScore: h.score }); }).join("");
    }
    function nearestCityId(me) {
      var best = null, bd = 1e9;
      for (var i = 0; i < CITIES.length; i++) { var d = Geo.haversine(me, CITIES[i]); if (d < bd) { bd = d; best = CITIES[i]; } }
      return best ? best.id : null;
    }
    function renderDeals(me) {
      var grid = document.getElementById("dealGrid");
      var cid = nearestCityId(me);
      var fb = function () { grid.innerHTML = embeddedDeals(me) || '<p class="nearyou-sub">Live deals appear here once the API is live.</p>'; };
      if (!cid) { fb(); return; }
      fetch("/api/deals?cityId=" + encodeURIComponent(cid)).then(function (r) { return r.json(); }).then(function (d) {
        var list = (d.deals || []).slice(0, 3);
        if (!list.length) { fb(); return; }
        grid.innerHTML = list.map(dealCard).join("");
      }).catch(fb);
    }
    function topAttractions(me) {
      var picks = [], used = {};
      [["temple", T], ["spot", P.spot || []], ["beach", P.beach || []]].forEach(function (pair) {
        if (pair[1].length) { var n = Geo.nearest(me, pair[1], 1)[0]; if (n) { picks.push(n); used[n.temple.name] = 1; } }
      });
      while (picks.length < 3) { // top up with nearest remaining (parks/spots) if a category was empty
        var n2 = Geo.nearest(me, ALL.concat(P.park || []), picks.length + 2).filter(function (x) { return !used[x.temple.name]; })[0];
        if (!n2) break; picks.push(n2); used[n2.temple.name] = 1;
      }
      return picks;
    }
    function show(me, label) {
      document.getElementById("destGrid").innerHTML = topAttractions(me).map(destCard).join("");
      renderDeals(me);
      document.getElementById("nearYouSub").textContent = label;
      document.getElementById("nearYou").hidden = false;
      document.getElementById("nearYou").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    fetch("https://get.geojs.io/v1/ip/geo.json").then(function (r) { return r.json(); }).then(function (g) {
      var lat = parseFloat(g.latitude), lon = parseFloat(g.longitude);
      if (isFinite(lat) && isFinite(lon)) show({ lat: lat, lon: lon }, g.city ? "Near " + g.city : "Near you");
    }).catch(function () {});
  })();
</script>
</body></html>`;
}

// ---- sitemap ---------------------------------------------------------------
function sitemap() {
  const urls = [`${SITE}/`, ...temples.map((t) => `${SITE}/temples/${t.slug}.html`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
}

// ---- write -----------------------------------------------------------------
rmSync("temples", { recursive: true, force: true });
mkdirSync("temples", { recursive: true });
for (const t of temples) {
  writeFileSync(`temples/${t.slug}.html`, templePage(t));
}
writeFileSync(`${OUT}/index.html`, indexPage());
writeFileSync(`${OUT}/sitemap.xml`, sitemap());

// browser data feed for the Yatra planner (minimal fields)
const pub = temples.map((t) => {
  const h = nearestHotels(t, 1)[0];
  const hotel = h ? {
    name: h.name,
    photo: (h.photo || "").replace(/^http:/, "https:"),
    star: h.star, score: h.score,
    url: h.url + (h.url.includes("?") ? "&" : "?") + "cid=" + AGODA_CID,
  } : null;
  return { slug: t.slug, name: t.name, town: t.town, state: t.state, lat: t.lat, lon: t.lon, category: t.category, hotel };
});

// general travel places (parks + famous spots) with a nearest hotel each
let PLACES = [];
try { PLACES = JSON.parse(readFileSync("data/places.json", "utf8")); } catch { /* optional */ }
const placePub = PLACES.map((p) => {
  const h = nearestHotels(p, 1)[0];
  const hotel = h ? {
    name: h.name, photo: (h.photo || "").replace(/^http:/, "https:"), star: h.star, score: h.score,
    url: h.url + (h.url.includes("?") ? "&" : "?") + "cid=" + AGODA_CID,
  } : null;
  return { kind: p.kind, name: p.name, town: p.town, lat: p.lat, lon: p.lon, hotel };
});
const placesByKind = { spot: placePub.filter((p) => p.kind === "spot"), park: placePub.filter((p) => p.kind === "park"), beach: placePub.filter((p) => p.kind === "beach") };
writeFileSync(`${OUT}/temples-data.json`, JSON.stringify(pub));
// also as JS so the planner works when opened via file:// (fetch is blocked there)
writeFileSync(`${OUT}/temples-data.js`, `window.__AGODA_CID__=${JSON.stringify(AGODA_CID)};\nwindow.__TEMPLES__ = ${JSON.stringify(pub)};\nwindow.__PLACES__ = ${JSON.stringify(placesByKind)};`);
try { const _c = JSON.parse(readFileSync("data/cities.json", "utf8")); writeFileSync(`${OUT}/cities-data.js`, `window.__CITIES__=${JSON.stringify(_c)};`); } catch { /* optional */ }

// general "Stays" index: top Indian cities, top hotels each (compact, shippable)
if (HOTELS.length) {
  const byCity = new Map();
  for (const h of HOTELS) { if (!h.city) continue; let a = byCity.get(h.city); if (!a) { a = []; byCity.set(h.city, a); } a.push(h); }
  const stays = [...byCity.entries()]
    .sort((a, b) => b[1].length - a[1].length).slice(0, 60)
    .map(([city, arr]) => ({
      city,
      hotels: arr.sort((a, b) => b.reviews - a.reviews).slice(0, 12).map((h) => ({
        id: h.id, name: h.name, star: h.star, score: h.score, reviews: h.reviews,
        photo: (h.photo || "").replace(/^http:/, "https:"),
        url: h.url + (h.url.includes("?") ? "&" : "?") + "cid=" + AGODA_CID,
      })),
    }));
  writeFileSync(`${OUT}/stays-data.js`, `window.__AGODA_CID__=${JSON.stringify(AGODA_CID)};\nwindow.__STAYS__=${JSON.stringify(stays)};`);
}

console.log(`✓ Built ${temples.length} temple pages + index + sitemap + data feed (brand: ${BRAND})`);
