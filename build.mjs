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
const AGODA_CID = process.env.AGODA_CID || "YOUR_AGODA_CID"; // your Agoda Partner CID
const OUT = ".";

const temples = JSON.parse(readFileSync("data/temples.json", "utf8"));

// ---- helpers ---------------------------------------------------------------
const esc = (s = "") =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

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
  <a class="brand" href="${root}index.html"><span class="om">ॐ</span> ${BRAND}</a>
  <nav><a href="${root}index.html">All Temples</a> <a class="navcta" href="${root}yatra.html">Plan a Yatra</a></nav>
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
    <p class="eyebrow"><i>ॐ</i> ${esc(BRAND.toLowerCase())}</p>
    <h1>every temple,<br />one place.</h1>
    <p class="lead">Exploration is the key to human nature — <em>explore the world through god's eye.</em></p>
    <div class="searchwrap">
      <input id="q" type="search" placeholder="Search a temple, town or state…" aria-label="Search temples" />
    </div>
    <p class="stat"><strong id="count">${temples.length}</strong> temples and counting · ${states.length} states</p>
  </section>

  <section class="nearyou" id="nearYou" hidden>
    <h2 class="sec-title">Temples near you</h2>
    <p class="nearyou-sub" id="nearYouSub"></p>
    <div class="near-grid" id="nearYouGrid"></div>
  </section>

  <section class="grid" id="grid">
    ${cards}
  </section>
  <p class="noresult" id="noresult" hidden>No temples match that search yet — more are being added.</p>
</main>
${footer}
<script src="temples-data.js"></script>
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
</script>
<script>
  // Auto-locate every visitor by IP (silent, city-level) and surface the
  // nearest temples + Agoda stay links the moment they land.
  (function () {
    var CID = window.__AGODA_CID__ || "YOUR_AGODA_CID";
    var T = window.__TEMPLES__ || [];
    if (!T.length || !window.Geo) return;
    function agoda(place) {
      return "https://www.agoda.com/search?cid=" + encodeURIComponent(CID) + "&textToSearch=" + encodeURIComponent(place);
    }
    function show(me, label) {
      var near = Geo.nearest(me, T, 6);
      document.getElementById("nearYouGrid").innerHTML = near.map(function (n) {
        var t = n.temple, place = t.name + ", " + (t.town || t.state);
        return '<article class="near-card">'
          + '<div class="near-top"><span class="km">' + Math.round(n.km) + ' km</span><span class="dir">' + n.dir + '</span></div>'
          + '<h3>' + t.name + '</h3><p>' + (t.town || t.state) + '</p>'
          + '<div class="near-cta"><a class="cta-hotel" href="' + agoda("hotels near " + place) + '" target="_blank" rel="sponsored noopener">🏨 Stay near here</a>'
          + '<a class="cta-temple" href="temples/' + t.slug + '.html">Read →</a></div>'
          + '</article>';
      }).join("");
      document.getElementById("nearYouSub").textContent = label;
      document.getElementById("nearYou").hidden = false;
      document.getElementById("nearYou").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    fetch("https://get.geojs.io/v1/ip/geo.json").then(function (r) { return r.json(); }).then(function (g) {
      var lat = parseFloat(g.latitude), lon = parseFloat(g.longitude);
      if (isFinite(lat) && isFinite(lon)) show({ lat: lat, lon: lon }, "Closest sacred sites to you" + (g.city ? " — near " + g.city : "") + ".");
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
const pub = temples.map((t) => ({ slug: t.slug, name: t.name, town: t.town, state: t.state, lat: t.lat, lon: t.lon, category: t.category }));
writeFileSync(`${OUT}/temples-data.json`, JSON.stringify(pub));
// also as JS so the planner works when opened via file:// (fetch is blocked there)
writeFileSync(`${OUT}/temples-data.js`, `window.__AGODA_CID__=${JSON.stringify(AGODA_CID)};\nwindow.__TEMPLES__ = ${JSON.stringify(pub)};`);

console.log(`✓ Built ${temples.length} temple pages + index + sitemap + data feed (brand: ${BRAND})`);
