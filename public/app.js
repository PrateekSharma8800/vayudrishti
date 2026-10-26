// VayuDrishti – beginner-friendly vanilla JS
const OBS_KEY = "aps_observations";
const SURVEY_KEY = "aps_survey";
const SYMPTOMS = ["Cough", "Eye irritation", "Breathlessness", "Headache", "Throat irritation"];
const $ = (id) => document.getElementById(id);

// ---------- storage ----------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { toast("Could not save data in this browser.", true); return false; }
}
// small message at the bottom of the screen
let toastTimer;
function toast(msg, isError) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 3500);
}
let observations = load(OBS_KEY, []);
let survey = load(SURVEY_KEY, newSurvey());
// stored data may be corrupt or from an older version
if (!Array.isArray(observations)) observations = [];
if (!survey.counts || typeof survey.n !== "number") survey = newSurvey();
SYMPTOMS.forEach((s) => (survey.counts[s] = survey.counts[s] || 0));
const charts = {};
let printing = false; // while true, charts draw without animation so the page prints complete

function newSurvey() {
  const counts = {};
  SYMPTOMS.forEach((s) => (counts[s] = 0));
  return { n: 0, counts, near: 0, sample: false };
}
function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// local YYYY-MM-DD (toISOString would give the UTC date, a day off in IST)
const ymd = (d) => d.toLocaleDateString("en-CA");
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const fmt = (n) => (Math.round(n * 10) / 10).toString();

// ---------- motion helpers ----------
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
// count a number up from 0 so a new value is noticed
function countUp(el, to, decimals, ms) {
  if (calm || !isFinite(to)) { el.textContent = to.toFixed(decimals); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / (ms || 900));
    el.textContent = (to * (1 - Math.pow(1 - k, 3))).toFixed(decimals);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// the "iris": a gauge that fills in. tone 1-5 matches the AQI bands (green ... plum)
function ring(value, max, caption, tone) {
  return `<div class="ring" data-tone="${tone}" style="--v:${Math.max(0, Math.min(1, value / max))}" role="img" aria-label="${value} ${esc(caption)}">` +
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44" pathLength="100"/></svg>' +
    `<div class="ring-c"><b data-count="${value}">${value}</b><small>${esc(caption)}</small></div></div>`;
}
function animateRings() {
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll(".ring:not(.go)").forEach((r) => {
    r.classList.add("go");
    const b = r.querySelector("b");
    countUp(b, Number(b.dataset.count), 0, 1400);
  })));
}
const aqiBand = (n) => (n <= 50 ? 1 : n <= 100 ? 2 : n <= 150 ? 3 : n <= 200 ? 4 : 5);
// plain-language guidance per US AQI band, following the US EPA's cautionary statements
const AQI_ADVICE = [
  "",
  "Air quality is satisfactory. Enjoy being outdoors.",
  "Acceptable for most people. If you are unusually sensitive to air pollution, consider shorter or lighter outdoor exertion.",
  "People with asthma, heart or lung disease, children and older adults should reduce long or heavy outdoor exertion. Everyone else can carry on.",
  "Everyone may start to feel effects. Sensitive groups should avoid long outdoor exertion; everyone else should take more breaks and go easier on outdoor exercise.",
  "Health warning: everyone should avoid long or heavy outdoor exertion, and sensitive groups should stay indoors and keep activity light.",
];
const aqiAdvice = (n) => (n > 300 ? "Health emergency: everyone should avoid all outdoor exertion." : AQI_ADVICE[aqiBand(n)]);
// the haze behind the page takes the colour of the air
const setAtmosphere = (aqi) => { document.documentElement.dataset.aqi = aqiBand(aqi); };

// ---------- theme ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeBtn").innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${theme === "dark" ? "sun" : "moon"}"/></svg>`;
  $("themeBtn").setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  if (typeof Chart !== "undefined") {
    Chart.defaults.color = theme === "dark" ? "rgba(239,233,221,.7)" : "rgba(34,30,24,.66)";
    Chart.defaults.borderColor = theme === "dark" ? "rgba(255,240,215,.1)" : "rgba(60,45,20,.12)";
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.animation = { duration: calm ? 0 : 900, easing: "easeOutQuart" };
  }
}
$("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("aps_theme", next); } catch (e) {}
  // cross-fade the colours instead of snapping
  document.documentElement.classList.add("theming");
  setTimeout(() => document.documentElement.classList.remove("theming"), 650);
  applyTheme(next);
  renderAll();
});

// ---------- print or save as PDF ----------
// A report goes on white paper, so a dark theme is swapped for the light one while printing
// (charts are redrawn in dark ink) and put back afterwards. Nothing is saved.
let themeBeforePrint;
$("printBtn").addEventListener("click", () => window.print());
addEventListener("beforeprint", () => {
  printing = true;
  $("main").dataset.printed = ymd(new Date());
  themeBeforePrint = document.documentElement.dataset.theme;
  if (themeBeforePrint === "dark") applyTheme("light");
  renderAll();
});
addEventListener("afterprint", () => {
  printing = false;
  if (themeBeforePrint === "dark") applyTheme("dark");
  themeBeforePrint = undefined;
  renderAll();
});

// ---------- sidebar drawer (narrow windows) + active link ----------
function setSidebar(open) {
  document.body.classList.toggle("side-open", open);
  $("menuBtn").setAttribute("aria-expanded", open);
  $("menuBtn").setAttribute("aria-label", open ? "Hide sidebar" : "Show sidebar");
}
$("menuBtn").addEventListener("click", () => setSidebar(!document.body.classList.contains("side-open")));
$("scrim").addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setSidebar(false); });
$("nav").addEventListener("click", (e) => { if (e.target.closest("a")) setSidebar(false); });
const navLinks = [...document.querySelectorAll("#nav a")];
// one pill glides to the active link
const navInd = document.querySelector(".nav-ind");
function moveInd() {
  const a = navLinks.find((x) => x.classList.contains("active"));
  if (!navInd || !a) return;
  $("nav").classList.add("has-ind");
  navInd.style.setProperty("--y", a.offsetTop + "px");
  navInd.style.height = a.offsetHeight + "px";
}
addEventListener("resize", moveInd);
if ("IntersectionObserver" in window) {
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      navLinks.forEach((a) => {
        const on = a.getAttribute("href") === "#" + en.target.id;
        a.classList.toggle("active", on);
        if (on) { a.setAttribute("aria-current", "true"); $("tbTitle").textContent = a.textContent; } else a.removeAttribute("aria-current");
      });
      moveInd();
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  navLinks.forEach((a) => { const sec = document.querySelector(a.getAttribute("href")); if (sec) seen.observe(sec); });
  // sections ease in as they scroll into view (the first one has the page-load entrance)
  if (!calm) {
    const rev = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); rev.unobserve(en.target); }
    }), { threshold: 0.06, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll("main > section:not(#dashboard)").forEach((s) => { s.classList.add("reveal"); rev.observe(s); });
  }
}

// ---------- sample data (clearly fake) ----------
function sampleObservations() {
  const places = [
    ["Main Market Crossing", 1800, 22, 310], ["Highway Bus Stand", 2400, 35, 420],
    ["Residential Colony Road", 450, 5, 120], ["City Park Gate", 260, 3, 70], ["School Zone Lane", 700, 8, 160],
  ];
  const slots = ["Morning", "Afternoon", "Evening"];
  const list = [];
  places.forEach((p, i) => {
    for (let d = 0; d < 6; d++) {
      const date = new Date(2025, 0, 6 + d * 2);
      const wobble = 0.85 + ((i * 7 + d * 5) % 10) / 33; // deterministic variation
      list.push({
        id: "s" + i + "_" + d, sample: true, location: p[0],
        date: ymd(date), slot: slots[d % 3],
        traffic: Math.round(p[1] * wobble), heavy: Math.round(p[2] * wobble),
        dust: Math.round(p[3] * wobble * 10) / 10, notes: "Sample data",
      });
    }
  });
  return list;
}

// ---------- filters ----------
function filtered() {
  const loc = $("fLoc").value, from = $("fFrom").value, to = $("fTo").value;
  return observations.filter((o) => (!loc || o.location === loc) && (!from || o.date >= from) && (!to || o.date <= to));
}
function refreshLocations() {
  const names = [...new Set(observations.map((o) => o.location))].sort();
  const current = $("fLoc").value;
  $("fLoc").innerHTML = '<option value="">All locations</option>' + names.map((n) => `<option>${esc(n)}</option>`).join("");
  $("fLoc").value = names.includes(current) ? current : "";
  $("locList").innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
}

// ---------- hotspot calculation ----------
// Fixed reference values (a "full marks" level), so a score does not depend on which
// other locations are loaded or filtered. Teaching values, not official limits.
const REF = { dust: 300, traffic: 2000, heavy: 30 };
function locationStats(data) {
  const groups = {};
  data.forEach((o) => (groups[o.location] = groups[o.location] || []).push(o));
  const stats = Object.keys(groups).map((name) => ({
    name, n: groups[name].length,
    traffic: avg(groups[name].map((o) => o.traffic)),
    heavy: avg(groups[name].map((o) => o.heavy)),
    dust: avg(groups[name].map((o) => o.dust)),
  }));
  stats.forEach((s) => {
    s.score = Math.round(40 * Math.min(s.dust / REF.dust, 1) + 40 * Math.min(s.traffic / REF.traffic, 1) + 20 * Math.min(s.heavy / REF.heavy, 1));
    s.level = s.score >= 70 ? "High" : s.score >= 40 ? "Moderate" : "Low";
  });
  return stats.sort((a, b) => b.score - a.score);
}

// ---------- rendering ----------
function renderAll() {
  refreshLocations();
  const data = filtered();
  const stats = locationStats(data);
  renderInsights(data, stats);
  renderCards(data, stats);
  renderTable(data);
  renderHotspots(stats);
  renderCharts(data, stats);
  renderSurvey();
  renderLiveHistory();
  if (hist) renderHistory(); // redraw for theme changes; station data is not affected by the filters
  styleMarkers();
  $("sampleBanner").hidden = !observations.some((o) => o.sample) && !survey.sample;
}

function renderInsights(data, stats) {
  const real = data.filter((o) => !o.sample).length;
  const hasSample = data.some((o) => o.sample);
  let html = '<p class="eyebrow">Summary</p><h3>Welcome</h3>', gauge = "";
  if (!observations.length) {
    html += '<p class="muted">No observations yet. Add your first field measurement below, or explore the dashboard with clearly labelled demo values.</p>' +
      '<button type="button" id="emptySample">Load sample data</button>';
  } else if (!data.length) {
    html += '<p class="muted">No observations match the current filters. Try pressing Reset.</p>';
  } else {
    const top = stats[0], low = stats[stats.length - 1];
    html = `<p class="eyebrow">Summary</p><h3>${esc(top.name)} is the top hotspot</h3>`;
    gauge = ring(top.score, 100, "hotspot score", { Low: 1, Moderate: 3, High: 4 }[top.level]);
    const dates = data.map((o) => o.date).sort();
    const heavy = Math.round(avg(data.map((o) => o.heavy)));
    const r = corr(data);
    html += `<p class="muted">${real} of your own and ${data.length - real} sample observation(s) shown${hasSample ? " – sample values are demo data, not real measurements" : ""}.</p><ul>` +
      `<li>Highest pollution score: <strong>${esc(top.name)}</strong> (${top.score}/100, ${top.level}).</li>` +
      (stats.length > 1 ? `<li>Lowest: <strong>${esc(low.name)}</strong> (${low.score}/100).</li>` : "") +
      `<li>Data covers ${esc(dates[0])} to ${esc(dates[dates.length - 1])}; heavy vehicles average ${heavy}%.</li>` +
      (data.length > 2 ? `<li>Traffic and dust ${r > 0.5 ? "rise together" : r < -0.5 ? "move in opposite directions" : "show only a weak link"} in this data (correlation ${r.toFixed(2)}). Correlation is not proof of cause.</li>` : "") +
      "</ul>";
  }
  $("insights").innerHTML = `<div class="ins-text">${html}</div>${gauge}`;
  animateRings();
}
// Pearson correlation between traffic and dust
function corr(data) {
  const x = data.map((o) => o.traffic), y = data.map((o) => o.dust), mx = avg(x), my = avg(y);
  let sxy = 0, sxx = 0, syy = 0;
  x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sxx += (v - mx) ** 2; syy += (y[i] - my) ** 2; });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

function renderCards(data, stats) {
  const cards = [
    ["Observations", data.length],
    ["Locations", stats.length],
    ["Avg traffic (veh/h)", data.length ? Math.round(avg(data.map((o) => o.traffic))) : "–"],
    ["Avg dust (mg/m²/day)", data.length ? fmt(avg(data.map((o) => o.dust))) : "–"],
    ["Top hotspot", stats.length ? esc(stats[0].name) : "–"],
  ];
  // numbers get the large size; names get the smaller one
  $("cards").className = "cards" + (cardsFirst ? " enter" : "");
  $("cards").innerHTML = cards.map((c, i) => `<div class="card" style="--i:${i}"><small>${c[0]}</small><b${/^[\d.–-]+$/.test(String(c[1])) ? "" : ' class="txt"'}>${c[1]}</b></div>`).join("");
  // a number counts up only when it changed, so filtering feels alive but not twitchy
  $("cards").querySelectorAll(".card").forEach((card, i) => {
    const b = card.querySelector("b"), to = parseFloat(cards[i][1]);
    if (b.classList.contains("txt") || isNaN(to) || prevCards[cards[i][0]] === to) return;
    prevCards[cards[i][0]] = to;
    countUp(b, to, String(cards[i][1]).includes(".") ? 1 : 0);
  });
  if (cardsFirst) { cardsFirst = false; setTimeout(() => ($("cards").className = "cards"), 1500); }
}
const prevCards = {};
let cardsFirst = true;

// click a column title to sort by it; click again to reverse. Newest first by default.
let obsSort = { key: "date", dir: -1 };
function setSort(key) {
  obsSort = obsSort.key === key ? { key, dir: -obsSort.dir } : { key, dir: ["date", "traffic", "heavy", "dust"].includes(key) ? -1 : 1 };
  renderTable(filtered());
}
$("obsHead").addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-sort]");
  if (b) setSort(b.dataset.sort);
});
$("obsSearch").addEventListener("input", () => renderTable(filtered()));

function renderTable(data) {
  const q = $("obsSearch").value.trim().toLowerCase();
  const matches = q ? data.filter((o) => [o.date, o.location, o.slot, o.notes || ""].some((t) => String(t).toLowerCase().includes(q))) : data;
  const { key, dir } = obsSort;
  const val = (o) => (key === "slot" ? ["Morning", "Afternoon", "Evening"].indexOf(o.slot) : o[key]); // slots sort by time of day
  const rows = [...matches].sort((a, b) => dir * (typeof val(a) === "number" ? val(a) - val(b) : String(val(a)).localeCompare(String(val(b)))) || b.date.localeCompare(a.date));
  document.querySelectorAll("#obsHead th").forEach((th) => {
    const b = th.querySelector("[data-sort]");
    if (b) th.setAttribute("aria-sort", b.dataset.sort === key ? (dir > 0 ? "ascending" : "descending") : "none");
  });
  $("obsBody").innerHTML = rows.length
    ? rows.map((o) => `<tr>
        <td>${esc(o.date)}</td><td>${esc(o.location)}${o.sample ? ' <span class="pill sample">Sample</span>' : ""}</td>
        <td>${esc(o.slot)}</td><td class="num">${o.traffic}</td><td class="num">${o.heavy}</td><td class="num">${o.dust}</td>
        <td><button class="small ghost" data-edit="${o.id}">Edit</button><button class="small ghost danger" data-del="${o.id}">Delete</button></td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="muted empty">${observations.length ? (q ? "No saved observation matches your search." : "No observations match the current filters.") : "No observations yet. Fill in the form to add your first one, or use “Load sample data” above to explore with demo values."}</td></tr>`;
}

function renderHotspots(stats) {
  $("hotBody").innerHTML = stats.length
    ? stats.map((s, i) => `<tr><td class="num">${i + 1}</td><td>${esc(s.name)}</td><td class="num">${Math.round(s.traffic)}</td>
        <td class="num">${fmt(s.dust)}</td><td class="num">${s.score}</td><td><span class="lvl ${s.level}">${s.level}</span></td></tr>`).join("")
    : '<tr><td colspan="6" class="muted empty">No data for the selected filters. Add observations or load sample data.</td></tr>';
}

// draw (or redraw) a chart
function draw(id, config) {
  if (charts[id]) charts[id].destroy();
  config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, printing ? { animation: false } : {}, config.options);
  charts[id] = new Chart($(id), config);
}

// sage accent, plus a warm clay for the second series, so colour only ever means data
const palette = () => (document.documentElement.dataset.theme === "dark" ? { C1: "#7ccdb4", C2: "#e0a87c" } : { C1: "#2e7d6b", C2: "#b8743f" });

function renderCharts(data, stats) {
  if (typeof Chart === "undefined") return; // CDN not loaded (offline)
  const dark = document.documentElement.dataset.theme === "dark";
  // sage accent, plus a warm clay for the second series, so colour only ever means data
  const { C1, C2 } = palette(), C3 = C1;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  // average per date so each date is one point
  const dates = [...new Set(sorted.map((o) => o.date))];
  const perDate = (field) => dates.map((d) => avg(sorted.filter((o) => o.date === d).map((o) => o[field])));

  draw("cTraffic", { type: "line", data: { labels: dates, datasets: [
    { label: "Vehicles per hour", data: perDate("traffic"), borderColor: C1, backgroundColor: C1 + "33", fill: true, tension: 0.3 }] } });
  draw("cDust", { type: "bar", data: { labels: dates, datasets: [
    { label: "Dust (mg/m²/day)", data: perDate("dust"), backgroundColor: C2 }] } });
  draw("cScatter", { type: "scatter", data: { datasets: [
    { label: "Observation", data: data.map((o) => ({ x: o.traffic, y: o.dust })), backgroundColor: C3 }] },
    options: { scales: { x: { title: { display: true, text: "Vehicles per hour" } }, y: { title: { display: true, text: "Dust (mg/m²/day)" } } } } });
  draw("cCompare", { type: "bar", data: { labels: stats.map((s) => s.name), datasets: [
    { label: "Avg traffic (veh/h)", data: stats.map((s) => Math.round(s.traffic)), backgroundColor: C1, yAxisID: "y" },
    { label: "Avg dust (mg/m²/day)", data: stats.map((s) => +fmt(s.dust)), backgroundColor: C2, yAxisID: "y1" }] },
    options: { scales: { y: { position: "left" }, y1: { position: "right", grid: { drawOnChartArea: false } } } } });
}

function renderSurvey() {
  $("surveyTag").hidden = !survey.sample;
  $("surveyText").textContent = survey.n
    ? `${survey.n} responses · ${Math.round((survey.near / survey.n) * 100)}% live/work within 100 m of a main road.`
    : "No responses yet.";
  if (typeof Chart === "undefined") return;
  draw("cSurvey", { type: "bar", data: { labels: SYMPTOMS, datasets: [
    { label: "% of respondents", data: SYMPTOMS.map((s) => (survey.n ? Math.round((survey.counts[s] / survey.n) * 100) : 0)), backgroundColor: document.documentElement.dataset.theme === "dark" ? "#7ccdb4" : "#2e7d6b" }] },
    options: { indexAxis: "y", scales: { x: { max: 100 } } } });
}

// ---------- form: add / edit ----------
function resetForm() {
  $("obsForm").reset();
  $("obsId").value = "";
  $("date").value = ymd(new Date());
  $("formTitle").textContent = "Add observation";
  $("saveBtn").textContent = "Save observation";
  $("cancelBtn").hidden = true;
}

$("obsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = $("obsId").value;
  const record = {
    id: id || "o" + Date.now(),
    sample: false,
    location: $("loc").value.trim(),
    date: $("date").value,
    slot: $("slot").value,
    traffic: Number($("traffic").value),
    heavy: Number($("heavy").value),
    dust: Number($("dust").value),
    notes: $("notes").value.trim(),
  };
  if (!record.location || !record.date || [record.traffic, record.heavy, record.dust].some((n) => isNaN(n) || n < 0)) {
    toast("Please fill in all fields with valid values.", true);
    return;
  }
  const before = observations;
  if (id) observations = observations.map((o) => (o.id === id ? record : o));
  else observations = observations.concat(record);
  if (!save(OBS_KEY, observations)) { observations = before; return; }
  toast(id ? "Observation updated." : "Observation saved.");
  resetForm();
  renderAll();
});

$("cancelBtn").addEventListener("click", resetForm);

// edit / delete buttons in the table
$("obsBody").addEventListener("click", (e) => {
  const editId = e.target.dataset.edit, delId = e.target.dataset.del;
  if (editId) {
    const o = observations.find((x) => x.id === editId);
    $("obsId").value = o.id; $("loc").value = o.location; $("date").value = o.date; $("slot").value = o.slot;
    $("traffic").value = o.traffic; $("heavy").value = o.heavy; $("dust").value = o.dust; $("notes").value = o.notes || "";
    $("formTitle").textContent = "Edit observation" + (o.sample ? " (sample – saving makes it your data)" : "");
    $("saveBtn").textContent = "Update observation";
    $("cancelBtn").hidden = false;
    $("obsForm").scrollIntoView({ behavior: "smooth" });
  }
  if (delId && confirm("Delete this observation?")) {
    observations = observations.filter((o) => o.id !== delId);
    save(OBS_KEY, observations);
    toast("Observation deleted.");
    renderAll();
  }
});

// ---------- field counter: tap once per vehicle, get vehicles per hour and the heavy share ----------
const counter = { light: 0, heavy: 0, taps: [], elapsed: 0, since: 0, running: false, done: false, result: null };
let counterTimer, wakeLock;
const counterTarget = () => Number($("cDur").value) * 60000;
const counterElapsed = () => counter.elapsed + (counter.running ? Date.now() - counter.since : 0);
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function counterRender() {
  const total = counter.light + counter.heavy;
  $("cTime").textContent = clock(counterTarget() - counterElapsed());
  $("nLight").textContent = counter.light;
  $("nHeavy").textContent = counter.heavy;
  $("cPause").textContent = counter.running || (!counter.elapsed && !total) ? "Pause" : "Resume";
  $("cPause").disabled = counter.done || (!counter.running && !counter.elapsed && !total);
  $("cUndo").disabled = counter.done || !counter.taps.length;
  $("cFinish").disabled = counter.done || !total;
  $("cDur").disabled = counter.running || counter.elapsed > 0 || total > 0;
  $("tapLight").disabled = counter.done;
  $("tapHeavy").disabled = counter.done;
}
function counterStart() {
  if (counter.running || counter.done) return;
  counter.running = true;
  counter.since = Date.now();
  clearInterval(counterTimer);
  counterTimer = setInterval(counterTick, 250);
  // keep the screen on while someone stands at the roadside counting
  try { navigator.wakeLock?.request("screen").then((l) => { wakeLock = l; }).catch(() => {}); } catch (e) { /* not supported */ }
  counterRender();
}
function counterPause() {
  if (!counter.running) { counterStart(); return; } // the button doubles as Resume
  counter.elapsed = counterElapsed();
  counter.running = false;
  clearInterval(counterTimer);
  counterRender();
}
function counterTick() { if (counterElapsed() >= counterTarget()) counterFinish(); else counterRender(); }
function counterTap(kind) {
  if (counter.done) return;
  counterStart();
  counter[kind]++;
  counter.taps.push(kind);
  navigator.vibrate?.(15);
  counterRender();
}
function counterUndo() {
  const kind = counter.taps.pop();
  if (kind) { counter[kind]--; counterRender(); }
}
function counterFinish() {
  if (counter.done) return;
  counter.elapsed = Math.min(counterElapsed(), counterTarget());
  counter.running = false;
  counter.done = true;
  clearInterval(counterTimer);
  wakeLock?.release?.(); wakeLock = null;
  navigator.vibrate?.([200, 100, 200]);
  counterRender();
  const total = counter.light + counter.heavy, secs = counter.elapsed / 1000;
  if (secs < 30 || !total) { // too short to scale to an hour honestly
    counter.result = null;
    $("cResultText").textContent = "That was too short to scale up to an hour. Reset and count for a few minutes.";
    $("cUse").hidden = true;
  } else {
    const perHour = Math.round((total / secs) * 3600), pct = Math.round((counter.heavy / total) * 1000) / 10;
    counter.result = { perHour, pct };
    $("cResultText").textContent = `${total} vehicles in ${clock(counter.elapsed)} means about ${perHour} vehicles per hour, and ${pct}% were trucks or buses.`;
    $("cUse").hidden = false;
  }
  $("cResult").hidden = false;
}
function counterReset() {
  if (counter.light + counter.heavy > 0 && !counter.done && !confirm("Discard this count and start again?")) return;
  clearInterval(counterTimer);
  wakeLock?.release?.(); wakeLock = null;
  Object.assign(counter, { light: 0, heavy: 0, taps: [], elapsed: 0, since: 0, running: false, done: false, result: null });
  $("cResult").hidden = true;
  counterRender();
}
$("tapLight").addEventListener("click", () => counterTap("light"));
$("tapHeavy").addEventListener("click", () => counterTap("heavy"));
$("cPause").addEventListener("click", counterPause);
$("cUndo").addEventListener("click", counterUndo);
$("cFinish").addEventListener("click", counterFinish);
$("cReset").addEventListener("click", counterReset);
$("cDur").addEventListener("change", counterRender);
$("cUse").addEventListener("click", () => {
  if (!counter.result) return;
  $("traffic").value = counter.result.perHour;
  $("heavy").value = counter.result.pct;
  if (!$("date").value) $("date").value = ymd(new Date());
  $("obsForm").scrollIntoView({ behavior: calm ? "auto" : "smooth" });
  toast("Filled in vehicles per hour and heavy vehicles. Add the location and dust, then save.");
});
counterRender();

// ---------- dust calculator: dust collected on a plate -> mg/m2/day ----------
function dustCalc() {
  const mg = parseFloat($("dcMg").value), cm2 = parseFloat($("dcArea").value), days = parseFloat($("dcDays").value);
  const ok = mg >= 0 && cm2 > 0 && days > 0;
  const value = ok ? Math.round((mg / (cm2 / 10000) / days) * 10) / 10 : NaN;
  $("dcOut").textContent = ok ? `${mg} mg on ${cm2} cm² over ${days} day(s) is ${value} mg/m²/day.` : "Enter the three numbers to see the result.";
  $("dcUse").disabled = !ok;
  return value;
}
["dcMg", "dcArea", "dcDays"].forEach((id) => $(id).addEventListener("input", dustCalc));
$("dcUse").addEventListener("click", () => {
  const value = dustCalc();
  if (isNaN(value)) return;
  $("dust").value = value;
  $("dustCalc").open = false;
  toast(`Dust set to ${value} mg/m²/day.`);
});

// ---------- sample data / clear ----------
function loadSample() {
  observations = observations.filter((o) => !o.sample).concat(sampleObservations());
  // never overwrite real survey responses
  if (!survey.n || survey.sample) {
    survey = { n: 40, counts: { "Cough": 18, "Eye irritation": 22, "Breathlessness": 9, "Headache": 14, "Throat irritation": 16 }, near: 24, sample: true };
    save(SURVEY_KEY, survey);
  }
  save(OBS_KEY, observations);
  toast("Sample data loaded. It is made-up demo data, not real measurements.");
  renderAll();
}
$("loadSample").addEventListener("click", loadSample);
$("guideSample").addEventListener("click", loadSample);
$("removeSample").addEventListener("click", () => {
  if (!observations.some((o) => o.sample) && !survey.sample) { toast("No sample data to remove.", true); return; }
  if (survey.sample && survey.n > 40 && !confirm("Survey totals include sample data plus your responses. Removing sample data resets the survey. Continue?")) return;
  observations = observations.filter((o) => !o.sample);
  if (survey.sample) survey = newSurvey();
  save(OBS_KEY, observations);
  save(SURVEY_KEY, survey);
  toast("Sample data removed. Your own data is untouched.");
  renderAll();
});
$("insights").addEventListener("click", (e) => { if (e.target.id === "emptySample") loadSample(); });

// ---------- CSV export ----------
$("exportCsv").addEventListener("click", () => {
  if (!observations.length) { toast("Nothing to export yet.", true); return; }
  const cell = (v) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // stop spreadsheet formula injection
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const head = ["Date", "Location", "Time slot", "Vehicles per hour", "Heavy vehicles %", "Dust mg/m2/day", "Notes", "Sample data"];
  const lines = observations.map((o) => [o.date, o.location, o.slot, o.traffic, o.heavy, o.dust, o.notes || "", o.sample ? "yes" : "no"].map(cell).join(","));
  const blob = new Blob(["\ufeff" + [head.map(cell).join(",")].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vayudrishti-observations.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  toast("CSV exported.");
});
// ---------- CSV import ----------
// minimal RFC 4180 parser: quoted fields, "" escapes, CRLF or LF, optional BOM
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
const CSV_COLUMNS = { date: "date", location: "location", slot: "time slot", traffic: "vehicles per hour", heavy: "heavy vehicles %", dust: "dust mg/m2/day", notes: "notes", sample: "sample data" };
const IMPORT_LIMITS = { bytes: 1000000, rows: 5000 };
// turn parsed rows into valid observations; everything else is counted, never trusted
function importRows(rows, existing) {
  const head = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const col = {};
  Object.entries(CSV_COLUMNS).forEach(([k, name]) => (col[k] = head.indexOf(name)));
  const missing = ["date", "location", "slot", "traffic", "heavy", "dust"].filter((k) => col[k] < 0).map((k) => CSV_COLUMNS[k]);
  const out = { records: [], dup: 0, bad: 0, sample: 0, missing };
  if (missing.length) return out;
  const key = (o) => [o.date, o.location.toLowerCase(), o.slot, o.traffic, o.heavy, o.dust].join("|");
  const seen = new Set(existing.filter((o) => !o.sample).map(key));
  const slots = ["Morning", "Afternoon", "Evening"];
  rows.slice(1).forEach((r, i) => {
    // undo the formula guard that the export adds in front of =, +, - and @
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? "").trim().replace(/^'(?=[=+\-@\t\r])/, "") : "");
    if (get("sample").toLowerCase() === "yes") { out.sample++; return; }
    const num = (k) => (get(k) === "" ? NaN : Number(get(k)));
    const rec = {
      id: "i" + Date.now() + "_" + i, sample: false, location: get("location"), date: get("date"),
      slot: slots.find((s) => s.toLowerCase() === get("slot").toLowerCase()),
      traffic: num("traffic"), heavy: num("heavy"), dust: num("dust"), notes: get("notes").slice(0, 200),
    };
    const day = new Date(rec.date + "T00:00:00Z"); // 2025-02-30 must fail, not roll over to March
    const realDate = /^\d{4}-\d{2}-\d{2}$/.test(rec.date) && !isNaN(day) && day.toISOString().slice(0, 10) === rec.date;
    const ok = realDate && rec.slot && rec.location && rec.location.length <= 40 &&
      [rec.traffic, rec.heavy, rec.dust].every((n) => Number.isFinite(n) && n >= 0) && rec.heavy <= 100;
    if (!ok) { out.bad++; return; }
    if (seen.has(key(rec))) { out.dup++; return; }
    seen.add(key(rec));
    out.records.push(rec);
  });
  return out;
}
$("importCsv").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // so picking the same file again still fires
  if (!file) return;
  if (file.size > IMPORT_LIMITS.bytes) { toast("That file is over 1 MB. Split it and import it in parts.", true); return; }
  let rows;
  try { rows = parseCsv(await file.text()); } catch (err) { toast("Could not read that file.", true); return; }
  if (rows.length > IMPORT_LIMITS.rows + 1) { toast(`Too many rows (the limit is ${IMPORT_LIMITS.rows}).`, true); return; }
  const r = importRows(rows, observations);
  if (r.missing.length) { toast(`Missing columns: ${r.missing.join(", ")}. Import a file exported from here.`, true); return; }
  const skipped = [r.dup && `${r.dup} duplicate`, r.bad && `${r.bad} invalid`, r.sample && `${r.sample} sample`].filter(Boolean).join(", ");
  if (!r.records.length) { toast("Nothing imported" + (skipped ? ` (${skipped})` : "") + ".", true); return; }
  const before = observations;
  observations = observations.concat(r.records);
  if (!save(OBS_KEY, observations)) { observations = before; return; }
  toast(`Imported ${r.records.length} observation(s)` + (skipped ? `; skipped ${skipped}` : "") + ".");
  renderAll();
});
$("clearAll").addEventListener("click", () => {
  if (!confirm("Delete ALL observations?")) return;
  observations = [];
  save(OBS_KEY, observations);
  toast("All observations deleted.");
  renderAll();
});

// ---------- filters ----------
["fLoc", "fFrom", "fTo"].forEach((id) => $(id).addEventListener("change", renderAll));
$("fReset").addEventListener("click", () => {
  $("fLoc").value = ""; $("fFrom").value = ""; $("fTo").value = "";
  renderAll();
});

// ---------- survey ----------
$("surveyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (survey.sample && !confirm("The current survey totals are sample data. Your response will be added on top of them. Continue?")) return;
  document.querySelectorAll('input[name="sym"]:checked').forEach((c) => survey.counts[c.value]++);
  if ($("nearRoad").value === "yes") survey.near++;
  survey.n++;
  if (save(SURVEY_KEY, survey)) toast("Thank you – your anonymous response was recorded.");
  e.target.reset();
  renderAll();
});
$("resetSurvey").addEventListener("click", () => {
  if (!confirm("Reset all survey totals?")) return;
  survey = newSurvey();
  save(SURVEY_KEY, survey);
  toast("Survey totals reset.");
  renderAll();
});

// ---------- survey totals: carry them between devices ----------
const SURVEY_FILE = { bytes: 100000, maxResponses: 1000000 };
// read a totals file; throws a message the user can act on if anything is off
function readSurveyTotals(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error("That is not a survey totals file."); }
  if (!d || d.app !== "vayudrishti" || d.type !== "survey-totals" || d.version !== 1) throw new Error("That is not a VayuDrishti survey totals file.");
  const whole = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  if (!whole(d.n, SURVEY_FILE.maxResponses) || !whole(d.near, d.n) || !d.counts || typeof d.counts !== "object") throw new Error("The numbers in that file do not add up.");
  const counts = {};
  for (const s of SYMPTOMS) {
    const v = d.counts[s] ?? 0;
    if (!whole(v, d.n)) throw new Error("The numbers in that file do not add up.");
    counts[s] = v;
  }
  return { n: d.n, near: d.near, counts };
}
$("exportSurvey").addEventListener("click", () => {
  if (!survey.n) { toast("No survey responses to export yet.", true); return; }
  if (survey.sample) { toast("These totals include sample data. Remove the sample data first.", true); return; }
  const file = { app: "vayudrishti", type: "survey-totals", version: 1, exported: new Date().toISOString(), n: survey.n, near: survey.near, counts: survey.counts };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  a.download = "vayudrishti-survey-totals.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  toast("Survey totals exported.");
});
$("importSurvey").addEventListener("click", () => $("surveyFile").click());
$("surveyFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > SURVEY_FILE.bytes) { toast("That file is too big to be a survey totals file.", true); return; }
  let totals;
  try { totals = readSurveyTotals(await file.text()); } catch (err) { toast(err.message, true); return; }
  const question = survey.sample
    ? `Your current survey totals are sample data and will be replaced by this file's ${totals.n} responses. Continue?`
    : `Add ${totals.n} responses from this file to your totals? Adding the same file twice counts it twice.`;
  if (!confirm(question)) return;
  const before = survey;
  const base = survey.sample ? newSurvey() : survey;
  survey = { n: base.n + totals.n, near: base.near + totals.near, counts: {}, sample: false };
  SYMPTOMS.forEach((s) => (survey.counts[s] = (base.counts[s] || 0) + totals.counts[s]));
  if (!save(SURVEY_KEY, survey)) { survey = before; return; }
  toast(`Added ${totals.n} responses. The survey now has ${survey.n}.`);
  renderAll();
});

// ---------- live conditions ----------
const LIVE_KEY = "aps_live";
const live = load(LIVE_KEY, {});
const AQI_LEVELS = [[50, "Good"], [100, "Moderate"], [150, "Unhealthy for sensitive groups"], [200, "Unhealthy"], [300, "Very unhealthy"], [Infinity, "Hazardous"]];
const POLLUTANTS = { p2: "PM2.5", p1: "PM10", o3: "Ozone", n2: "NO₂", s2: "SO₂", co: "CO" };

// The API keys live in .env and are added by server.js; the browser never sees them.
async function getJson(url) {
  let res;
  try { res = await fetch(url, { signal: AbortSignal.timeout(10000) }); }
  catch (e) { throw new Error("could not reach the server (run `node server.js` and open http://localhost:8000)"); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.data?.message || body.detailedError?.message || "HTTP " + res.status);
  return body;
}

// each source returns [label, value] pairs for the cards
async function fetchAqi(lat, lon) {
  const j = await getJson(`/api/aqi?lat=${lat}&lon=${lon}`);
  if (j.status !== "success") throw new Error(j.data?.message || "unexpected response");
  const { city, state, current: { pollution: p, weather: w } } = j.data;
  return [
    ["AQI (US)", `${p.aqius} · ${AQI_LEVELS.find((l) => p.aqius <= l[0])[1]}`],
    ["Main pollutant", POLLUTANTS[p.mainus] || p.mainus],
    ["Temp / humidity", `${w.tp}°C / ${w.hu}%`],
    ["IQAir station city", `${city}, ${state}`],
    ["AQI updated", new Date(p.ts).toLocaleString()],
  ];
}
async function fetchTraffic(lat, lon) {
  const j = await getJson(`/api/traffic?lat=${lat}&lon=${lon}`);
  const f = j.flowSegmentData; // speeds are km/h by default
  const jam = f.freeFlowSpeed ? Math.max(0, Math.round((1 - f.currentSpeed / f.freeFlowSpeed) * 100)) + "%" : "–";
  return [
    ["Traffic speed", `${f.currentSpeed} km/h (free flow ${f.freeFlowSpeed})`],
    ["Congestion", jam + (f.roadClosure ? " · closure reported" : "")],
    ["Traffic data confidence", Math.round(f.confidence * 100) + "%"],
  ];
}
const LIVE_SOURCES = [
  { name: "IQAir", run: fetchAqi },
  { name: "TomTom", run: fetchTraffic },
];

// Delhi NCR places for the dropdown, so nobody needs to know a latitude. Positions are approximate
// (a few hundred metres), which is enough: AQI comes from the nearest station city and traffic
// from the nearest road.
const PLACES = [
  ["Delhi", [
    ["Connaught Place", 28.6315, 77.2167], ["India Gate", 28.6129, 77.2295], ["Chandni Chowk", 28.6506, 77.2303],
    ["Karol Bagh", 28.6519, 77.1909], ["ITO", 28.6285, 77.2410], ["Anand Vihar", 28.6469, 77.3164],
    ["Laxmi Nagar", 28.6304, 77.2773], ["Mayur Vihar", 28.6091, 77.2946], ["Shahdara", 28.6733, 77.2890],
    ["Lajpat Nagar", 28.5677, 77.2433], ["Nehru Place", 28.5494, 77.2519], ["Okhla Industrial Area", 28.5355, 77.2710],
    ["Saket", 28.5245, 77.2066], ["Hauz Khas", 28.5494, 77.2001], ["RK Puram", 28.5660, 77.1767],
    ["Vasant Kunj", 28.5200, 77.1590], ["IGI Airport", 28.5562, 77.1000], ["Dwarka Sector 21", 28.5522, 77.0580],
    ["Najafgarh", 28.6090, 76.9855], ["Mundka", 28.6819, 77.0301], ["Pitampura", 28.7007, 77.1311],
    ["Rohini", 28.7140, 77.1180], ["Jahangirpuri", 28.7255, 77.1710], ["Bawana", 28.7762, 77.0511], ["Narela", 28.8527, 77.0929],
  ]],
  ["Noida and Greater Noida", [
    ["Noida Sector 18", 28.5708, 77.3261], ["Noida Sector 62", 28.6270, 77.3650], ["Noida Sector 125", 28.5440, 77.3310],
    ["Noida Sector 137", 28.5040, 77.4060], ["Greater Noida (Pari Chowk)", 28.4744, 77.5040],
  ]],
  ["Gurugram", [
    ["Cyber Hub", 28.4950, 77.0889], ["MG Road", 28.4796, 77.0800], ["IFFCO Chowk", 28.4720, 77.0720],
    ["Sector 29", 28.4673, 77.0668], ["Udyog Vihar", 28.5020, 77.0850], ["Golf Course Road", 28.4430, 77.1010], ["Sohna Road", 28.4170, 77.0420],
  ]],
  ["Ghaziabad", [
    ["Indirapuram", 28.6420, 77.3680], ["Vaishali", 28.6450, 77.3390], ["Kaushambi", 28.6450, 77.3270],
    ["Vasundhara", 28.6600, 77.3600], ["Raj Nagar Extension", 28.6850, 77.4350], ["Loni", 28.7510, 77.2860],
  ]],
  ["Faridabad", [
    ["NIT Faridabad", 28.3940, 77.3100], ["Old Faridabad", 28.4089, 77.3178], ["Ballabgarh", 28.3410, 77.3180],
  ]],
];
const placeValue = ([, lat, lon]) => `${lat},${lon}`;
$("place").innerHTML = '<option value="">Choose a place…</option>' +
  PLACES.map(([group, items]) => `<optgroup label="${esc(group)}">${items.map((p) => `<option value="${placeValue(p)}">${esc(p[0])}</option>`).join("")}</optgroup>`).join("") +
  '<option value="custom">Somewhere else: enter coordinates…</option>';
const showCoordRow = () => { $("coordRow").hidden = $("place").value !== "custom"; };
$("place").addEventListener("change", showCoordRow);

// where to fetch: a place from the list, or coordinates typed by hand; null if neither is usable
function liveTarget() {
  const v = $("place").value;
  if (!v) return null;
  let lat, lon, name;
  if (v === "custom") {
    if ($("lat").value === "" || $("lon").value === "") return null;
    lat = Number($("lat").value); lon = Number($("lon").value);
    name = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } else {
    [lat, lon] = v.split(",").map(Number);
    name = PLACES.flatMap((g) => g[1]).find((p) => placeValue(p) === v)?.[0] || v;
  }
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon, name } : null;
}

// restore the last choice (older versions stored only a latitude and longitude)
$("lat").value = live.lat || ""; $("lon").value = live.lon || "";
$("place").value = live.place || (live.lat ? "custom" : "");
showCoordRow();

$("useLoc").addEventListener("click", () => {
  if (!navigator.geolocation) { toast("Geolocation is not available in this browser.", true); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $("place").value = "custom"; showCoordRow();
      $("lat").value = pos.coords.latitude.toFixed(5); $("lon").value = pos.coords.longitude.toFixed(5);
    },
    () => toast("Could not get your location.", true));
});

// optional auto-refresh: off by default (a free IQAir key has a small daily quota) and
// skipped while the tab is hidden, so a forgotten tab costs nothing
const AUTO_MS = 15 * 60 * 1000;
let autoTimer;
$("autoLive").addEventListener("change", () => {
  clearInterval(autoTimer);
  if (!$("autoLive").checked) { toast("Auto-refresh is off."); return; }
  if (!liveTarget()) { $("autoLive").checked = false; toast("Choose a place first.", true); return; }
  autoTimer = setInterval(() => { if (!document.hidden) $("liveForm").requestSubmit(); }, AUTO_MS);
  toast("Live data will refresh every 15 minutes while this tab is open.");
  $("liveForm").requestSubmit();
});

$("nowBtn").addEventListener("click", () => {
  if (!liveTarget()) { toast("Choose a place in Live conditions first."); location.hash = "#live"; return; }
  $("liveForm").requestSubmit();
});

// ---- saved readings: every successful fetch is kept (in this browser only) so a trend can be drawn ----
const LOG_KEY = "aps_live_log", LOG_MAX = 200;
let liveLog = load(LOG_KEY, []);
if (!Array.isArray(liveLog)) liveLog = [];
liveLog = liveLog.filter((r) => r && typeof r.t === "string" && typeof r.key === "string");
const spotKey = (t) => `${t.lat.toFixed(4)},${t.lon.toFixed(4)}`;

function logReading(target, cards, aqi) {
  const num = (label) => { const c = cards.find((x) => x[0] === label); const v = c ? parseFloat(c[1]) : NaN; return isNaN(v) ? null : v; };
  const row = { t: new Date().toISOString(), key: spotKey(target), name: target.name, aqi: isNaN(aqi) ? null : aqi, speed: num("Traffic speed"), cong: num("Congestion") };
  if (row.aqi === null && row.speed === null) return;
  const last = liveLog.filter((r) => r.key === row.key).at(-1);
  if (last && Date.now() - Date.parse(last.t) < 120000) return; // the server reuses a reading for minutes, so do not log it twice
  liveLog = liveLog.concat(row).slice(-LOG_MAX);
  save(LOG_KEY, liveLog);
}

function renderLiveHistory() {
  const t = liveTarget();
  const rows = t ? liveLog.filter((r) => r.key === spotKey(t)) : [];
  $("liveHistory").hidden = !rows.length;
  $("liveChartBox").hidden = rows.length < 2;
  if (rows.length < 2 && charts.cLive) { charts.cLive.destroy(); delete charts.cLive; }
  if (!rows.length) return;
  $("liveHistTitle").textContent = `${t.name}: readings over time`;
  $("liveHistNote").textContent = rows.length < 2
    ? "One reading so far. Fetch again later, or turn on auto-refresh, to see a trend."
    : `${rows.length} readings, the latest on ${new Date(rows.at(-1).t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. They are saved in this browser only.`;
  if (rows.length < 2 || typeof Chart === "undefined") return;
  const { C1, C2 } = palette();
  draw("cLive", { type: "line", data: {
    labels: rows.map((r) => new Date(r.t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })),
    datasets: [
      { label: "US AQI", data: rows.map((r) => r.aqi), borderColor: C1, backgroundColor: C1, tension: 0.3, spanGaps: true, yAxisID: "y" },
      { label: "Congestion (%)", data: rows.map((r) => r.cong), borderColor: C2, backgroundColor: C2, tension: 0.3, spanGaps: true, yAxisID: "y1" }] },
    options: { scales: { y: { position: "left", title: { display: true, text: "US AQI" } }, y1: { position: "right", min: 0, max: 100, title: { display: true, text: "Congestion %" }, grid: { drawOnChartArea: false } } } } });
}
$("place").addEventListener("change", renderLiveHistory);
["lat", "lon"].forEach((id) => $(id).addEventListener("change", renderLiveHistory));
$("clearLive").addEventListener("click", () => {
  if (!confirm("Delete all saved live readings?")) return;
  liveLog = [];
  save(LOG_KEY, liveLog);
  renderLiveHistory();
  toast("Saved readings deleted.");
});

$("liveForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const target = liveTarget();
  if (!target) {
    toast($("place").value === "custom" ? "Enter a latitude (-90 to 90) and a longitude (-180 to 180)." : "Choose a place first.", true);
    return;
  }
  save(LIVE_KEY, { place: $("place").value, lat: $("lat").value, lon: $("lon").value });
  $("liveBtn").disabled = true;
  $("nowText").textContent = "Fetching…";
  // shimmering placeholders while the data is on its way
  $("liveTop").innerHTML = "";
  $("liveCards").className = "cards";
  $("liveCards").innerHTML = '<div class="card sk"></div>'.repeat(4);
  const results = await Promise.allSettled(LIVE_SOURCES.map((s) => s.run(target.lat, target.lon)));
  $("liveBtn").disabled = false;
  let cards = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // the floating bar keeps the headline numbers in view
  const pick = (label, prefix) => { const c = cards.find((x) => x[0] === label); return c ? prefix + c[1] : ""; };
  const headline = [pick("AQI (US)", "AQI "), pick("Congestion", "Congestion ")].filter(Boolean).join(" · ");
  $("nowText").textContent = headline ? `${target.name} · ${headline}` : "Could not fetch live data";
  $("nowText").classList.remove("bump"); void $("nowText").offsetWidth; $("nowText").classList.add("bump");
  $("nowBtn").textContent = "Refresh";
  // the AQI becomes an iris, and the haze behind the page takes its colour
  const aqiCard = cards.find((c) => c[0] === "AQI (US)"), aqi = aqiCard ? parseInt(aqiCard[1], 10) : NaN;
  logReading(target, cards, aqi);
  if (!isNaN(aqi)) {
    const where = cards.find((c) => c[0] === "IQAir station city");
    $("liveTop").innerHTML = ring(aqi, 300, "US AQI", aqiBand(aqi)) +
      `<div class="ins-text"><p class="eyebrow">Air near ${esc(target.name)}</p><h3>${esc(String(aqiCard[1]).split(" · ")[1] || "")}</h3>` +
      (where ? `<p class="muted">Nearest station: ${esc(where[1])}</p>` : "") +
      `<p class="advice">${esc(aqiAdvice(aqi))} <span class="muted">General guidance from US EPA categories, not medical advice.</span></p></div>`;
    setAtmosphere(aqi);
    animateRings();
    cards = cards.filter((c) => c !== aqiCard && c !== where);
  }
  $("liveCards").className = "cards enter";
  $("liveCards").innerHTML = cards.map((c, i) => `<div class="card" style="--i:${i}"><small>${esc(c[0])}</small><b>${esc(c[1])}</b></div>`).join("");
  renderLiveHistory();
  $("liveNote").textContent = results.map((r, i) => (r.status === "rejected" ? `${LIVE_SOURCES[i].name} failed: ${r.reason.message}.` : "")).join("");
});

// ---------- monitoring stations: archived official PM2.5 / PM10 from XKDR ----------
// Kept separate from `observations`: never saved, never used in hotspots, correlation or CSV export.
// The XKDR key stays on the server (lib/xkdr.js); the page only calls /api/stations, /api/latest,
// /api/latest-all and /api/history.
const PM_TYPES = ["PM2.5", "PM10"];
const HIST_MAX_DAYS = { daily: 92, hourly: 7 };
let hist = null; // last successful /api/history response

const IST_FORMATS = {
  day: { day: "numeric", month: "short", year: "numeric" },
  hour: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  full: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
};
// show a time in Indian Standard Time, whatever the viewer's own time zone is
function ist(iso, style) {
  if (!iso) return "unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += "T00:00:00+05:30";
  const text = new Intl.DateTimeFormat("en-IN", Object.assign({ timeZone: "Asia/Kolkata" }, IST_FORMATS[style])).format(new Date(iso));
  return style === "full" ? text + " IST" : text;
}
// calendar maths on "YYYY-MM-DD" strings (UTC on purpose, so no time-zone shift)
const shiftDay = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

function setStatus(id, msg, kind) {
  $(id).textContent = msg;
  $(id).className = "hstatus" + (kind ? " " + kind : "");
}
const histStatus = (msg, kind) => setStatus("hStatus", msg, kind);
const mapStatus = (msg, kind) => setStatus("mStatus", msg, kind);
const officialStatus = (msg, kind) => setStatus("oStatus", msg, kind);
const retryHint = (err, again) => (err.retryAfter ? ` Wait ${err.retryAfter} seconds, then ${again}.` : err.retryable ? ` ${again[0].toUpperCase() + again.slice(1)} to retry.` : "");

function clearHistory() {
  hist = null;
  if (charts.cHistory) { charts.cHistory.destroy(); delete charts.cHistory; }
  $("hChartBox").hidden = true;
  $("hMeta").innerHTML = "";
}

// GET JSON from an XKDR route; throws an Error with a readable message
async function xkdrJson(url) {
  let res, body = null;
  try { res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(40000) }); }
  catch (e) { throw Object.assign(new Error("Could not reach the server."), { retryable: true }); }
  try { body = await res.json(); } catch (e) { /* not JSON */ }
  if (!body) throw Object.assign(new Error(`The server sent an unreadable answer (HTTP ${res.status}).`), { retryable: true });
  if (!res.ok) {
    const err = new Error((body.error && body.error.message) || (typeof body.error === "string" && body.error) || "Request failed (HTTP " + res.status + ").");
    err.retryAfter = body.error && body.error.retry_after;
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  return body;
}

// fill the station list and the allowed date range
async function loadStations() {
  histStatus("Loading the station list from XKDR…");
  try {
    const s = await xkdrJson("/api/stations");
    const from = s.coverage.from, to = s.coverage.to;
    $("hStation").innerHTML = '<option value="all">All Delhi stations (average)</option>' + s.stations.map((st) => {
      const ends = st.to && st.to.slice(0, 10) < shiftDay(to, -7) ? ` – data until ${ist(st.to, "day")}` : "";
      return `<option value="${esc(st.id)}">${esc(st.name)} (${esc(st.id)})${esc(ends)}</option>`;
    }).join("");
    ["hFrom", "hTo"].forEach((id) => { $(id).min = from; $(id).max = to; });
    $("hTo").value = to;
    $("hFrom").value = shiftDay(to, -29) < from ? from : shiftDay(to, -29);
    histStatus(`Historical data only: XKDR's Delhi readings run from ${ist(from, "day")} to ${ist(to, "day")} (dataset exported ${ist(s.dataset_exported_at, "full")}). Choose a range and press “Load historical data”.`);
    try { initMap(s); } catch (e) { mapStatus("The station map could not be drawn in this browser.", "error"); }
  } catch (e) {
    histStatus(e.message + retryHint(e, "reload the page"), "error");
    mapStatus("The station map needs the station list, which did not load.", "error");
  }
}

$("histForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const start = $("hFrom").value, end = $("hTo").value, agg = $("hAgg").value;
  if (!start || !end || start > end) { histStatus("Choose a start date on or before the end date.", "error"); return; }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;
  if (days > HIST_MAX_DAYS[agg]) {
    histStatus(`${agg === "daily" ? "Daily" : "Hourly"} view is limited to ${HIST_MAX_DAYS[agg]} days – you chose ${days}. Shorten the range.`, "error");
    return;
  }
  clearHistory();
  $("hLoad").disabled = true;
  $("history").setAttribute("aria-busy", "true");
  histStatus("Loading historical data from XKDR…");
  try {
    hist = await xkdrJson("/api/history?" + new URLSearchParams({ station: $("hStation").value, start, end, agg }));
    renderHistory();
  } catch (err) {
    clearHistory();
    histStatus(err.message + retryHint(err, "press “Load historical data”"), "error");
  } finally {
    $("hLoad").disabled = false;
    $("history").removeAttribute("aria-busy");
  }
});

function renderHistory() {
  const h = hist, hourly = h.query.agg === "hourly", single = h.station.id !== "all";
  const total = h.periods.length, word = hourly ? "hours" : "days";
  const unit = (p) => h.units[p] || "unit not reported";
  $("hMeta").innerHTML = [
    `<strong>Historical data – not live.</strong> Source: <a href="${esc(h.source.url)}" target="_blank" rel="noopener">${esc(h.source.name)}</a> (${esc(h.source.licence)}), compiled from ${esc(h.source.upstream)}. ${esc(h.source.note)}`,
    single
      ? `Station: ${esc(h.station.name)} (${esc(h.station.id)}, ${esc(h.station.source)})`
      : `Stations: ${esc(h.station.name)} – ${h.station.reporting} of ${h.station.total} Delhi stations reported in this period`,
    `Period: ${ist(h.query.start, "day")} – ${ist(h.query.end, "day")} · ${hourly ? "hourly" : "daily"} means · all times in IST (Asia/Kolkata)`,
    `Units (as reported by the source): ${PM_TYPES.map((p) => `${p} ${esc(unit(p))}`).join(", ")}`,
    `Missing: ${PM_TYPES.map((p) => `${p} ${h.series[p].missing} of ${total} ${word}`).join(", ")} – shown as gaps, not filled in.` +
      (single && !hourly ? " Hollow points: fewer than 16 hourly readings that day." : ""),
    `Dataset exported ${ist(h.freshness.dataset_exported_at, "full")} · latest reading for this selection ${ist(h.freshness.latest_reading, "full")} · fetched ${ist(h.freshness.fetched_at, "full")}`,
  ].map((t) => `<li>${t}</li>`).join("");

  if (PM_TYPES.every((p) => h.series[p].missing === total)) {
    if (charts.cHistory) { charts.cHistory.destroy(); delete charts.cHistory; }
    $("hChartBox").hidden = true;
    histStatus("No PM2.5 or PM10 readings were returned for this station and period. This means the station did not report – not that the air was clean.", "warn");
    return;
  }
  histStatus(`Showing ${h.rows} historical records (not live).` + (h.notices.length ? " " + h.notices.join(" ") : ""), h.notices.length ? "warn" : "");
  if (typeof Chart === "undefined") { histStatus("The chart library could not load (are you offline?), so the data cannot be drawn.", "error"); return; }

  const { C1, C2 } = palette(), colors = { "PM2.5": C1, PM10: C2 };
  $("hChartBox").hidden = false;
  draw("cHistory", { type: "line", data: { labels: h.periods.map((t) => ist(t, hourly ? "hour" : "day")), datasets: PM_TYPES.map((p) => ({
    label: `${p} (${unit(p)})`, data: h.series[p].values, borderColor: colors[p], backgroundColor: colors[p],
    pointBackgroundColor: (c) => (h.series[p].low[c.dataIndex] ? "transparent" : colors[p]),
    pointRadius: hourly ? 1.5 : 3, spanGaps: false, tension: 0.2 })) },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { title: { display: true, text: hourly ? "Hour (IST)" : "Date (IST)" } },
        y: { beginAtZero: true, title: { display: true, text: `Concentration (${[...new Set(PM_TYPES.map(unit))].join(" / ")})` } },
      },
      plugins: { tooltip: { callbacks: {
        label: (c) => { const p = PM_TYPES[c.datasetIndex]; return c.raw === null ? `${p}: no reading` : `${p}: ${fmt(c.raw)} ${unit(p)}`; },
        afterLabel: (c) => {
          const s = h.series[PM_TYPES[c.datasetIndex]], n = s.coverage[c.dataIndex];
          if (c.raw === null) return "";
          if (!single) return `  ${n} of ${h.station.total} stations reporting`;
          return hourly ? "" : `  ${n}/24 hourly readings` + (s.low[c.dataIndex] ? " – low coverage" : "");
        },
      } } },
    } });
}

// ---- station map (real XKDR coordinates, Leaflet + OpenStreetMap) ----
let map = null, mapSelected = null;
const markers = {}; // station id -> { station, marker }

function markerColor(st) {
  const { C1, C2 } = palette();
  return /embassy/i.test(st.source) ? C2 : C1;
}
function styleMarkers() {
  const q = $("mSearch").value.trim().toLowerCase();
  Object.values(markers).forEach(({ station, marker }) => {
    const match = !q || station.name.toLowerCase().includes(q) || station.id.toLowerCase().includes(q);
    const on = station.id === mapSelected;
    marker.setStyle({ color: on ? "#f0b54d" : "#fff", weight: on ? 4 : 1.5, fillColor: markerColor(station), fillOpacity: match ? 0.9 : 0.15, opacity: match ? 1 : 0.3 });
    if (on) marker.bringToFront();
  });
}
function fitAll() {
  const pts = Object.values(markers).map((m) => m.marker.getLatLng());
  if (map && pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 14 });
}

function initMap(s) {
  if (typeof L === "undefined") { mapStatus("The map library could not load (are you offline?), so the station map cannot be shown.", "error"); return; }
  const placed = s.stations.filter((st) => Number.isFinite(st.latitude) && Number.isFinite(st.longitude));
  const skipped = s.stations.length - placed.length;
  if (!placed.length) { mapStatus("XKDR returned no station coordinates, so there is nothing to place on the map.", "warn"); return; }

  map = L.map("mapView", { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    // the page sends no referrer, but OpenStreetMap's tile policy asks for one
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Stations: <a href="https://airquality.xkdr.org">India Air Quality Database, XKDR Forum</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  placed.forEach((st) => {
    const marker = L.circleMarker([st.latitude, st.longitude], { radius: 8 })
      .bindTooltip(esc(st.name))
      .on("click", () => selectStation(st.id));
    marker.addTo(layer);
    markers[st.id] = { station: st, marker };
  });
  $("mNames").innerHTML = placed.map((st) => `<option value="${esc(st.name)}">`).join("");
  styleMarkers();
  fitAll();
  mapStatus(`${placed.length} Delhi stations placed at the coordinates XKDR lists for them.` +
    (skipped ? ` ${skipped} station(s) have no coordinates and are not shown.` : ""));
}

// search: dim non-matching markers while typing; Enter (or picking a suggestion) selects a station
function searchMatches() {
  const q = $("mSearch").value.trim().toLowerCase();
  const all = Object.values(markers).map((m) => m.station);
  if (!q) return [];
  const exact = all.filter((st) => st.name.toLowerCase() === q || st.id.toLowerCase() === q);
  return exact.length ? exact : all.filter((st) => st.name.toLowerCase().includes(q) || st.id.toLowerCase().includes(q));
}
$("mSearch").addEventListener("input", () => {
  styleMarkers();
  const q = $("mSearch").value.trim().toLowerCase();
  if (q && Object.values(markers).some((m) => m.station.name.toLowerCase() === q)) selectStation(searchMatches()[0].id);
});
$("mSearch").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (!map) return;
  const found = searchMatches();
  if (!found.length) { mapStatus(`No station matches “${$("mSearch").value.trim()}”.`, "warn"); return; }
  if (found.length > 1) {
    map.fitBounds(L.latLngBounds(found.map((st) => [st.latitude, st.longitude])), { padding: [24, 24], maxZoom: 14 });
    mapStatus(`${found.length} stations match – highlighted on the map. Pick one from the suggestions or click a marker.`);
    return;
  }
  selectStation(found[0].id);
});
$("mFit").addEventListener("click", () => {
  if (!map) return;
  $("mSearch").value = "";
  styleMarkers();
  fitAll();
});

async function selectStation(id) {
  const m = markers[id];
  if (!m) return;
  mapSelected = id;
  styleMarkers();
  map.setView(m.marker.getLatLng(), Math.max(map.getZoom(), 13));
  const st = m.station;
  $("mDetail").innerHTML = `<h3>${esc(st.name)}</h3><p class="muted">Loading the latest archived reading from XKDR…</p>`;
  try {
    const r = await xkdrJson("/api/latest?" + new URLSearchParams({ station: id }));
    if (mapSelected === id) renderStation(r);
  } catch (err) {
    if (mapSelected !== id) return;
    $("mDetail").innerHTML = `<h3>${esc(st.name)}</h3><p class="hstatus error">${esc(err.message + retryHint(err, "select the station again"))}</p>`;
  }
}

function renderStation(r) {
  const st = r.station, anyRecent = r.readings.some((x) => x.recent);
  const ago = (iso) => {
    const h = (Date.now() - Date.parse(iso)) / 3600e3;
    return h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`;
  };
  const rows = r.readings.map((x) => x.value === null
    ? `<tr><th scope="row">${esc(x.parameter)}</th><td colspan="2" class="muted">No reading in XKDR${r.searched ? ` for ${ist(r.searched.from, "day")} – ${ist(r.searched.to, "day")}` : ""}</td></tr>`
    : `<tr><th scope="row">${esc(x.parameter)}</th><td><b>${esc(fmt(x.value))}</b> ${esc(x.unit || "unit not reported")}</td><td>${ist(x.observed_at, "full")}<br><span class="muted">${ago(x.observed_at)}</span></td></tr>`).join("");
  $("mDetail").innerHTML = `
    <h3>${esc(st.name)}</h3>
    <p class="muted">${esc(st.id)} · ${esc(st.source)} · ${esc(st.latitude.toFixed(5))}, ${esc(st.longitude.toFixed(5))}</p>
    <p class="mbadge${anyRecent ? " ok" : ""}">${anyRecent ? `Reading within the last ${r.recent_hours} hours` : "No recent reading"}</p>
    <p class="muted">${anyRecent ? "Newest values XKDR holds for this station:" : "Latest archived reading in the dataset (not live, not current air quality):"}</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Pollutant</th><th>Value (as reported)</th><th>Observed (IST)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <ul class="hmeta">
      <li>Source: <a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(r.source.name)}</a> (${esc(r.source.licence)}), data from ${esc(st.source)}. ${esc(r.source.note)}</li>
      <li>Dataset exported ${ist(r.dataset_exported_at, "full")} · fetched ${ist(r.fetched_at, "full")}</li>
    </ul>
    <button type="button" class="ghost" id="mHistory">View history for this station</button>`;
  $("mHistory").addEventListener("click", () => showHistoryFor(st));
}

// hand the station over to the historical panel: its last 30 days of data
function showHistoryFor(st) {
  if (![...$("hStation").options].some((o) => o.value === st.id)) return;
  $("hStation").value = st.id;
  $("hAgg").value = "daily";
  const last = (st.last_seen || $("hTo").max).slice(0, 10);
  const end = last > $("hTo").max ? $("hTo").max : last;
  $("hTo").value = end;
  $("hFrom").value = shiftDay(end, -29) < $("hFrom").min ? $("hFrom").min : shiftDay(end, -29);
  $("history").scrollIntoView({ behavior: calm ? "auto" : "smooth" });
  $("histForm").requestSubmit();
}

// ---- latest archived readings for every station ----
async function loadOfficial() {
  officialStatus("Loading the latest archived PM2.5 and PM10 readings from XKDR…");
  try {
    const o = await xkdrJson("/api/latest-all");
    const recent = o.stations.some((st) => st.readings.some((r) => r.recent));
    $("oBody").innerHTML = o.stations.map((st) => {
      const times = st.readings.map((r) => r.observed_at).filter(Boolean).sort();
      const newest = times[times.length - 1];
      const cell = (p) => {
        const r = st.readings.find((x) => x.parameter === p);
        if (!r || r.value === null) return '<span class="muted">No reading</span>';
        return `<b>${esc(fmt(r.value))}</b> ${esc(r.unit || "unit not reported")}` + (r.observed_at !== newest ? `<br><span class="muted">${ist(r.observed_at, "full")}</span>` : "");
      };
      const status = st.readings.some((r) => r.recent) ? "" : '<br><span class="mbadge">No recent reading</span>';
      return `<tr><td>${esc(st.name)}</td><td>${cell("PM2.5")}</td><td>${cell("PM10")}</td>
        <td>${newest ? ist(newest, "full") : "No reading in XKDR"}${status}</td><td>${esc(st.source)}</td>
        <td><button type="button" class="small ghost" data-map="${esc(st.id)}">Show on map</button></td></tr>`;
    }).join("");
    officialStatus(`All ${o.stations.length} Delhi stations. Newest readings in the dataset (exported ${ist(o.dataset_exported_at, "full")})` +
      (recent ? "." : `: none is from the last ${o.recent_hours} hours, so these are archived values, not current air quality.`), recent ? "" : "warn");
  } catch (e) {
    officialStatus(e.message + retryHint(e, "reload the page"), "error");
  }
}
$("oBody").addEventListener("click", (e) => {
  const id = e.target.dataset.map;
  if (!id || !markers[id]) return;
  $("stationMap").scrollIntoView({ behavior: calm ? "auto" : "smooth" });
  selectStation(id);
});

// Station data is fetched only when someone scrolls to it, so a visit that never gets there
// costs nothing from the XKDR quota.
if ("IntersectionObserver" in window) {
  const near = new IntersectionObserver((entries) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    near.disconnect();
    loadStations();
    loadOfficial();
  }, { rootMargin: "300px 0px" });
  near.observe($("stations"));
}

// ---------- start ----------
applyTheme(document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
resetForm();
renderAll();
if (typeof Chart === "undefined") toast("Charts could not load (Chart.js needs internet once). Tables still work.", true);
