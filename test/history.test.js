// Saved live readings and the trend chart drawn from them.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, json, AQI, TRAFFIC } = require("./helpers/dom");

const CP = "28.6315,77.2167"; // Connaught Place in the dropdown
const KEY = "28.6315,77.2167";
const place = (app, v) => { app.ctx.document.getElementById("place").value = v; };
const logOf = (app) => JSON.parse(app.store.aps_live_log || "[]");
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const row = (minutes, aqi, cong, key = KEY) => ({ t: ago(minutes), key, name: "Connaught Place", aqi, speed: 20, cong });
const ok = async (u) => json(u.startsWith("/api/aqi") ? AQI : TRAFFIC);

test("a fetch saves the reading, and fetching again straight away does not repeat it", async () => {
  const app = loadApp({ fetch: ok });
  place(app, CP);
  await app.els.liveForm.trigger("submit");
  await app.els.liveForm.trigger("submit");
  const log = logOf(app);
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].key, log[0].name, log[0].aqi, log[0].speed, log[0].cong], [KEY, "Connaught Place", 112, 26, 13]);
});

test("a second reading later makes a trend chart with AQI and congestion", async () => {
  const app = loadApp({ chart: true, fetch: ok, store: { aps_live_log: JSON.stringify([row(60, 150, 30), row(30, 140, 20)]) } });
  place(app, CP);
  await app.els.liveForm.trigger("submit");
  assert.equal(logOf(app).length, 3);
  const chart = app.charts.filter((c) => c.data.datasets.some((d) => d.label === "US AQI")).at(-1);
  assert.equal(chart.data.labels.length, 3);
  const plain = (x) => JSON.parse(JSON.stringify(x)); // arrays made inside the app's context are a different realm
  assert.deepEqual(plain(chart.data.datasets[0].data), [150, 140, 112]);
  assert.deepEqual(plain(chart.data.datasets[1].data), [30, 20, 13]);
  assert.equal(app.els.liveHistory.hidden, false);
  assert.equal(app.els.liveChartBox.hidden, false);
  assert.match(app.els.liveHistNote.textContent, /3 readings/);
});

test("with one reading the page says so instead of drawing a flat chart", async () => {
  const app = loadApp({ chart: true, store: { aps_live_log: JSON.stringify([row(5, 120, 10)]), aps_live: JSON.stringify({ place: CP }) } });
  assert.equal(app.els.liveHistory.hidden, false);
  assert.equal(app.els.liveChartBox.hidden, true);
  assert.match(app.els.liveHistNote.textContent, /One reading so far/);
});

test("history is per place and only shows for the chosen place", async () => {
  const other = row(10, 90, 5, "28.4950,77.0889");
  const app = loadApp({ store: { aps_live_log: JSON.stringify([other]) } });
  place(app, CP);
  await app.els.place.trigger("change");
  assert.equal(app.els.liveHistory.hidden, true, "Connaught Place has no readings");
  place(app, "28.4950,77.0889");
  await app.els.place.trigger("change");
  assert.equal(app.els.liveHistory.hidden, false);
});

test("only the newest 200 readings are kept", async () => {
  const many = Array.from({ length: 200 }, (_, i) => row(1000 - i, 100, 10, `k${i}`));
  const app = loadApp({ fetch: ok, store: { aps_live_log: JSON.stringify(many) } });
  place(app, CP);
  await app.els.liveForm.trigger("submit");
  const log = logOf(app);
  assert.equal(log.length, 200);
  assert.equal(log.at(-1).key, KEY);
  assert.equal(log[0].key, "k1", "the oldest one was dropped");
});

test("a failed fetch saves nothing", async () => {
  const app = loadApp();
  place(app, CP);
  await app.els.liveForm.trigger("submit");
  assert.equal(logOf(app).length, 0);
});

test("clearing saved readings asks first", async () => {
  const stored = { aps_live_log: JSON.stringify([row(5, 100, 10)]), aps_live: JSON.stringify({ place: CP }) };
  const no = loadApp({ confirm: false, store: { ...stored } });
  await no.els.clearLive.click();
  assert.equal(logOf(no).length, 1);
  const yes = loadApp({ store: { ...stored } });
  await yes.els.clearLive.click();
  assert.equal(logOf(yes).length, 0);
  assert.equal(yes.els.liveHistory.hidden, true);
});

test("a corrupt log in storage is ignored", () => {
  for (const bad of ["not json", '{"a":1}', "[1,2,3]", '[{"t":5}]']) {
    const app = loadApp({ store: { aps_live_log: bad } });
    assert.equal(app.els.liveHistory.hidden, true, bad);
  }
});
