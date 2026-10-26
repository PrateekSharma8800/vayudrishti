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
    assert.deepEqual(await r.json(), { error: "IQAIR_API_KEY is missing in .env" });
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
