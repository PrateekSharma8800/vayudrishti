// Serves the page and proxies the live-data APIs so the keys stay on the server.
// Local:  node server.js            ->  http://localhost:8000   (keys from .env)
// Deploy: set HOST=0.0.0.0 and the two API keys as environment variables; see README.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
try { process.loadEnvFile(process.env.VAYU_ENV_FILE || path.join(__dirname, ".env")); } catch (e) { /* no .env: use real environment variables */ }

const PORT = Number(process.env.PORT ?? 8000); // PORT=0 picks a free port (used by the tests)
const HOST = process.env.HOST || "127.0.0.1";  // local only unless you set HOST=0.0.0.0 to deploy
const TRUST_PROXY = process.env.TRUST_PROXY === "1"; // behind a platform proxy: read the client IP from X-Forwarded-For
const CACHE_MS = Number(process.env.CACHE_SECONDS ?? 600) * 1000;   // how long a reading is reused
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 30);            // API requests per client per minute
const DAILY_CAP = Number(process.env.DAILY_UPSTREAM_CAP ?? 400);    // calls to each provider per day (free tiers are small)

// only these files are served, so .env can never be fetched
const FILES = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/style.css": "style.css" };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
// the *_BASE overrides exist so tests can point the proxy at a fake provider
const IQAIR = process.env.IQAIR_BASE || "https://api.airvisual.com";
const TOMTOM = process.env.TOMTOM_BASE || "https://api.tomtom.com";
const API = {
  "/api/aqi": { env: "IQAIR_API_KEY", url: (lat, lon, key) => `${IQAIR}/v2/nearest_city?lat=${lat}&lon=${lon}&key=${key}` },
  "/api/traffic": { env: "TOMTOM_API_KEY", url: (lat, lon, key) => `${TOMTOM}/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${key}` },
};

// A content security policy for the page. The one inline script (theme + js flag in <head>)
// is allowed by its hash, computed from the file we actually serve.
const pageHtml = () => fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const inlineHashes = [...pageHtml().matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${crypto.createHash("sha256").update(m[1].replace(/\r\n?/g, "\n")).digest("base64")}'`);
const CSP = [
  "default-src 'self'",
  `script-src 'self' https://cdn.jsdelivr.net ${inlineHashes.join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // inline style attributes set custom properties
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'",
].join("; ");
const SECURITY = {
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": CSP, "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
  ...(process.env.NODE_ENV === "production" ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
};
const send = (res, status, type, body, extra) => { res.writeHead(status, { "Content-Type": type, ...SECURITY, ...extra }); res.end(body); };
const fail = (res, status, error, extra) => send(res, status, "application/json", JSON.stringify({ error }), extra);

// ---- protecting the keys' free quota ----
const cache = new Map(); // "route|lat|lon" -> { at, status, body }
const hits = new Map();  // client -> { start, count }
const daily = {};        // route -> { day, n }
function allow(client) {
  const now = Date.now(), h = hits.get(client);
  if (!h || now - h.start > 60000) { hits.set(client, { start: now, count: 1 }); return 0; }
  return ++h.count > RATE_LIMIT ? Math.ceil((h.start + 60000 - now) / 1000) : 0; // seconds to wait, or 0
}
setInterval(() => { const cutoff = Date.now() - 60000; for (const [k, h] of hits) if (h.start < cutoff) hits.delete(k); }, 60000).unref();
function spendDaily(route) {
  const day = new Date().toISOString().slice(0, 10), d = daily[route];
  if (!d || d.day !== day) daily[route] = { day, n: 0 };
  if (daily[route].n >= DAILY_CAP) return false;
  daily[route].n++;
  return true;
}
const clientOf = (req) => (TRUST_PROXY && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method not allowed", { Allow: "GET, HEAD" });
    const { pathname, searchParams } = new URL(req.url, "http://localhost");
    if (pathname === "/healthz") return send(res, 200, "text/plain; charset=utf-8", "ok", { "Cache-Control": "no-store" });
    const api = API[pathname];
    if (api) {
      const wait = allow(clientOf(req));
      if (wait) return fail(res, 429, `too many requests, try again in ${wait} seconds`, { "Retry-After": String(wait) });
      const lat = parseFloat(searchParams.get("lat")), lon = parseFloat(searchParams.get("lon"));
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return fail(res, 400, "invalid lat/lon");
      const key = process.env[api.env];
      if (!key) return fail(res, 500, `${api.env} is missing on the server`);
      const id = `${pathname}|${lat.toFixed(3)}|${lon.toFixed(3)}`, hit = cache.get(id);
      if (hit && Date.now() - hit.at < CACHE_MS) return send(res, hit.status, "application/json", hit.body, { "Cache-Control": "no-store", "X-Cache": "HIT" });
      if (!spendDaily(pathname)) return fail(res, 429, "the daily limit for this data source is used up, try again tomorrow");
      try {
        const up = await fetch(api.url(lat, lon, encodeURIComponent(key)), { signal: AbortSignal.timeout(10000) });
        const body = await up.text();
        if (up.status === 200) { // only good readings are reused
          cache.set(id, { at: Date.now(), status: 200, body });
          if (cache.size > 500) cache.delete(cache.keys().next().value);
        }
        return send(res, up.status, "application/json", body, { "Cache-Control": "no-store", "X-Cache": "MISS" });
      } catch (e) { return fail(res, 502, "could not reach the data provider"); }
    }
    const file = FILES[pathname];
    if (!file) return fail(res, 404, "not found");
    send(res, 200, TYPES[path.extname(file)], fs.readFileSync(path.join(__dirname, file)), { "Cache-Control": "no-cache" });
  } catch (e) {
    fail(res, 500, "server error"); // never let one bad request take the server down
  }
});
server.listen(PORT, HOST, () => console.log(`VayuDrishti on http://localhost:${server.address().port} (listening on ${HOST})`));
