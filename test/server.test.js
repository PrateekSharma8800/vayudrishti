// Tests for server.js: the file whitelist, input validation and the API proxy.
// A fake "provider" stands in for IQAir and TomTom so nothing touches the network.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

let provider, providerPort, server, base;
const seen = []; // requests the fake provider received

function startProvider() {
  return new Promise((resolve) => {
    provider = http.createServer((req, res) => {
      seen.push(req.url);
      if (req.url.includes("key=bad")) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "fail", data: { message: "incorrect_api_key" } }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success", echoed: req.url }));
    }).listen(0, "127.0.0.1", () => { providerPort = provider.address().port; resolve(); });
  });
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      env: { ...process.env, PORT: "0", VAYU_ENV_FILE: path.join(__dirname, "no-such.env"), IQAIR_API_KEY: "", TOMTOM_API_KEY: "", ...env },
    });
    child.stdout.on("data", (d) => { const m = /localhost:(\d+)/.exec(String(d)); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); });
    child.on("error", reject);
    setTimeout(() => reject(new Error("server did not start")), 5000);
  });
}

before(async () => {
  await startProvider();
  ({ child: server, base } = await startServer({
    IQAIR_API_KEY: "good-iq key", TOMTOM_API_KEY: "good-tt",
    IQAIR_BASE: `http://127.0.0.1:${providerPort}`, TOMTOM_BASE: `http://127.0.0.1:${providerPort}`,
  }));
});
after(() => { server.kill(); provider.close(); });

test("serves the three site files with security headers", async () => {
  for (const p of ["/", "/index.html", "/app.js", "/style.css"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  }
  assert.match((await fetch(base + "/app.js")).headers.get("content-type"), /javascript/);
});

test("never serves .env, source or git files", async () => {
  for (const p of ["/.env", "/.env.example", "/server.js", "/package.json", "/.git/config", "/%2e%2e/.env", "/..%2fserver.js", "/DESIGN.md"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
    assert.equal((await r.text()).includes("IQAIR_API_KEY="), false);
  }
});

test("only GET and HEAD are allowed", async () => {
  const r = await fetch(base + "/api/aqi?lat=1&lon=1", { method: "POST", body: "x" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET, HEAD");
});

test("rejects missing or out-of-range coordinates", async () => {
  for (const q of ["", "?lat=abc&lon=1", "?lat=91&lon=0", "?lat=0&lon=181", "?lat=1"]) {
    for (const route of ["/api/aqi", "/api/traffic"]) {
      const r = await fetch(base + route + q);
      assert.equal(r.status, 400, route + q);
      assert.deepEqual(await r.json(), { error: "invalid lat/lon" });
    }
  }
});

test("adds the key itself and url-encodes it", async () => {
  seen.length = 0;
  const r = await fetch(base + "/api/aqi?lat=28.6139&lon=77.209&key=attacker");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(body.echoed, /nearest_city\?lat=28\.6139&lon=77\.209&key=good-iq%20key$/);
  assert.equal(seen.some((u) => u.includes("attacker")), false, "a key sent by the browser must be ignored");
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("traffic route builds the TomTom flow-segment request", async () => {
  seen.length = 0;
  const r = await fetch(base + "/api/traffic?lat=28.6&lon=77.2");
  assert.equal(r.status, 200);
  assert.match(seen[0], /^\/traffic\/services\/4\/flowSegmentData\/absolute\/10\/json\?point=28\.6,77\.2&key=good-tt$/);
});

test("forwards provider errors without leaking the key", async () => {
  const { child, base: b } = await startServer({ IQAIR_API_KEY: "bad", IQAIR_BASE: `http://127.0.0.1:${providerPort}` });
  try {
    const r = await fetch(b + "/api/aqi?lat=1&lon=1");
    assert.equal(r.status, 403);
    const text = await r.text();
    assert.match(text, /incorrect_api_key/);
    assert.equal(text.includes("key=bad"), false);
  } finally { child.kill(); }
});

test("says which key is missing instead of calling the provider", async () => {
  const { child, base: b } = await startServer({});
  try {
    const r = await fetch(b + "/api/aqi?lat=1&lon=1");
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "IQAIR_API_KEY is missing on the server" });
  } finally { child.kill(); }
});

test("answers 502 when the provider is unreachable", async () => {
  const { child, base: b } = await startServer({ IQAIR_API_KEY: "k", IQAIR_BASE: "http://127.0.0.1:1" });
  try {
    const r = await fetch(b + "/api/aqi?lat=1&lon=1");
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { error: "could not reach the data provider" });
  } finally { child.kill(); }
});

// ---- deployment features: health check, cache, limits, CSP ----
const fs = require("node:fs");
const crypto = require("node:crypto");
const hitsFor = (p) => seen.filter((u) => u.includes(p)).length;

test("/healthz answers ok for platform health checks", async () => {
  const r = await fetch(base + "/healthz");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "ok");
});

test("a good reading is cached, so repeat requests do not use the provider's quota", async () => {
  seen.length = 0;
  const first = await fetch(base + "/api/aqi?lat=28.5001&lon=77.1001");
  const second = await fetch(base + "/api/aqi?lat=28.5001&lon=77.1001");
  assert.equal(first.headers.get("x-cache"), "MISS");
  assert.equal(second.headers.get("x-cache"), "HIT");
  assert.equal(hitsFor("lat=28.5001"), 1);
  assert.deepEqual(await second.json(), await first.json());
});

test("errors are never cached", async () => {
  const { child, base: b } = await startServer({ IQAIR_API_KEY: "bad", IQAIR_BASE: `http://127.0.0.1:${providerPort}` });
  try {
    seen.length = 0;
    for (let i = 0; i < 2; i++) assert.equal((await fetch(b + "/api/aqi?lat=1&lon=1")).status, 403);
    assert.equal(hitsFor("key=bad"), 2);
  } finally { child.kill(); }
});

test("a client that sends too many API requests gets 429 with Retry-After", async () => {
  const { child, base: b } = await startServer({ IQAIR_API_KEY: "k", IQAIR_BASE: `http://127.0.0.1:${providerPort}`, RATE_LIMIT: "3" });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${b}/api/aqi?lat=${i}&lon=1`)).status, 200);
    const r = await fetch(b + "/api/aqi?lat=9&lon=1");
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get("retry-after")) > 0);
    assert.equal((await fetch(b + "/")).status, 200, "the page itself is not rate limited");
  } finally { child.kill(); }
});

test("X-Forwarded-For is ignored unless TRUST_PROXY=1, then it separates clients", async () => {
  const hit = (b, ip) => fetch(`${b}/api/aqi?lat=1&lon=1`, { headers: { "X-Forwarded-For": ip } }).then((r) => r.status);
  const env = { IQAIR_API_KEY: "k", IQAIR_BASE: `http://127.0.0.1:${providerPort}`, RATE_LIMIT: "1" };
  const plain = await startServer(env);
  try {
    assert.equal(await hit(plain.base, "1.1.1.1"), 200);
    assert.equal(await hit(plain.base, "2.2.2.2"), 429, "a spoofed header must not dodge the limit");
  } finally { plain.child.kill(); }
  const behind = await startServer({ ...env, TRUST_PROXY: "1" });
  try {
    assert.equal(await hit(behind.base, "1.1.1.1"), 200);
    assert.equal(await hit(behind.base, "2.2.2.2"), 200, "a different client gets its own allowance");
    assert.equal(await hit(behind.base, "1.1.1.1"), 429);
  } finally { behind.child.kill(); }
});

test("the daily cap stops calls to a provider but still serves cached readings", async () => {
  const { child, base: b } = await startServer({ IQAIR_API_KEY: "k", IQAIR_BASE: `http://127.0.0.1:${providerPort}`, DAILY_UPSTREAM_CAP: "1" });
  try {
    assert.equal((await fetch(b + "/api/aqi?lat=5&lon=5")).status, 200);
    assert.equal((await fetch(b + "/api/aqi?lat=5&lon=5")).status, 200, "cached, so it costs nothing");
    const over = await fetch(b + "/api/aqi?lat=6&lon=6");
    assert.equal(over.status, 429);
    assert.match((await over.json()).error, /daily limit/);
  } finally { child.kill(); }
});

test("the page carries a content security policy that allows exactly its inline script", async () => {
  const r = await fetch(base + "/");
  const csp = r.headers.get("content-security-policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /object-src 'none'/);
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => crypto.createHash("sha256").update(m[1].replace(/\r\n?/g, "\n")).digest("base64"));
  assert.ok(inline.length >= 1);
  for (const h of inline) assert.ok(csp.includes(`'sha256-${h}'`), "the inline script's hash is listed");
  assert.equal(/unsafe-inline/.test(csp.match(/script-src[^;]*/)[0]), false, "scripts never get unsafe-inline");
});

test("production mode adds HSTS", async () => {
  const { child, base: b } = await startServer({ NODE_ENV: "production" });
  try {
    assert.match((await fetch(b + "/")).headers.get("strict-transport-security"), /max-age=/);
  } finally { child.kill(); }
});
