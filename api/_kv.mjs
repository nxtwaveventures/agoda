/*
 * Tiny Vercel KV (Upstash Redis) client over REST — no SDK dependency.
 * Enable "KV" on the Vercel project; it auto-sets KV_REST_API_URL + KV_REST_API_TOKEN.
 */
const URL = process.env.KV_REST_API_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || "";
export const kvEnabled = !!(URL && TOKEN);

async function cmd(args) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => ({}));
  return j.result;
}

export const kv = {
  hset: (key, field, value) => cmd(["HSET", key, field, value]),
  hdel: (key, field) => cmd(["HDEL", key, field]),
  // Upstash HGETALL returns a flat [field, value, field, value, ...] array
  hgetall: async (key) => {
    const flat = (await cmd(["HGETALL", key])) || [];
    const obj = {};
    for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
    return obj;
  },
};
