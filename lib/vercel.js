// Adapts lib/live.js and lib/xkdr.js to Vercel serverless functions ((req, res) with Node's http objects).
// Each file in api/ is a one-liner that calls route().
const { createLive } = require("./live");
const { createXkdr } = require("./xkdr");
const live = createLive(process.env);
const xkdr = createXkdr(process.env);

function route(pathname) {
  return async function handler(req, res) {
    const reply = (status, headers, body) => { res.statusCode = status; for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(body); };
    if (req.method !== "GET" && req.method !== "HEAD") {
      return reply(405, { Allow: "GET, HEAD", "Content-Type": "application/json" }, JSON.stringify({ error: "method not allowed" }));
    }
    // Vercel overwrites X-Forwarded-For with the real client address, so it is safe to trust here
    const client = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "unknown";
    const { searchParams } = new URL(req.url, "http://localhost");
    const r = (await live.handle(pathname, searchParams, client)) || (await xkdr.handle(pathname, searchParams, client));
    // a good answer is shared by Vercel's CDN, so repeat visitors never reach this function
    const cdn = r.cdnSeconds ?? live.cacheSeconds;
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": r.status === 200 ? `public, max-age=0, s-maxage=${cdn}, stale-while-revalidate=60` : "no-store",
    };
    if (r.cache) headers["X-Cache"] = r.cache;
    if (r.retryAfter) headers["Retry-After"] = String(r.retryAfter);
    reply(r.status, headers, r.body);
  };
}

module.exports = { route };
