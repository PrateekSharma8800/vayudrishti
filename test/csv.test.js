// CSV parsing, export/import round trip, and the validation that protects the data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/dom");

const HEAD = "Date,Location,Time slot,Vehicles per hour,Heavy vehicles %,Dust mg/m2/day,Notes,Sample data";
const file = (text) => ({ size: Buffer.byteLength(text), text: async () => text });
const saved = (app) => JSON.parse(app.store.aps_observations || "[]");
async function importText(app, text) {
  app.els.importFile.files = [file(text)];
  await app.els.importFile.trigger("change");
}
const fill = (app, rec) => Object.entries(rec).forEach(([k, v]) => { app.ctx.document.getElementById(k).value = String(v); });

test("parseCsv handles quotes, commas, newlines, CRLF and a BOM", () => {
  const app = loadApp();
  const rows = app.run(`parseCsv('\\ufeffa,"b,1","say ""hi"""\\r\\n"line\\nbreak",x,\\n\\n')`);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [["a", "b,1", 'say "hi"'], ["line\nbreak", "x", ""]]);
});

test("export then import restores the data, including text that starts with a formula character", async () => {
  const app = loadApp();
  fill(app, { loc: "Main, Market", date: "2026-01-02", slot: "Evening", traffic: 1500, heavy: 12, dust: 210.5, notes: '=SUM(1,2) "quoted"' });
  await app.els.obsForm.trigger("submit");
  fill(app, { loc: "-Odd Name", date: "2026-01-03", slot: "Morning", traffic: 10, heavy: 0, dust: 1, notes: "" });
  await app.els.obsForm.trigger("submit");
  const original = saved(app).map(({ id, ...r }) => r);

  await app.els.exportCsv.click();
  const csv = await app.downloads[0].text();
  assert.match(csv, /'=SUM/, "the export neutralises formulas for spreadsheets");

  await app.els.clearAll.click();
  assert.equal(saved(app).length, 0);
  await importText(app, csv);
  assert.deepEqual(saved(app).map(({ id, ...r }) => r), original);
  assert.match(app.els.toast.textContent, /Imported 2 observation/);
});

test("importing the same file twice adds nothing the second time", async () => {
  const app = loadApp();
  const csv = `${HEAD}\n2026-01-02,Park Gate,Morning,300,4,60,,no\n`;
  await importText(app, csv);
  await importText(app, csv);
  assert.equal(saved(app).length, 1);
  assert.match(app.els.toast.textContent, /Nothing imported \(1 duplicate\)/);
});

test("invalid rows are skipped and counted, valid ones still import", async () => {
  const app = loadApp();
  const csv = [HEAD,
    "2026-01-02,Good,Morning,300,4,60,,no",
    "not-a-date,BadDate,Morning,1,1,1,,no",
    "2025-02-30,ImpossibleDate,Morning,1,1,1,,no",
    "2026-01-02,Negative,Morning,-5,1,1,,no",
    "2026-01-02,TooHeavy,Morning,5,101,1,,no",
    "2026-01-02,,Morning,5,1,1,,no",
    "2026-01-02,Bad Slot,Midnight,5,1,1,,no",
    "2026-01-02,Not A Number,Morning,abc,1,1,,no",
    `2026-01-02,${"x".repeat(41)},Morning,5,1,1,,no`,
  ].join("\n");
  await importText(app, csv);
  assert.deepEqual(saved(app).map((o) => o.location), ["Good"]);
  assert.match(app.els.toast.textContent, /Imported 1 observation\(s\); skipped 8 invalid/);
});

test("rows marked as sample data are not imported as real data", async () => {
  const app = loadApp();
  await importText(app, `${HEAD}\n2026-01-02,Demo,Morning,300,4,60,Sample data,yes\n2026-01-03,Real,Morning,300,4,60,,no\n`);
  assert.deepEqual(saved(app).map((o) => [o.location, o.sample]), [["Real", false]]);
  assert.match(app.els.toast.textContent, /1 sample/);
});

test("a file without the expected columns is rejected and nothing is saved", async () => {
  const app = loadApp();
  await importText(app, "name,age\nAda,36\n");
  assert.equal(saved(app).length, 0);
  assert.match(app.els.toast.textContent, /Missing columns: date, location/);
});

test("oversized files and too many rows are refused", async () => {
  const app = loadApp();
  app.els.importFile.files = [{ size: 2000000, text: async () => "" }];
  await app.els.importFile.trigger("change");
  assert.match(app.els.toast.textContent, /over 1 MB/);

  const many = HEAD + "\n" + Array.from({ length: 5001 }, (_, i) => `2026-01-02,P${i},Morning,1,1,1,,no`).join("\n");
  await importText(app, many);
  assert.match(app.els.toast.textContent, /Too many rows/);
  assert.equal(saved(app).length, 0);
});

test("imported text is escaped when it is shown", async () => {
  const app = loadApp();
  await importText(app, `${HEAD}\n2026-01-02,"<img src=x onerror=alert(1)>",Morning,1,1,1,"<b>x</b>",no\n`);
  assert.equal(saved(app).length, 1);
  for (const id of ["obsBody", "hotBody", "cards"]) assert.equal(app.els[id].innerHTML.includes("<img"), false, id);
});

test("importing keeps existing observations and never overwrites them", async () => {
  const app = loadApp();
  fill(app, { loc: "Mine", date: "2026-02-01", traffic: 1, heavy: 1, dust: 1 });
  await app.els.obsForm.trigger("submit");
  await importText(app, `${HEAD}\n2026-02-02,Theirs,Morning,2,2,2,,no\n`);
  assert.deepEqual(saved(app).map((o) => o.location).sort(), ["Mine", "Theirs"]);
});
