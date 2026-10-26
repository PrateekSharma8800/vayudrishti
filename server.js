// Serves the page and the live-data API from one small Node process.
// Local:  node server.js            ->  http://localhost:8000   (keys from .env)
// Deploy: set HOST=0.0.0.0 and the API keys as environment variables; see README.
// (On Vercel the same logic runs as the functions in api/ instead; see lib/vercel.js.)
const http = require("http"), fs = require("fs"), path = require("path");
try { process.loadEnvFile(process.env.VAYU_ENV_FILE || path.join(__dirname, ".env")); } catch (e) { /* no .env: use real environment variables */ }
const { createLive } = require("./lib/live");
const { createXkdr } = require("./lib/xkdr");
const { securityHeaders } = require("./lib/security");

const PORT = Number(process.env.PORT ?? 8000); // PORT=0 picks a free port (used by the tests)
const HOST = process.env.HOST || "127.0.0.1";  // local only unless you set HOST=0.0.0.0 to deploy
const TRUST_PROXY = process.env.TRUST_PROXY === "1"; // behind a platform proxy: read the client IP from X-Forwarded-For

// only these files are served, so .env can never be fetched
const FILES = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/style.css": "style.css" };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const SECURITY = securityHeaders(fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8"), { https: process.env.NODE_ENV === "production" });

const live = createLive(process.env);
const xkdr = createXkdr(process.env);
const send = (res, status, type, body, extra) => { res.writeHead(status, { "Content-Type": type, ...SECURITY, ...extra }); res.end(body); };
const fail = (res, status, error, extra) => send(res, status, "application/json", JSON.stringify({ error }), extra);
const clientOf = (req) => (TRUST_PROXY && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method not allowed", { Allow: "GET, HEAD" });
    const { pathname, searchParams } = new URL(req.url, "http://localhost");
    if (pathname === "/healthz") return send(res, 200, "text/plain; charset=utf-8", "ok", { "Cache-Control": "no-store" });
    const client = clientOf(req);
    const result = (await live.handle(pathname, searchParams, client)) || (await xkdr.handle(pathname, searchParams, client));
    if (result) {
      const extra = { "Cache-Control": "no-store" };
      if (result.cache) extra["X-Cache"] = result.cache;
      if (result.retryAfter) extra["Retry-After"] = String(result.retryAfter);
      return send(res, result.status, "application/json", result.body, extra);
    }
    const file = FILES[pathname];
    if (!file) return fail(res, 404, "not found");
    send(res, 200, TYPES[path.extname(file)], fs.readFileSync(path.join(__dirname, "public", file)), { "Cache-Control": "no-cache" });
  } catch (e) {
    fail(res, 500, "server error"); // never let one bad request take the server down
  }
});
server.listen(PORT, HOST, () => console.log(`VayuDrishti on http://localhost:${server.address().port} (listening on ${HOST})`));
