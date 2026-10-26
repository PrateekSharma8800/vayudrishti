// The XKDR routes (historical PM2.5 / PM10) through the Vercel functions in api/.
// A fake XKDR stands in for airquality.xkdr.org, so nothing touches the network.
const http = require("node:http");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const KEY = "xk-secret-key";
const seen = []; // { url, auth } of every request the fake XKDR received
const STATIONS = [
  { station_id: "site_1", station_name: "Anand Vihar, Delhi - DPCC", source: "cpcb_caaqm", latitude: 28.647, longitude: 77.316, parameters: ["PM2.5", "PM10"], first_seen: "2024-01-01T00:00:00", last_seen: "2024-03-31T23:00:00" },
  { station_id: "us_1", station_name: "US Embassy", source: "us_embassy", latitude: 28.598, longitude: 77.189, parameters: ["PM2.5"], first_seen: "2024-01-01T00:00:00", last_seen: "2024-03-31T23:00:00" },
  { station_id: "site_9", station_name: "Ozone only", source: "cpcb_caaqm", latitude: 28.6, longitude: 77.2, parameters: ["O3"], first_seen: "2024-01-01T00:00:00", last_seen: "2024-03-31T23:00:00" },
];

let xkdr;
before(async () => {
  xkdr = http.createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization });
    const u = new URL(req.url, "http://x");
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== "Bearer " + KEY) return send(401, { error: "unauthorized" });
    if (u.pathname === "/v1/stations") return send(200, { data: STATIONS });
    if (u.pathname === "/v1/meta") return send(200, { exported_at: "2024-04-02T00:00:00Z", measurements: { first_month: "2024-01", last_month: "2024-03" }, your_tier: "free" });
    if (u.pathname === "/v1/measurements" && u.searchParams.get("agg") === "raw") {
      return send(200, { data: [
        { station_id: "site_1", parameter_name: "PM2.5", value: 180, unit: "µg/m³", collected_at: "2024-03-31T22:00:00" },
        { station_id: "site_1", parameter_name: "PM2.5", value: 190, unit: "µg/m³", collected_at: "2024-03-31T23:00:00" },
      ] });
    }
    if (u.pathname === "/v1/measurements") {
      if (u.searchParams.get("start") === "2024-02-01") return send(400, { error: "bad", detail: `bad key ${KEY}` });
      return send(200, { data: [
        { station_id: "site_1", parameter_name: "PM2.5", period_start: "2024-03-01T00:00:00", mean: 100, n: 24, unit: "µg/m³" },
        { station_id: "us_1", parameter_name: "PM2.5", period_start: "2024-03-01T00:00:00", mean: 200, n: 20, unit: "µg/m³" },
        { station_id: "site_1", parameter_name: "PM10", period_start: "2024-03-03T00:00:00", mean: 300, n: 10, unit: "µg/m³" },
      ], meta: { truncated: false } });
    }
    send(404, { error: "not_found" });
  });
  await new Promise((r) => xkdr.listen(0, "127.0.0.1", r));
  // must be set before lib/vercel.js is loaded, because it reads the environment once
  Object.assign(process.env, { XKDR_API_KEY: KEY, XKDR_BASE: `http://127.0.0.1:${xkdr.address().port}`, RATE_LIMIT: "50" });
});
after(() => xkdr.close());

function call(handler, { method = "GET", url, ip = "9.9.9.9" }) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(body) { resolve({ status: this.statusCode, headers: this.headers, body, json: JSON.parse(body) }); } };
    Promise.resolve(handler({ method, url, headers: { "x-forwarded-for": ip }, socket: {} }, res)).catch(reject);
  });
}

test("api/stations lists Delhi PM stations with their coverage, and sends the key only to XKDR", async () => {
  const r = await call(require("../api/stations"), { url: "/api/stations" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.stations.map((s) => s.id), ["site_1", "us_1"], "the ozone-only station is left out");
  assert.deepEqual(r.json.coverage, { from: "2024-01-01", to: "2024-03-31" });
  assert.equal(r.json.stations[1].source, "US Embassy (AirNow)");
  assert.equal(r.headers["cache-control"], "public, max-age=0, s-maxage=21600, stale-while-revalidate=60");
  assert.ok(seen.every((s) => s.auth === "Bearer " + KEY));
  assert.equal(r.body.includes(KEY), false);
});

test("api/history averages stations per day and leaves missing days as gaps, never zero", async () => {
  const r = await call(require("../api/history"), { url: "/api/history?start=2024-03-01&end=2024-03-03&agg=daily&station=all" });
  assert.equal(r.status, 200);
  assert.equal(r.json.kind, "historical");
  assert.deepEqual(r.json.series["PM2.5"].values, [150, null, null]);
  assert.deepEqual(r.json.series.PM10.values, [null, null, 300]);
  assert.equal(r.json.series["PM2.5"].missing, 2);
  assert.equal(r.json.periods[0], "2024-03-01T00:00:00+05:30");
  assert.equal(r.headers["cache-control"], "public, max-age=0, s-maxage=600, stale-while-revalidate=60");
});

test("api/history checks its input before asking XKDR", async () => {
  const handler = require("../api/history");
  const before = seen.length;
  const cases = [
    ["start=2024-02-30&end=2024-03-01", "invalid_date"],
    ["start=2024-03-05&end=2024-03-01", "invalid_range"],
    ["start=2024-01-01&end=2024-03-01&agg=hourly", "range_too_long"],
    ["start=2024-03-01&end=2024-03-02&agg=__proto__", "invalid_agg"],
    ["start=2024-03-01&end=2024-03-02&station=../etc", "invalid_station"],
    ["start=2099-01-01&end=2099-01-02", "future_date"],
  ];
  for (const [q, code] of cases) {
    const r = await call(handler, { url: "/api/history?" + q, ip: "6.6.6.6" });
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error.code, code, q);
    assert.equal(r.headers["cache-control"], "no-store");
  }
  assert.equal(seen.length, before, "no invalid request reached XKDR");
});

test("a period outside XKDR's coverage is refused with the dates it does cover", async () => {
  const r = await call(require("../api/history"), { url: "/api/history?start=2023-01-01&end=2023-01-31" });
  assert.equal(r.status, 422);
  assert.deepEqual(r.json.error.coverage, { from: "2024-01-01", to: "2024-03-31" });
});

test("an XKDR error is explained without ever echoing the key", async () => {
  const r = await call(require("../api/history"), { url: "/api/history?start=2024-02-01&end=2024-02-02" });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "bad_request");
  assert.equal(r.body.includes(KEY), false);
  assert.match(r.body, /\[hidden\]/);
});

test("api/latest and api/latest-all give the newest archived reading and never call it recent", async () => {
  const one = await call(require("../api/latest"), { url: "/api/latest?station=site_1" });
  assert.equal(one.status, 200);
  const pm25 = one.json.readings.find((x) => x.parameter === "PM2.5");
  assert.deepEqual([pm25.value, pm25.observed_at, pm25.recent], [190, "2024-03-31T23:00:00+05:30", false]);
  assert.equal(one.json.readings.find((x) => x.parameter === "PM10").value, null, "no reading stays null");
  const all = await call(require("../api/latest-all"), { url: "/api/latest-all" });
  assert.equal(all.status, 200);
  assert.equal(all.json.stations.length, 2);
  assert.equal((await call(require("../api/latest"), { url: "/api/latest?station=nope" })).json.error.code, "unknown_station");
});

test("only GET and HEAD are accepted", async () => {
  const r = await call(require("../api/history"), { method: "POST", url: "/api/history" });
  assert.equal(r.status, 405);
});

test("without XKDR_API_KEY the routes say so instead of inventing data", async () => {
  const { createXkdr } = require("../lib/xkdr");
  const r = await createXkdr({}).handle("/api/stations", new URLSearchParams(), "1.1.1.1");
  assert.equal(r.status, 503);
  assert.match(JSON.parse(r.body).error.message, /XKDR_API_KEY is missing/);
});

test("the page does not ask for station data until someone reaches the section", async () => {
  const { loadApp } = require("./helpers/dom");
  const urls = [];
  loadApp({ fetch: async (u) => { urls.push(u); throw new Error("offline"); } });
  assert.equal(urls.length, 0);
});

test("the page labels the station list as historical and explains a missing map library", async () => {
  const { loadApp, json } = require("./helpers/dom");
  const stations = { coverage: { from: "2024-01-01", to: "2024-03-31" }, dataset_exported_at: "2024-04-02T05:30:00+05:30", stations: [{ id: "site_1", name: "Anand Vihar", source: "CPCB CAAQM", from: null, to: "2024-03-31T23:00:00+05:30", latitude: 28.6, longitude: 77.3 }] };
  const app = loadApp({ fetch: async () => json(stations) });
  await app.run("loadStations()");
  assert.match(app.els.hStatus.textContent, /^Historical data only/);
  assert.equal(app.els.hTo.value, "2024-03-31");
  assert.equal(app.els.hFrom.value, "2024-03-02");
  assert.match(app.els.mStatus.textContent, /map library could not load/);
});
