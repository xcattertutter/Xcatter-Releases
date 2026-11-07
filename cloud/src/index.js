const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-torchtrack-key",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const seasonOk = (value) => typeof value === "string" && /^[a-z0-9-]{3,32}$/i.test(value);

async function contributorHash(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function upload(request, env) {
  if (!env.INGEST_KEY || request.headers.get("x-torchtrack-key") !== env.INGEST_KEY) return json({ error: "Invalid sharing key" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!seasonOk(body?.season) || typeof body?.contributor_id !== "string" || !Array.isArray(body?.samples)) return json({ error: "Invalid payload" }, 400);
  if (body.samples.length > 2000) return json({ error: "Maximum 2000 samples per upload" }, 413);
  const contributor = await contributorHash(body.contributor_id);
  const statements = [];
  for (const sample of body.samples) {
    const itemId = Number(sample.item_id); const price = Number(sample.price_fe);
    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(price) || price <= 0 || price > 100000000) continue;
    const observedAt = Number.isFinite(Date.parse(sample.observed_at)) ? sample.observed_at : new Date().toISOString();
    statements.push(env.DB.prepare(`INSERT INTO price_samples (season,item_id,item_name,contributor_hash,price_fe,observed_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(season,item_id,contributor_hash) DO UPDATE SET
      item_name=excluded.item_name, price_fe=excluded.price_fe, observed_at=excluded.observed_at
      WHERE excluded.observed_at >= price_samples.observed_at`).bind(body.season, itemId, String(sample.name || "").slice(0, 160), contributor, price, observedAt));
  }
  if (statements.length) await env.DB.batch(statements);
  return json({ accepted: statements.length });
}

async function prices(request, env) {
  const season = new URL(request.url).searchParams.get("season") || "ss14-tartarus";
  if (!seasonOk(season)) return json({ error: "Invalid season" }, 400);
  const result = await env.DB.prepare("SELECT item_id,item_name,price_fe,observed_at FROM price_samples WHERE season=? ORDER BY item_id,price_fe").bind(season).all();
  const groups = new Map();
  for (const row of result.results || []) {
    if (!groups.has(row.item_id)) groups.set(row.item_id, []);
    groups.get(row.item_id).push(row);
  }
  const output = [];
  for (const [itemId, rows] of groups) {
    const middle = Math.floor(rows.length / 2);
    const value = rows.length % 2 ? rows[middle].price_fe : (rows[middle - 1].price_fe + rows[middle].price_fe) / 2;
    output.push({ id: itemId, name_en: rows.find((row) => row.item_name)?.item_name || null, price_fe: value, contributors: rows.length, updated_at: rows.map((row) => row.observed_at).sort().at(-1) });
  }
  return json({ meta: { schema: "torchtrack-cloud-v1", season, generated_at: new Date().toISOString(), count: output.length }, prices: output });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    try {
      if (path === "/health" && request.method === "GET") return json({ ok: true, service: "TorchTrack Community Prices" });
      if (path === "/v1/samples" && request.method === "POST") return upload(request, env);
      if (path === "/v1/prices" && request.method === "GET") return prices(request, env);
      return json({ error: "Not found" }, 404);
    } catch (error) { return json({ error: "Service error", detail: String(error?.message || error) }, 500); }
  },
};
