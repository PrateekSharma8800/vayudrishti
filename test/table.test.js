// Sorting and searching the saved observations.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/dom");

const obs = (id, location, date, slot, traffic, heavy, dust, notes = "") => ({ id, sample: false, location, date, slot, traffic, heavy, dust, notes });
const STORE = () => ({ aps_observations: JSON.stringify([
  obs("a", "Bus Stand", "2026-03-01", "Evening", 900, 30, 300, "windy"),
  obs("b", "Park Gate", "2026-03-03", "Morning", 200, 2, 60),
  obs("c", "Market", "2026-03-02", "Afternoon", 1500, 12, 210, "near the construction site"),
]) });
const order = (app) => [...app.els.obsBody.innerHTML.matchAll(/<td>\d{4}-\d{2}-\d{2}<\/td><td>([^<]+?)(?: <span|<\/td>)/g)].map((m) => m[1]);

test("newest first by default, and each column title sorts and then reverses", () => {
  const app = loadApp({ store: STORE() });
  assert.deepEqual(order(app), ["Park Gate", "Market", "Bus Stand"]);
  app.run('setSort("traffic")');
  assert.deepEqual(order(app), ["Market", "Bus Stand", "Park Gate"], "numbers start with the biggest");
  app.run('setSort("traffic")');
  assert.deepEqual(order(app), ["Park Gate", "Bus Stand", "Market"]);
  app.run('setSort("location")');
  assert.deepEqual(order(app), ["Bus Stand", "Market", "Park Gate"], "text starts A to Z");
  app.run('setSort("location")');
  assert.deepEqual(order(app), ["Park Gate", "Market", "Bus Stand"]);
});

test("time slots sort by time of day, not alphabetically", () => {
  const app = loadApp({ store: STORE() });
  app.run('setSort("slot")');
  assert.deepEqual(order(app), ["Park Gate", "Market", "Bus Stand"]); // Morning, Afternoon, Evening
});

test("clicking a column title in the table header sorts it", async () => {
  const app = loadApp({ store: STORE() });
  const target = { closest: () => ({ dataset: { sort: "dust" } }) };
  await app.els.obsHead.trigger("click", { target });
  assert.deepEqual(order(app), ["Bus Stand", "Market", "Park Gate"]);
  await app.els.obsHead.trigger("click", { target: { closest: () => null } }); // a click between titles does nothing
  assert.deepEqual(order(app), ["Bus Stand", "Market", "Park Gate"]);
});

test("search matches place, date, slot and notes, ignoring case", async () => {
  const app = loadApp({ store: STORE() });
  const find = async (q) => { app.els.obsSearch.value = q; await app.els.obsSearch.trigger("input"); return order(app); };
  assert.deepEqual(await find("market"), ["Market"]);
  assert.deepEqual(await find("WINDY"), ["Bus Stand"]);
  assert.deepEqual(await find("construction"), ["Market"]);
  assert.deepEqual(await find("2026-03-03"), ["Park Gate"]);
  assert.deepEqual(await find("evening"), ["Bus Stand"]);
  assert.deepEqual(await find(""), ["Park Gate", "Market", "Bus Stand"]);
  await find("zzz");
  assert.match(app.els.obsBody.innerHTML, /No saved observation matches your search/);
});

test("search and sorting work together with the page filters", async () => {
  const app = loadApp({ store: STORE() });
  app.els.obsSearch.value = "a"; // Bus Stand, Park Gate, Market all contain an 'a'
  await app.els.obsSearch.trigger("input");
  app.run('setSort("dust")');
  assert.deepEqual(order(app), ["Bus Stand", "Market", "Park Gate"]);
  app.els.fFrom.value = "2026-03-02";
  await app.els.fFrom.trigger("change");
  assert.deepEqual(order(app), ["Market", "Park Gate"], "from 2 March only, still searched and sorted by dust");
});
