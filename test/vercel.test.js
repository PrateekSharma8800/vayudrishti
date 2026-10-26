// The Vercel side: the generated vercel.json and the serverless functions in api/.
// A fake provider stands in for IQAir and TomTom; req and res are minimal stand-ins for Node's.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const seen = [];
let provider;
before(async () => {
  provider = http.createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "success", echoed: req.url }));
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${provider.address().port}`;
  // must be set before lib/vercel.js is loaded, because it reads the environment once
  Object.assign(process.env, { IQAIR_API_KEY: "iq-key", TOMTOM_API_KEY: "tt-key", IQAIR_BASE: base, TOMTOM_BASE: base, RATE_LIMIT: "3" });
});
after(() => provider.close());

function call(handler, { method = "GET", url, ip = "9.9.9.9" }) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(body) { resolve({ status: this.statusCode, headers: this.headers, body }); } };
    Promise.resolve(handler({ method, url, headers: { "x-forwarded-for": ip }, socket: {} }, res)).catch(reject);
  });
}

test("vercel.json is generated from the page, so its CSP hash is never stale", () => {
  const { text } = require("../scripts/sync-vercel");
  assert.equal(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"), text, "run `npm run sync:vercel` and commit vercel.json");
});

test("vercel.json serves public/ with nothing to build, and sets the security headers", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.equal(cfg.outputDirectory, "public");
  assert.equal(cfg.buildCommand, null);
  const headers = Object.fromEntries(cfg.headers[0].headers.map((h) => [h.key, h.value]));
  assert.match(headers["Content-Security-Policy"], /script-src 'self' https:\/\/cdn\.jsdelivr\.net 'sha256-/);
  assert.match(headers["Strict-Transport-Security"], /max-age=/);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(/IQAIR_API_KEY|TOMTOM_API_KEY|key=/.test(JSON.stringify(cfg)), false, "no secrets in the config");
});

test("api/aqi and api/traffic call the right provider and add the key on the server", async () => {
  seen.length = 0;
  const aqi = await call(require("../api/aqi"), { url: "/api/aqi?lat=28.6315&lon=77.2167&key=attacker" });
  assert.equal(aqi.status, 200);
  assert.match(JSON.parse(aqi.body).echoed, /^\/v2\/nearest_city\?lat=28\.6315&lon=77\.2167&key=iq-key$/);
  const traffic = await call(require("../api/traffic"), { url: "/api/traffic?lat=28.6315&lon=77.2167" });
  assert.match(JSON.parse(traffic.body).echoed, /^\/traffic\/services\/4\/flowSegmentData\/absolute\/10\/json\?point=28\.6315,77\.2167&key=tt-key$/);
  assert.equal(seen.some((u) => u.includes("attacker")), false);
});

test("good readings are shared by Vercel's CDN and cached in the function", async () => {
  seen.length = 0;
  const handler = require("../api/aqi");
  const first = await call(handler, { url: "/api/aqi?lat=28.7&lon=77.1", ip: "1.1.1.1" });
  const second = await call(handler, { url: "/api/aqi?lat=28.7&lon=77.1", ip: "2.2.2.2" });
  assert.equal(first.headers["cache-control"], "public, max-age=0, s-maxage=600, stale-while-revalidate=60");
  assert.deepEqual([first.headers["x-cache"], second.headers["x-cache"]], ["MISS", "HIT"]);
  assert.equal(seen.length, 1, "the second visitor did not use the provider");
});

test("errors are never cached, and only GET and HEAD are accepted", async () => {
  const handler = require("../api/aqi");
  const bad = await call(handler, { url: "/api/aqi?lat=abc&lon=1", ip: "3.3.3.3" });
  assert.equal(bad.status, 400);
  assert.equal(bad.headers["cache-control"], "no-store");
  const post = await call(handler, { method: "POST", url: "/api/aqi?lat=1&lon=1", ip: "3.3.3.3" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
});

test("a visitor who sends too many requests is told to wait", async () => {
  const handler = require("../api/traffic");
  for (let i = 0; i < 3; i++) assert.equal((await call(handler, { url: `/api/traffic?lat=${i}&lon=1`, ip: "4.4.4.4" })).status, 200);
  const limited = await call(handler, { url: "/api/traffic?lat=9&lon=1", ip: "4.4.4.4" });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers["retry-after"]) > 0);
  assert.equal((await call(handler, { url: "/api/traffic?lat=9&lon=1", ip: "5.5.5.5" })).status, 200, "another visitor is unaffected");
});
