// Behaviour tests for app.js, run in a fake browser (see helpers/dom.js).
process.env.TZ = "Asia/Kolkata"; // the date bug only showed up east of UTC
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, json, AQI, TRAFFIC } = require("./helpers/dom");

const fill = (app, rec) => Object.entries(rec).forEach(([k, v]) => { app.ctx.document.getElementById(k).value = String(v); });
const saved = (app, key) => JSON.parse(app.store[key] || "null");

test("starts cleanly when storage holds corrupt or old-format data", () => {
  const app = loadApp({ store: { aps_observations: '{"x":1}', aps_survey: '{"n":"bad"}' } });
  assert.match(app.els.cards.innerHTML, /Observations/);
  assert.match(app.els.surveyText.textContent, /No responses yet/);
});

test("tells the user when Chart.js could not load", () => {
  const app = loadApp();
  assert.match(app.els.toast.textContent, /Charts could not load/);
  assert.equal(app.els.toast.className.includes("error"), true);
});

test("sample data loads, shows in the hotspot table and can be removed", async () => {
  const app = loadApp();
  await app.els.loadSample.click();
  assert.equal(saved(app, "aps_observations").length, 30);
  assert.match(app.els.hotBody.innerHTML, /Highway Bus Stand/);
  assert.equal(app.els.sampleBanner.hidden, false);
  await app.els.removeSample.click();
  assert.equal(saved(app, "aps_observations").length, 0);
  assert.equal(app.els.sampleBanner.hidden, true);
});

test("loading sample data never overwrites real survey totals", async () => {
  const real = { n: 3, counts: { Cough: 2 }, near: 1, sample: false };
  const app = loadApp({ store: { aps_survey: JSON.stringify(real) } });
  await app.els.loadSample.click();
  assert.equal(saved(app, "aps_survey").n, 3);
});

test("removing sample data keeps the user's own observations", async () => {
  const app = loadApp();
  fill(app, { loc: "My Street", date: "2026-01-02", traffic: 500, heavy: 5, dust: 80 });
  await app.els.obsForm.trigger("submit");
  await app.els.loadSample.click();
  await app.els.removeSample.click();
  const left = saved(app, "aps_observations");
  assert.equal(left.length, 1);
  assert.equal(left[0].location, "My Street");
});

test("saving an observation stores it; invalid values are rejected", async () => {
  const app = loadApp();
  fill(app, { loc: "Main Market", date: "2026-03-04", slot: "Evening", traffic: 1200, heavy: 12, dust: 150.5, notes: "dry day" });
  await app.els.obsForm.trigger("submit");
  const [o] = saved(app, "aps_observations");
  assert.deepEqual([o.location, o.date, o.slot, o.traffic, o.heavy, o.dust, o.sample], ["Main Market", "2026-03-04", "Evening", 1200, 12, 150.5, false]);
  assert.match(app.els.obsBody.innerHTML, /Main Market/);

  fill(app, { loc: "Bad", date: "2026-03-04", traffic: -5, heavy: 0, dust: 1 });
  await app.els.obsForm.trigger("submit");
  assert.equal(saved(app, "aps_observations").length, 1, "negative traffic must not be saved");
  assert.match(app.els.toast.textContent, /valid values/);
});

test("user text is escaped in every table", async () => {
  const app = loadApp();
  fill(app, { loc: '<img src=x onerror="alert(1)">', date: "2026-03-04", traffic: 1, heavy: 1, dust: 1 });
  await app.els.obsForm.trigger("submit");
  assert.equal(app.els.obsBody.innerHTML.includes("<img"), false);
  assert.equal(app.els.hotBody.innerHTML.includes("<img"), false);
  assert.equal(app.els.cards.innerHTML.includes("<img"), false);
});

test("hotspot scores use fixed references, so a lone clean place is Low", () => {
  const app = loadApp();
  const lone = app.run('locationStats([{ location: "Clean", traffic: 10, heavy: 1, dust: 5 }])');
  assert.equal(lone[0].level, "Low");
  assert.ok(lone[0].score < 5);
  const worst = app.run('locationStats([{ location: "Busy", traffic: 5000, heavy: 80, dust: 900 }])');
  assert.equal(worst[0].score, 100);
  assert.equal(worst[0].level, "High");
  const mid = app.run('locationStats([{ location: "Mid", traffic: 1000, heavy: 15, dust: 150 }])');
  assert.equal(mid[0].score, 50);
  assert.equal(mid[0].level, "Moderate");
});

test("dates use the local day, not the UTC day", () => {
  const app = loadApp();
  assert.equal(app.run("ymd(new Date(2025, 0, 6))"), "2025-01-06");
  const dates = app.run("sampleObservations().map((o) => o.date).sort()");
  assert.equal(dates[0], "2025-01-06");
  assert.equal(app.els.date.value, app.run("ymd(new Date())"));
});

test("the theme button flips the theme and remembers it", async () => {
  const app = loadApp({ theme: "light" });
  await app.els.themeBtn.click();
  assert.equal(app.ctx.document.documentElement.dataset.theme, "dark");
  assert.equal(app.store.aps_theme, "dark");
  assert.equal(app.els.themeBtn.getAttribute("aria-label"), "Switch to light mode");
});

test("charts are drawn with the page's colours and replaced on re-render", async () => {
  const app = loadApp({ chart: true });
  await app.els.loadSample.click();
  const ids = new Set(app.charts.map((c) => c.type));
  assert.deepEqual([...ids].sort(), ["bar", "line", "scatter"]);
  assert.ok(app.charts.length >= 5);
});

test("live panel shows AQI as a ring, traffic as cards, and tints the atmosphere", async () => {
  const urls = [];
  const app = loadApp({ fetch: async (u) => { urls.push(u); return json(u.startsWith("/api/aqi") ? AQI : TRAFFIC); } });
  fill(app, { place: "custom", lat: "28.6", lon: "77.2" });
  await app.els.liveForm.trigger("submit");
  assert.ok(urls.includes("/api/aqi?lat=28.6&lon=77.2") && urls.includes("/api/traffic?lat=28.6&lon=77.2"));
  assert.equal(urls.some((u) => /key=/.test(u)), false, "keys never appear in browser URLs");
  assert.match(app.els.liveTop.innerHTML, /data-tone="3"/);
  assert.match(app.els.liveTop.innerHTML, />112</);
  assert.match(app.els.liveCards.innerHTML, /26 km\/h \(free flow 30\)/);
  assert.match(app.els.liveCards.innerHTML, /closure reported/);
  assert.equal(app.els.liveCards.innerHTML.includes("AQI (US)"), false, "the AQI lives in the ring, not a duplicate card");
  assert.equal(app.ctx.document.documentElement.dataset.aqi, "3");
  assert.match(app.els.nowText.textContent, /AQI 112/);
  assert.equal(saved(app, "aps_live").lat, "28.6");
});

test("one live source failing does not hide the other", async () => {
  const app = loadApp({ fetch: async (u) => (u.startsWith("/api/aqi") ? json({ error: "IQAIR_API_KEY is missing on the server" }, 500) : json(TRAFFIC)) });
  fill(app, { place: "custom", lat: "1", lon: "1" });
  await app.els.liveForm.trigger("submit");
  assert.match(app.els.liveNote.textContent, /IQAir failed: IQAIR_API_KEY is missing on the server/);
  assert.match(app.els.liveCards.innerHTML, /km\/h/);
});

test("opening the page without the server explains how to start it", async () => {
  const app = loadApp();
  fill(app, { place: "custom", lat: "1", lon: "1" });
  await app.els.liveForm.trigger("submit");
  assert.match(app.els.liveNote.textContent, /node server\.js/);
  assert.equal(app.els.liveBtn.disabled, false, "the button must come back");
});

test("the floating bar asks for coordinates before fetching", async () => {
  const app = loadApp();
  await app.els.nowBtn.click();
  assert.match(app.els.toast.textContent, /Choose a place/);
  assert.equal(app.ctx.location.hash, "#live");
});

test("auto-refresh is opt-in, runs every 15 minutes, and skips hidden tabs", async () => {
  let calls = 0;
  const app = loadApp({ fetch: async (u) => { calls++; return json(u.startsWith("/api/aqi") ? AQI : TRAFFIC); } });
  fill(app, { place: "custom", lat: "28.6", lon: "77.2" });
  assert.equal(app.intervals.length, 0, "nothing is scheduled by default");

  app.els.autoLive.checked = true;
  await app.els.autoLive.trigger("change");
  assert.equal(calls, 2, "it fetches once right away (AQI and traffic)");
  assert.equal(app.intervals.length, 1);
  assert.equal(app.intervals[0].ms, 15 * 60 * 1000);

  await app.intervals[0].fn();
  assert.equal(calls, 4);
  app.ctx.document.hidden = true;
  await app.intervals[0].fn();
  assert.equal(calls, 4, "a hidden tab does not spend quota");

  app.els.autoLive.checked = false;
  await app.els.autoLive.trigger("change");
  assert.equal(app.intervals[0].active, false);
});

test("auto-refresh refuses to start without coordinates", async () => {
  const app = loadApp();
  app.els.autoLive.checked = true;
  await app.els.autoLive.trigger("change");
  assert.equal(app.els.autoLive.checked, false);
  assert.equal(app.intervals.filter((i) => i.active).length, 0);
  assert.match(app.els.toast.textContent, /Choose a place first/);
});

test("the place dropdown lists Delhi NCR areas by city, plus a custom option", () => {
  const app = loadApp();
  const html = app.els.place.innerHTML;
  for (const city of ["Delhi", "Noida and Greater Noida", "Gurugram", "Ghaziabad", "Faridabad"]) assert.match(html, new RegExp(`<optgroup label="${city}">`));
  for (const area of ["Connaught Place", "Cyber Hub", "Indirapuram", "Anand Vihar", "NIT Faridabad"]) assert.match(html, new RegExp(`>${area}<`));
  assert.match(html, /value="custom"/);
  // every listed place is inside the NCR bounding box, which catches typos in a coordinate
  const coords = [...html.matchAll(/value="([\d.]+),([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(coords.length >= 40);
  for (const [lat, lon] of coords) assert.ok(lat > 28.2 && lat < 29 && lon > 76.8 && lon < 77.6, `${lat},${lon}`);
});

test("picking a place fetches that place without typing coordinates", async () => {
  const urls = [];
  const app = loadApp({ fetch: async (u) => { urls.push(u); return json(u.startsWith("/api/aqi") ? AQI : TRAFFIC); } });
  fill(app, { place: "28.6315,77.2167" });
  await app.els.liveForm.trigger("submit");
  assert.ok(urls.includes("/api/aqi?lat=28.6315&lon=77.2167") && urls.includes("/api/traffic?lat=28.6315&lon=77.2167"));
  assert.match(app.els.nowText.textContent, /^Connaught Place · AQI 112/);
  assert.match(app.els.liveTop.innerHTML, /Air near Connaught Place/);
  assert.equal(app.els.coordRow.hidden, true, "coordinates stay hidden for a listed place");
});

test("choosing 'somewhere else' reveals the coordinate fields and validates them", async () => {
  const app = loadApp();
  fill(app, { place: "custom" });
  await app.els.place.trigger("change");
  assert.equal(app.els.coordRow.hidden, false);
  fill(app, { lat: "95", lon: "77" });
  await app.els.liveForm.trigger("submit");
  assert.match(app.els.toast.textContent, /latitude \(-90 to 90\)/);
  assert.equal(app.els.toast.className.includes("error"), true);
});

test("no place chosen means no request and a clear message", async () => {
  let calls = 0;
  const app = loadApp({ fetch: async () => { calls++; return json(AQI); } });
  await app.els.liveForm.trigger("submit");
  assert.equal(calls, 0);
  assert.match(app.els.toast.textContent, /Choose a place first/);
});

test("the last chosen place is remembered, and old lat/lon settings still work", () => {
  const remembered = loadApp({ store: { aps_live: JSON.stringify({ place: "28.4950,77.0889", lat: "", lon: "" }) } });
  assert.equal(remembered.els.place.value, "28.4950,77.0889");
  const old = loadApp({ store: { aps_live: JSON.stringify({ lat: "28.6", lon: "77.2" }) } });
  assert.equal(old.els.place.value, "custom");
  assert.equal(old.els.coordRow.hidden, false);
  assert.equal(old.els.lat.value, "28.6");
});

test("the observations intro can load the sample data", async () => {
  const app = loadApp();
  await app.els.guideSample.click();
  assert.equal(saved(app, "aps_observations").length, 30);
});

// ---- field counter and dust calculator ----
// time is controlled by hand: the app reads Date.now(), and setInterval is recorded, not run
const clockAt = (app, ms) => app.run(`Date.now = () => ${ms}`);
const tick = (app) => app.intervals.filter((i) => i.active).at(-1).fn();

test("the field counter turns taps into vehicles per hour and the heavy share", async () => {
  const app = loadApp();
  clockAt(app, 1_000_000);
  fill(app, { cDur: "5" });
  for (let i = 0; i < 9; i++) await app.els.tapLight.click();
  await app.els.tapHeavy.click();
  assert.equal(app.els.nLight.textContent, "9");
  assert.equal(app.els.nHeavy.textContent, "1");
  clockAt(app, 1_000_000 + 5 * 60_000); // five minutes later
  await tick(app);
  assert.equal(app.els.cResult.hidden, false);
  assert.match(app.els.cResultText.textContent, /10 vehicles in 5:00 means about 120 vehicles per hour, and 10% were trucks or buses/);
  assert.equal(app.els.cTime.textContent, "0:00");
  assert.equal(app.els.tapLight.disabled, true, "no more taps once it is done");
});

test("using the counter fills the form", async () => {
  const app = loadApp();
  clockAt(app, 0);
  fill(app, { cDur: "5" });
  for (let i = 0; i < 3; i++) await app.els.tapLight.click();
  await app.els.tapHeavy.click();
  clockAt(app, 5 * 60_000);
  await tick(app);
  await app.els.cUse.click();
  assert.equal(app.els.traffic.value, "48");
  assert.equal(app.els.heavy.value, "25");
  assert.match(app.els.toast.textContent, /Filled in vehicles per hour/);
});

test("the counter can pause, resume, undo and finish early", async () => {
  const app = loadApp();
  fill(app, { cDur: "10" }); // the page starts with 10 minutes selected
  clockAt(app, 0);
  await app.els.tapLight.click();                      // starts the timer
  await app.els.tapHeavy.click();
  await app.els.cUndo.click();                          // takes the heavy tap back
  assert.equal(app.els.nHeavy.textContent, "0");
  clockAt(app, 60_000);
  await app.els.cPause.click();
  assert.equal(app.els.cPause.textContent, "Resume");
  clockAt(app, 10 * 60_000);                            // time passes while paused
  assert.equal(app.els.cTime.textContent, "9:00", "paused time is not counted");
  await app.els.cPause.click();
  clockAt(app, 10 * 60_000 + 60_000);
  await app.els.cFinish.click();
  assert.match(app.els.cResultText.textContent, /1 vehicles in 2:00 means about 30 vehicles per hour, and 0% were trucks/);
});

test("a count that is too short is not scaled up to an hour", async () => {
  const app = loadApp();
  clockAt(app, 0);
  await app.els.tapLight.click();
  clockAt(app, 10_000);
  await app.els.cFinish.click();
  assert.match(app.els.cResultText.textContent, /too short/);
  assert.equal(app.els.cUse.hidden, true);
});

test("resetting a count asks first, then starts clean", async () => {
  const app = loadApp({ confirm: false });
  await app.els.tapLight.click();
  await app.els.cReset.click();
  assert.equal(app.els.nLight.textContent, "1", "declining the prompt keeps the count");
  const sure = loadApp();
  await sure.els.tapLight.click();
  await sure.els.cReset.click();
  assert.equal(sure.els.nLight.textContent, "0");
  assert.equal(sure.els.cResult.hidden, true);
  assert.equal(sure.els.cDur.disabled, false);
});

test("the dust calculator works out mg per square metre per day", async () => {
  const app = loadApp();
  assert.equal(typeof app.els.dcUse.disabled, "boolean");
  fill(app, { dcMg: "2.5", dcArea: "200", dcDays: "1" });
  await app.els.dcMg.trigger("input");
  assert.match(app.els.dcOut.textContent, /is 125 mg\/m²\/day/);
  assert.equal(app.els.dcUse.disabled, false);
  await app.els.dcUse.click();
  assert.equal(app.els.dust.value, "125");
  fill(app, { dcDays: "2" });
  await app.els.dcDays.trigger("input");
  assert.match(app.els.dcOut.textContent, /is 62.5 mg\/m²\/day/);
  fill(app, { dcArea: "0" });
  await app.els.dcArea.trigger("input");
  assert.equal(app.els.dcUse.disabled, true, "a zero area cannot be used");
});
