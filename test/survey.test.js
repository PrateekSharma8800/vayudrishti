// Survey totals can be exported on one device and added up on another.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/dom");

const surveyOf = (app) => JSON.parse(app.store.aps_survey);
const asFile = (obj) => { const text = typeof obj === "string" ? obj : JSON.stringify(obj); return { size: Buffer.byteLength(text), text: async () => text }; };
const totals = (over = {}) => ({ app: "vayudrishti", type: "survey-totals", version: 1, n: 4, near: 3, counts: { Cough: 2, Headache: 4 }, ...over });
async function addTotals(app, obj) { app.els.surveyFile.files = [asFile(obj)]; await app.els.surveyFile.trigger("change"); }

test("totals export as a file with counts only, and importing adds them up", async () => {
  const mine = { n: 5, near: 2, sample: false, counts: { Cough: 3, "Eye irritation": 1, Breathlessness: 0, Headache: 2, "Throat irritation": 1 } };
  const a = loadApp({ store: { aps_survey: JSON.stringify(mine) } });
  await a.els.exportSurvey.click();
  const file = JSON.parse(await a.downloads[0].text());
  assert.deepEqual([file.app, file.type, file.version, file.n, file.near], ["vayudrishti", "survey-totals", 1, 5, 2]);
  assert.deepEqual(Object.keys(file).sort(), ["app", "counts", "exported", "n", "near", "type", "version"], "counts only: nothing that could identify a person");

  const other = { n: 2, near: 1, sample: false, counts: { Cough: 1, "Eye irritation": 0, Breathlessness: 1, Headache: 0, "Throat irritation": 0 } };
  const b = loadApp({ store: { aps_survey: JSON.stringify(other) } });
  await addTotals(b, file);
  const s = surveyOf(b);
  assert.deepEqual([s.n, s.near, s.counts.Cough, s.counts.Breathlessness, s.counts.Headache], [7, 3, 4, 1, 2]);
  assert.match(b.els.toast.textContent, /Added 5 responses. The survey now has 7/);
});

test("importing replaces sample survey totals instead of mixing with them", async () => {
  const app = loadApp();
  await app.els.loadSample.click();
  assert.equal(surveyOf(app).sample, true);
  await addTotals(app, totals());
  assert.deepEqual([surveyOf(app).n, surveyOf(app).sample], [4, false]);
});

test("the user is asked before totals are added, and can say no", async () => {
  const app = loadApp({ confirm: false, store: { aps_survey: JSON.stringify({ n: 1, near: 0, sample: false, counts: { Cough: 1 } }) } });
  await addTotals(app, totals());
  assert.equal(surveyOf(app).n, 1);
});

test("empty and sample totals are not exported", async () => {
  const app = loadApp();
  await app.els.exportSurvey.click();
  assert.match(app.els.toast.textContent, /No survey responses/);
  await app.els.loadSample.click();
  await app.els.exportSurvey.click();
  assert.match(app.els.toast.textContent, /include sample data/);
  assert.equal(app.downloads.length, 0);
});

test("bad or hostile totals files are rejected without changing anything", async () => {
  const start = { n: 2, near: 1, sample: false, counts: { Cough: 1 } };
  const cases = [
    ["not json at all", /not a survey totals file/],
    [{ ...totals(), app: "other" }, /not a VayuDrishti/],
    [{ ...totals(), version: 2 }, /not a VayuDrishti/],
    [totals({ n: -1 }), /do not add up/],
    [totals({ n: 1.5 }), /do not add up/],
    [totals({ near: 9 }), /do not add up/],
    [totals({ counts: { Cough: 99 } }), /do not add up/],
    [totals({ counts: null }), /do not add up/],
    [totals({ n: 5000000, near: 0, counts: {} }), /do not add up/],
  ];
  for (const [file, message] of cases) {
    const app = loadApp({ store: { aps_survey: JSON.stringify(start) } });
    await addTotals(app, file);
    assert.match(app.els.toast.textContent, message, JSON.stringify(file));
    assert.equal(surveyOf(app).n, 2);
  }
  const big = loadApp();
  big.els.surveyFile.files = [{ size: 500000, text: async () => "" }];
  await big.els.surveyFile.trigger("change");
  assert.match(big.els.toast.textContent, /too big/);
});
