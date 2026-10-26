// Local server: serves the page and proxies the live-data APIs so keys stay in .env.
// Run: node server.js  ->  http://localhost:8000
const http = require("http"), fs = require("fs"), path = require("path");
try { process.loadEnvFile(path.join(__dirname, ".env")); } catch (e) { /* no .env yet */ }

const PORT = process.env.PORT || 8000;
// only these files are served, so .env can never be fetched
const FILES = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/style.css": "style.css" };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const API = {
  "/api/aqi": { env: "IQAIR_API_KEY", url: (lat, lon, key) => `https://api.airvisual.com/v2/nearest_city?lat=${lat}&lon=${lon}&key=${key}` },
  "/api/traffic": { env: "TOMTOM_API_KEY", url: (lat, lon, key) => `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${key}` },
};
const send = (res, status, type, body) => { res.writeHead(status, { "Content-Type": type }); res.end(body); };
const fail = (res, status, error) => send(res, status, "application/json", JSON.stringify({ error }));

http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, "http://localhost");
  const api = API[pathname];
  if (api) {
    const lat = parseFloat(searchParams.get("lat")), lon = parseFloat(searchParams.get("lon"));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return fail(res, 400, "invalid lat/lon");
    const key = process.env[api.env];
    if (!key) return fail(res, 500, `${api.env} is missing in .env`);
    try {
      const up = await fetch(api.url(lat, lon, encodeURIComponent(key)), { signal: AbortSignal.timeout(10000) });
      return send(res, up.status, "application/json", await up.text());
    } catch (e) { return fail(res, 502, "could not reach the data provider"); }
  }
  const file = FILES[pathname];
  if (!file) return fail(res, 404, "not found");
  send(res, 200, TYPES[path.extname(file)], fs.readFileSync(path.join(__dirname, file)));
}).listen(PORT, "127.0.0.1", () => console.log(`VayuDrishti on http://localhost:${PORT}`));
