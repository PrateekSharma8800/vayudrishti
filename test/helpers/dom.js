// A tiny fake browser, just enough to run app.js under node:test without any dependency.
// loadApp() evaluates app.js in a fresh context and hands back the elements by id.
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");

// like a real dataset, every value is stored as a string
const stringMap = () => new Proxy({}, { set(t, k, v) { t[k] = String(v); return true; } });

function makeEl(id) {
  const classes = new Set(), attrs = {}, handlers = {};
  const el = {
    id, value: "", checked: false, hidden: false, disabled: false, innerHTML: "", textContent: "", className: "",
    dataset: stringMap(), style: { setProperty() {} }, files: [],
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle(c, force) { const on = force ?? !classes.has(c); on ? classes.add(c) : classes.delete(c); return on; },
    },
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null, removeAttribute: (k) => { delete attrs[k]; },
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    // fire an event the way the browser would; resolves when async handlers finish
    async trigger(type, ev = {}) {
      const event = { preventDefault() {}, target: el, ...ev };
      for (const fn of handlers[type] || []) await fn(event);
    },
    click() { return el.trigger("click"); },
    reset() {}, scrollIntoView() {}, requestSubmit() { return el.trigger("submit"); }, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
  };
  return el;
}

// opts.store: initial localStorage; opts.fetch: fetch mock; opts.chart: provide a fake Chart.js
function loadApp(opts = {}) {
  const store = opts.store || {};
  const els = {}, charts = [], downloads = [], intervals = [];
  const el = (id) => (els[id] ||= makeEl(id));
  const doc = {
    documentElement: Object.assign(makeEl("html"), { dataset: Object.assign(stringMap(), opts.theme ? { theme: opts.theme } : {}) }),
    body: makeEl("body"),
    hidden: false,
    getElementById: el, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => Object.assign(makeEl("a"), { click() { downloads.push(this.href); } }),
  };
  const ctx = {
    document: doc, console, AbortSignal, performance, Blob, encodeURIComponent,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    // reduced motion on, so counters and animations settle immediately
    matchMedia: (q) => ({ matches: /reduced-motion/.test(q) || (opts.dark && /dark/.test(q)) }),
    confirm: () => (opts.confirm ?? true),
    navigator: {}, location: { hash: "" }, getComputedStyle: () => ({ fontFamily: "Inter, sans-serif" }),
    requestAnimationFrame: (fn) => fn(), addEventListener() {},
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; }, clearTimeout,
    // intervals are recorded, not run, so tests can fire them by hand
    setInterval: (fn, ms) => { intervals.push({ fn, ms, active: true }); return intervals.length - 1; },
    clearInterval: (id) => { if (intervals[id]) intervals[id].active = false; },
    fetch: opts.fetch || (async () => { throw new Error("no network in tests"); }),
    URL: { createObjectURL: (blob) => { downloads.push(blob); return "blob:test"; }, revokeObjectURL() {} },
  };
  if (opts.chart) {
    ctx.Chart = class { constructor(canvas, config) { this.config = config; charts.push(config); } destroy() {} };
    ctx.Chart.defaults = { font: {}, animation: {} };
  }
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return { els, ctx, store, charts, downloads, intervals, run: (code) => vm.runInContext(code, ctx) };
}

// a fetch mock that answers by URL prefix
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const AQI = { status: "success", data: { city: "Delhi", state: "Delhi", current: { pollution: { ts: "2026-10-26T10:00:00.000Z", aqius: 112, mainus: "p2" }, weather: { tp: 32, hu: 15 } } } };
const TRAFFIC = { flowSegmentData: { currentSpeed: 26, freeFlowSpeed: 30, confidence: 0.7, roadClosure: true } };

module.exports = { loadApp, json, AQI, TRAFFIC };
