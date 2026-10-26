// The live-data proxy, shared by server.js and the Vercel functions in api/.
// It adds the API keys, validates the point, reuses recent readings and protects the free quotas.
function createLive(env = process.env) {
  const num = (v, fallback) => (v === undefined || v === "" ? fallback : Number(v));
  const cacheMs = num(env.CACHE_SECONDS, 600) * 1000;    // how long a reading is reused
  const rateLimit = num(env.RATE_LIMIT, 30);             // API requests per client per minute
  const dailyCap = num(env.DAILY_UPSTREAM_CAP, 400);     // calls to each provider per day
  const timeout = num(env.UPSTREAM_TIMEOUT_MS, 8000);    // stays under Vercel's 10 second function limit
  // the *_BASE overrides exist so tests can point the proxy at a fake provider
  const iqair = env.IQAIR_BASE || "https://api.airvisual.com";
  const tomtom = env.TOMTOM_BASE || "https://api.tomtom.com";
  const API = {
    "/api/aqi": { key: "IQAIR_API_KEY", url: (lat, lon, key) => `${iqair}/v2/nearest_city?lat=${lat}&lon=${lon}&key=${key}` },
    "/api/traffic": { key: "TOMTOM_API_KEY", url: (lat, lon, key) => `${tomtom}/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${key}` },
  };

  const cache = new Map(); // "route|lat|lon" -> { at, body }
  const hits = new Map();  // client -> { start, count }
  const daily = {};        // route -> { day, n }

  const fail = (status, error, retryAfter) => ({ status, body: JSON.stringify({ error }), retryAfter });

  function rateWait(client) {
    const now = Date.now(), h = hits.get(client);
    if (!h || now - h.start > 60000) { hits.set(client, { start: now, count: 1 }); return 0; }
    return ++h.count > rateLimit ? Math.ceil((h.start + 60000 - now) / 1000) : 0; // seconds to wait, or 0
  }
  setInterval(() => { const cutoff = Date.now() - 60000; for (const [k, h] of hits) if (h.start < cutoff) hits.delete(k); }, 60000).unref();

  function spendDaily(route) {
    const day = new Date().toISOString().slice(0, 10);
    if (!daily[route] || daily[route].day !== day) daily[route] = { day, n: 0 };
    if (daily[route].n >= dailyCap) return false;
    daily[route].n++;
    return true;
  }

  // Returns null for paths that are not live routes, otherwise { status, body, cache, retryAfter }.
  async function handle(pathname, query, client) {
    const api = API[pathname];
    if (!api) return null;
    const wait = rateWait(client);
    if (wait) return fail(429, `too many requests, try again in ${wait} seconds`, wait);
    const lat = parseFloat(query.get("lat")), lon = parseFloat(query.get("lon"));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return fail(400, "invalid lat/lon");
    const key = env[api.key];
    if (!key) return fail(500, `${api.key} is missing on the server`);
    const id = `${pathname}|${lat.toFixed(3)}|${lon.toFixed(3)}`, hit = cache.get(id);
    if (hit && Date.now() - hit.at < cacheMs) return { status: 200, body: hit.body, cache: "HIT" };
    if (!spendDaily(pathname)) return fail(429, "the daily limit for this data source is used up, try again tomorrow");
    try {
      const up = await fetch(api.url(lat, lon, encodeURIComponent(key)), { signal: AbortSignal.timeout(timeout) });
      const body = await up.text();
      if (up.status === 200) { // only good readings are reused
        cache.set(id, { at: Date.now(), body });
        if (cache.size > 500) cache.delete(cache.keys().next().value);
      }
      return { status: up.status, body, cache: "MISS" };
    } catch (e) { return fail(502, "could not reach the data provider"); }
  }
  return { handle, cacheSeconds: cacheMs / 1000 };
}

module.exports = { createLive };
