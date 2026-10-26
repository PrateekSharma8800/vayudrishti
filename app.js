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

// ---------- theme ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeBtn").textContent = theme === "dark" ? "☀️" : "🌙";
  $("themeBtn").setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  if (typeof Chart !== "undefined") {
    Chart.defaults.color = theme === "dark" ? "#c9dad2" : "#33473f";
    Chart.defaults.borderColor = theme === "dark" ? "#2c403a" : "#dbe6e0";
  }
}
$("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("aps_theme", next); } catch (e) {}
  applyTheme(next);
  renderAll();
});

// ---------- mobile menu + active link ----------
$("menuBtn").addEventListener("click", () => {
  const open = $("nav").classList.toggle("open");
  $("menuBtn").setAttribute("aria-expanded", open);
});
$("nav").addEventListener("click", (e) => {
  if (e.target.tagName === "A") { $("nav").classList.remove("open"); $("menuBtn").setAttribute("aria-expanded", false); }
});
const navLinks = [...document.querySelectorAll("#nav a")];
if ("IntersectionObserver" in window) {
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      navLinks.forEach((a) => {
        const on = a.getAttribute("href") === "#" + en.target.id;
        a.classList.toggle("active", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  navLinks.forEach((a) => { const sec = document.querySelector(a.getAttribute("href")); if (sec) seen.observe(sec); });
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
  let html = "<h3>Welcome</h3>";
  if (!observations.length) {
    html += '<p class="muted">No observations yet. Add your first field measurement below, or explore the dashboard with clearly labelled demo values.</p>' +
      '<button type="button" id="emptySample">Load sample data</button>';
  } else if (!data.length) {
    html += '<p class="muted">No observations match the current filters. Try pressing Reset.</p>';
  } else {
    const top = stats[0], low = stats[stats.length - 1];
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
  $("insights").innerHTML = html;
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
  $("cards").innerHTML = cards.map((c) => `<div class="card"><small>${c[0]}</small><b>${c[1]}</b></div>`).join("");
}

function renderTable(data) {
  const rows = [...data].sort((a, b) => b.date.localeCompare(a.date));
  $("obsBody").innerHTML = rows.length
    ? rows.map((o) => `<tr>
        <td>${esc(o.date)}</td><td>${esc(o.location)}${o.sample ? ' <span class="pill sample">Sample</span>' : ""}</td>
        <td>${esc(o.slot)}</td><td>${o.traffic}</td><td>${o.heavy}</td><td>${o.dust}</td>
        <td><button class="small ghost" data-edit="${o.id}">Edit</button><button class="small ghost danger" data-del="${o.id}">Delete</button></td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="muted empty">${observations.length ? "No observations match the current filters." : "No observations yet. Fill in the form to add your first one, or use “Load sample data” above to explore with demo values."}</td></tr>`;
}

function renderHotspots(stats) {
  $("hotBody").innerHTML = stats.length
    ? stats.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${Math.round(s.traffic)}</td>
        <td>${fmt(s.dust)}</td><td>${s.score}</td><td><span class="lvl ${s.level}">${s.level}</span></td></tr>`).join("")
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
  const C1 = dark ? "#4fb3c7" : "#0e5e6f", C2 = dark ? "#e8a35c" : "#c97b2a", C3 = dark ? "#4fc79a" : "#1f7a5a";
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
    { label: "% of respondents", data: SYMPTOMS.map((s) => (survey.n ? Math.round((survey.counts[s] / survey.n) * 100) : 0)), backgroundColor: document.documentElement.dataset.theme === "dark" ? "#4fc79a" : "#1f7a5a" }] },
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
    if (/^[=+\-@]/.test(t)) t = "'" + t; // stop spreadsheet formula injection
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const head = ["Date", "Location", "Time slot", "Vehicles per hour", "Heavy vehicles %", "Dust mg/m2/day", "Notes", "Sample data"];
  const lines = observations.map((o) => [o.date, o.location, o.slot, o.traffic, o.heavy, o.dust, o.notes || "", o.sample ? "yes" : "no"].map(cell).join(","));
  const blob = new Blob(["\ufeff" + [head.map(cell).join(",")].concat(lines).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "air-pollution-observations.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  toast("CSV exported.");
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

// ---------- start ----------
applyTheme(document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
resetForm();
renderAll();
if (typeof Chart === "undefined") toast("Charts could not load (Chart.js needs internet once). Tables still work.", true);
