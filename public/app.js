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

function renderTable(data) {
  const rows = [...data].sort((a, b) => b.date.localeCompare(a.date));
  $("obsBody").innerHTML = rows.length
    ? rows.map((o) => `<tr>
        <td>${esc(o.date)}</td><td>${esc(o.location)}${o.sample ? ' <span class="pill sample">Sample</span>' : ""}</td>
        <td>${esc(o.slot)}</td><td class="num">${o.traffic}</td><td class="num">${o.heavy}</td><td class="num">${o.dust}</td>
        <td><button class="small ghost" data-edit="${o.id}">Edit</button><button class="small ghost danger" data-del="${o.id}">Delete</button></td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="muted empty">${observations.length ? "No observations match the current filters." : "No observations yet. Fill in the form to add your first one, or use “Load sample data” above to explore with demo values."}</td></tr>`;
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
  config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options);
  charts[id] = new Chart($(id), config);
}

function renderCharts(data, stats) {
  if (typeof Chart === "undefined") return; // CDN not loaded (offline)
  const dark = document.documentElement.dataset.theme === "dark";
  // sage accent, plus a warm clay for the second series, so colour only ever means data
  const C1 = dark ? "#7ccdb4" : "#2e7d6b", C2 = dark ? "#e0a87c" : "#b8743f", C3 = C1;
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
  $("liveNote").textContent = results.map((r, i) => (r.status === "rejected" ? `${LIVE_SOURCES[i].name} failed: ${r.reason.message}.` : "")).join("");
});

// ---------- start ----------
applyTheme(document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
resetForm();
renderAll();
if (typeof Chart === "undefined") toast("Charts could not load (Chart.js needs internet once). Tables still work.", true);
