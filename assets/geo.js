/* Temple Yatra — geo engine (browser + Node). Pure math, no deps. */
(function (root) {
  "use strict";
  const R = 6371; // km
  const toRad = (d) => (d * Math.PI) / 180;

  function haversine(a, b) {
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function bearingDeg(a, b) {
    const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
    const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function compass(a, b) {
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearingDeg(a, b) / 45) % 8];
  }

  // "Temples on the way": temples within maxKm of the great-circle path A->B,
  // ordered by how far along the route they sit. Uses cross-track + along-track
  // distance — nobody pairs this with a temple coordinate set.
  function corridor(a, b, temples, maxKm = 60) {
    const ab = haversine(a, b);
    const t12 = toRad(bearingDeg(a, b));
    const out = [];
    for (const t of temples) {
      const d13 = haversine(a, t) / R;               // angular distance A->T
      const t13 = toRad(bearingDeg(a, t));
      const dxt = Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * R; // off-route
      const dat = Math.acos(Math.cos(d13) / Math.cos(dxt / R)) * R;   // along-route
      if (Math.abs(dxt) <= maxKm && dat >= -8 && dat <= ab + 8) {
        out.push({ temple: t, offsetKm: Math.abs(dxt), alongKm: Math.max(0, dat) });
      }
    }
    return out.sort((x, y) => x.alongKm - y.alongKm);
  }

  // nearest N temples to a point
  function nearest(me, temples, n = 8) {
    return temples
      .map((t) => ({ temple: t, km: haversine(me, t), dir: compass(me, t) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, n);
  }

  // optimal visiting order over a set (nearest-neighbour + 2-opt). Open path.
  function optimalRoute(temples, startIndex = null) {
    const n = temples.length;
    if (n < 2) return { order: temples.map((_, i) => i), total: 0 };
    const D = temples.map((a) => temples.map((b) => haversine(a, b)));
    const len = (p) => p.slice(1).reduce((s, _, i) => s + D[p[i]][p[i + 1]], 0);
    const nn = (start) => {
      const seen = new Set([start]), p = [start];
      while (p.length < n) {
        const last = p[p.length - 1];
        let best = -1, bd = Infinity;
        for (let j = 0; j < n; j++) if (!seen.has(j) && D[last][j] < bd) { bd = D[last][j]; best = j; }
        p.push(best); seen.add(best);
      }
      return p;
    };
    const twoOpt = (p0) => {
      let p = p0.slice(), improved = true;
      while (improved) {
        improved = false;
        for (let i = 1; i < n - 1; i++)
          for (let k = i + 1; k < n; k++) {
            const np = p.slice(0, i).concat(p.slice(i, k + 1).reverse(), p.slice(k + 1));
            if (len(np) < len(p) - 1e-9) { p = np; improved = true; }
          }
      }
      return p;
    };
    let best = null;
    const starts = startIndex != null ? [startIndex] : [...Array(n).keys()];
    for (const s of starts) {
      const p = twoOpt(nn(s));
      const L = len(p);
      if (!best || L < best.total) best = { order: p, total: L };
    }
    // cumulative distance per stop
    best.legs = best.order.map((_, i) => (i === 0 ? 0 : D[best.order[i - 1]][best.order[i]]));
    return best;
  }

  const API = { haversine, compass, bearingDeg, nearest, optimalRoute, corridor };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.Geo = API;
})(typeof window !== "undefined" ? window : globalThis);
