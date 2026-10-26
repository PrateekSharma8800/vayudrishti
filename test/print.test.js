// Printing: a report goes on white paper whatever theme the screen is in.
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/dom");

test("the Print report button opens the print dialog", async () => {
  const app = loadApp();
  await app.els.printBtn.click();
  assert.equal(app.prints.length, 1);
});

test("a dark page is printed in the light theme and put back afterwards, without saving anything", async () => {
  const app = loadApp({ theme: "dark", chart: true });
  await app.els.loadSample.click();
  const html = app.ctx.document.documentElement;
  assert.equal(html.dataset.theme, "dark");
  const before = JSON.stringify(app.store);

  app.fire("beforeprint");
  assert.equal(html.dataset.theme, "light");
  assert.equal(app.run("Chart.defaults.color"), "rgba(34,30,24,.66)", "charts redraw in dark ink");
  assert.match(app.els.main.dataset.printed, /^\d{4}-\d{2}-\d{2}$/, "the report is dated");
  assert.equal(app.run("printing"), true);

  app.fire("afterprint");
  assert.equal(html.dataset.theme, "dark");
  assert.equal(app.run("printing"), false);
  assert.equal(JSON.stringify(app.store), before, "printing must not change saved settings");
});

test("a light page stays light and charts are drawn without animation while printing", async () => {
  const app = loadApp({ theme: "light", chart: true });
  await app.els.loadSample.click();
  const drawn = app.charts.length;
  app.fire("beforeprint");
  const duringPrint = app.charts.slice(drawn);
  assert.ok(duringPrint.length >= 5, "every chart is redrawn");
  assert.ok(duringPrint.every((c) => c.options.animation === false));
  app.fire("afterprint");
  assert.equal(app.ctx.document.documentElement.dataset.theme, "light");
});

test("the print stylesheet hides controls and keeps the results", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "style.css"), "utf8");
  const block = css.slice(css.indexOf("@media print"));
  for (const hidden of [".top", ".sidebar", ".nowbar", "#obsForm", "#surveyForm", "#liveForm", ".counter", "details.guide"]) {
    assert.ok(block.includes(hidden), `${hidden} is hidden in print`);
  }
  assert.match(block, /@page \{ margin: 14mm; \}/);
  assert.match(block, /\.js \.reveal \{ opacity: 1 !important/, "sections that never scrolled into view still print");
  assert.match(block, /\.ring \.arc \{ stroke-dashoffset: calc/, "the gauges print full");
});
