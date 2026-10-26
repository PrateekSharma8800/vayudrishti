// Historical Delhi PM2.5 / PM10 from the India Air Quality Database (XKDR Forum), shared by
// server.js and the Vercel functions in api/. XKDR is an archive, never a live feed: every
// answer says so, and missing readings stay missing (null), never 0 and never guessed.
const POLLUTANTS = ["PM2.5", "PM10"];
const MAX_DAYS = { daily: 92, hourly: 7 }; // keeps every request small
const ROW_LIMIT = 50000;  // safety cap per request; hitting it is reported as "truncated"
const LATEST_DAYS = 3;    // latest readings look this many days back from a station's last reading
const RECENT_HOURS = 3;   // a reading older than this is not "recent"
const SOURCE = {
  name: "India Air Quality Database, XKDR Forum",
  upstream: "Central Pollution Control Board (CPCB) CAAQM network; US Department of State via AirNow",
  licence: "CC BY 4.0",
  url: "https://airquality.xkdr.org",
  note: "Values as reported by the monitoring networks (preliminary, not validated). Missing readings are not filled in.",
};
const SOURCE_LABEL = { cpcb_caaqm: "CPCB CAAQM", us_embassy: "US Embassy (AirNow)" };
// how long Vercel's CDN may share a good answer, per route
const CDN_SECONDS = { "/api/stations": 6 * 3600, "/api/latest": 3600, "/api/latest-all": 3600, "/api/history": 600 };

// ---------- dates and times (everything is IST, Asia/Kolkata) ----------
const istParts = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
// Date -> "2026-10-25T14:05:00+05:30"
const toIST = (date) => istParts.format(date).replace(" ", "T") + "+05:30";
// XKDR timestamps are already IST but have no offset ("2024-11-01T00:00:00"): label them, don't shift them
const tagIST = (naive) => (naive ? String(naive).slice(0, 19) + "+05:30" : null);

// "YYYY-MM-DD" -> Date at UTC midnight (pure calendar maths), or null if not a real date
function parseDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s ? d : null;
}
const addDays = (day, n) => new Date(parseDay(day).getTime() + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
const lastDayOfMonth = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);

// every day (or hour) in the range, so missing readings show up as gaps
function periodAxis(start, end, agg) {
  const keys = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (agg === "daily") keys.push(d);
    else for (let h = 0; h < 24; h++) keys.push(d + "T" + String(h).padStart(2, "0"));
  }
  return keys;
}

class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    Object.assign(this, { status, code }, extra);
  }
}

// translate XKDR's documented errors into plain messages
function upstreamError(status, code, detail, retryAfter) {
  switch (status) {
    case 400: return new ApiError(400, "bad_request", "XKDR rejected the request" + (detail ? ": " + detail : "."));
    case 401: return new ApiError(502, "key_rejected", "XKDR rejected the server's API key (XKDR_API_KEY).");
    case 403: return new ApiError(502, "key_not_allowed", "The server's XKDR key is not allowed to read this data (demo keys can only read 2024).");
    case 429: return new ApiError(429, "rate_limited", "XKDR is receiving too many requests.", { retryAfter: Number(retryAfter) || 60 });
    case 503: return code === "no_data"
      ? new ApiError(503, "no_data", "XKDR has not published data for this period yet.")
      : new ApiError(503, "upstream_unavailable", "XKDR's query service is temporarily unavailable. Try again later.");
    case 504: return new ApiError(504, "upstream_timeout", "XKDR took too long to answer. Try a shorter date range or daily resolution.");
    default: return new ApiError(502, "upstream_error", `XKDR returned an unexpected error (HTTP ${status}). Dates outside its coverage can cause this – try another range.`);
  }
}

// Turn XKDR rows into chart-ready series. Missing periods stay null – never 0, never guessed.
function buildHistory(body, o) {
  const rows = Array.isArray(body.data) ? body.data : [];
  const axis = periodAxis(o.start, o.end, o.agg);
  const index = new Map(axis.map((k, i) => [k, i]));
  const keyLength = o.agg === "daily" ? 10 : 13; // "2024-11-01" or "2024-11-01T05"
  const single = o.station !== "all";
  const units = {}, acc = {}, reporting = new Set();
  POLLUTANTS.forEach((p) => (acc[p] = { sum: axis.map(() => 0), stations: axis.map(() => 0), readings: axis.map(() => 0) }));

  rows.forEach((r) => {
    const a = acc[r.parameter_name];
    const i = index.get(String(r.period_start || "").slice(0, keyLength));
    if (!a || i === undefined || typeof r.mean !== "number" || !Number.isFinite(r.mean)) return;
    a.sum[i] += r.mean;
    a.stations[i]++;
    a.readings[i] += Number(r.n) || 0;
    if (r.unit) units[r.parameter_name] = r.unit;
    reporting.add(r.station_id);
  });

  const series = {};
  POLLUTANTS.forEach((p) => {
    const a = acc[p];
    const values = a.stations.map((n, i) => (n ? a.sum[i] / n : null));
    series[p] = {
      values,
      // one station: hourly readings behind each value; all stations: how many stations reported
      coverage: single ? a.readings : a.stations,
      // CPCB needs at least 16 hourly readings for a valid 24-hour average
      low: values.map((v, i) => single && o.agg === "daily" && v !== null && a.readings[i] < 16),
      missing: values.filter((v) => v === null).length,
    };
  });

  const truncated = Boolean(body.meta && body.meta.truncated) || rows.length >= ROW_LIMIT;
  const notices = [];
  if (o.qStart > o.start || o.qEnd < o.end) notices.push(`XKDR has readings for ${o.label} only from ${o.cov.from} to ${o.cov.to}; dates outside that are shown as gaps.`);
  if (truncated) notices.push("The result hit the row limit and is incomplete. Choose a shorter range or daily resolution.");
  if (o.meta.tier === "demo") notices.push("The server is using XKDR's public demo key, which is limited.");
  const first = o.chosen[0];

  return {
    kind: "historical",
    source: SOURCE,
    query: { start: o.start, end: o.end, agg: o.agg, station: o.station, pollutants: POLLUTANTS, timezone: "Asia/Kolkata (IST, UTC+05:30)" },
    station: single
      ? { id: first.id, name: first.name, source: first.source, latitude: first.latitude, longitude: first.longitude }
      : { id: "all", name: "All Delhi stations (average of station means)", total: o.chosen.length, reporting: reporting.size },
    coverage: { from: o.cov.from, to: o.cov.to, queried_from: o.qStart, queried_to: o.qEnd },
    freshness: {
      fetched_at: toIST(new Date()),
      dataset_exported_at: o.meta.exported_at,
      latest_reading: o.chosen.map((s) => s.last_seen).filter(Boolean).sort().pop() || null,
    },
    units,
    periods: axis.map((k) => k + (o.agg === "daily" ? "T00:00:00" : ":00:00") + "+05:30"),
    series,
    rows: rows.length,
    truncated,
    notices,
  };
}

function createXkdr(env = process.env) {
  const num = (v, fallback) => (v === undefined || v === "" ? fallback : Number(v));
  const key = (env.XKDR_API_KEY || "").trim();
  const base = env.XKDR_BASE || "https://airquality.xkdr.org"; // tests point this at a fake XKDR
  const timeout = num(env.XKDR_TIMEOUT_MS, 25000);           // stays under the 30 second function limit in vercel.json
  const rateLimit = num(env.RATE_LIMIT, 30);                 // API requests per client per minute

  // small in-memory cache, so identical requests do not reach XKDR again
  const cache = new Map();
  async function cached(id, ttlMs, fn) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await fn();
    cache.set(id, { at: Date.now(), value });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return value;
  }

  const hits = new Map(); // client -> { start, count }
  function rateWait(client) {
    const now = Date.now(), h = hits.get(client);
    if (!h || now - h.start > 60000) { hits.set(client, { start: now, count: 1 }); return 0; }
    return ++h.count > rateLimit ? Math.ceil((h.start + 60000 - now) / 1000) : 0;
  }
  setInterval(() => { const cutoff = Date.now() - 60000; for (const [k, h] of hits) if (h.start < cutoff) hits.delete(k); }, 60000).unref();

  // never let the key appear in a message, even if XKDR echoes it
  const scrub = (text) => (key ? String(text).split(key).join("[hidden]") : String(text));
  function needKey() {
    if (!key) throw new ApiError(503, "missing_key", "XKDR_API_KEY is missing on the server, so historical data cannot load.");
  }

  async function xkdr(pathAndQuery) {
    let res;
    try {
      res = await fetch(base + pathAndQuery, {
        headers: { Authorization: "Bearer " + key, Accept: "application/json" },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      if (e.name === "TimeoutError") throw new ApiError(504, "upstream_timeout", "XKDR did not answer in time. Try a shorter date range or daily resolution.");
      throw new ApiError(502, "upstream_unreachable", "The server could not reach XKDR. Try again later.");
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* not JSON */ }
    if (res.ok && body) return body;
    if (res.ok) throw new ApiError(502, "upstream_error", "XKDR sent a response that could not be read.");
    throw upstreamError(res.status, body && body.error, body && typeof body.detail === "string" ? scrub(body.detail) : "", res.headers.get("retry-after"));
  }

  // Delhi stations that report PM2.5 or PM10 (cached for a day).
  // state=Delhi includes the US Embassy monitor, which XKDR files under city "New Delhi".
  function delhiStations() {
    return cached("stations", 24 * 3600e3, async () => {
      const body = await xkdr("/v1/stations?state=Delhi&format=json");
      return (body.data || [])
        .filter((s) => (s.parameters || []).some((p) => POLLUTANTS.includes(p)))
        .map((s) => ({
          id: s.station_id, name: String(s.station_name || s.station_id).trim(),
          source: SOURCE_LABEL[s.source] || s.source, latitude: s.latitude, longitude: s.longitude,
          first_seen: tagIST(s.first_seen), last_seen: tagIST(s.last_seen),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  // what XKDR has published (cached for 6 hours)
  function datasetMeta() {
    return cached("meta", 6 * 3600e3, async () => {
      const m = await xkdr("/v1/meta");
      return {
        exported_at: m.exported_at ? toIST(new Date(m.exported_at)) : null,
        first_month: m.measurements && m.measurements.first_month,
        last_month: m.measurements && m.measurements.last_month,
        tier: m.your_tier,
      };
    });
  }

  // first and last day with readings for the chosen station(s), within the published months
  function coverageOf(stations, meta) {
    const days = (field) => stations.map((s) => s[field]).filter(Boolean).map((t) => t.slice(0, 10)).sort();
    let from = days("first_seen")[0] || (meta.first_month && meta.first_month + "-01");
    let to = days("last_seen").pop() || (meta.last_month && lastDayOfMonth(meta.last_month));
    if (meta.first_month && from < meta.first_month + "-01") from = meta.first_month + "-01";
    if (meta.last_month && to > lastDayOfMonth(meta.last_month)) to = lastDayOfMonth(meta.last_month);
    if (!from || !to) throw new ApiError(502, "no_coverage_info", "XKDR did not report which dates it covers. Try again later.");
    return { from, to };
  }

  async function stationsRoute() {
    needKey();
    const [stations, meta] = await Promise.all([delhiStations(), datasetMeta()]);
    return {
      source: SOURCE,
      coverage: coverageOf(stations, meta),
      dataset_exported_at: meta.exported_at,
      stations: stations.map((s) => ({
        id: s.id, name: s.name, source: s.source, from: s.first_seen, to: s.last_seen,
        // coordinates exactly as XKDR lists them; null if missing (the map then leaves the station off)
        latitude: Number.isFinite(s.latitude) ? s.latitude : null,
        longitude: Number.isFinite(s.longitude) ? s.longitude : null,
      })),
    };
  }

  // Newest raw PM2.5 / PM10 row per station, from the LATEST_DAYS up to each station's last reading.
  // Stations that stopped on the same day share one XKDR request (cached for an hour).
  async function latestRows(stations) {
    const byEnd = {};
    stations.filter((s) => s.last_seen).forEach((s) => (byEnd[s.last_seen.slice(0, 10)] = byEnd[s.last_seen.slice(0, 10)] || []).push(s.id));
    const best = {};
    await Promise.all(Object.entries(byEnd).map(async ([end, ids]) => {
      const found = await cached(`latest|${end}|${ids.join(",")}`, 3600e3, async () => {
        const params = new URLSearchParams({ start: addDays(end, 1 - LATEST_DAYS), end, agg: "raw", format: "json", limit: String(ROW_LIMIT) });
        ids.forEach((id) => params.append("station", id));
        POLLUTANTS.forEach((p) => params.append("parameter", p));
        const body = await xkdr("/v1/measurements?" + params);
        const out = {};
        (Array.isArray(body.data) ? body.data : []).forEach((r) => {
          if (!POLLUTANTS.includes(r.parameter_name) || typeof r.value !== "number" || !Number.isFinite(r.value) || !r.collected_at) return;
          const k = r.station_id + "|" + r.parameter_name;
          if (!out[k] || r.collected_at > out[k].collected_at) out[k] = r;
        });
        return out;
      });
      Object.assign(best, found);
    }));
    return best;
  }
  // "recent" is only true if the reading really is less than RECENT_HOURS old
  function readingsOf(st, best) {
    return POLLUTANTS.map((p) => {
      const r = best[st.id + "|" + p];
      if (!r) return { parameter: p, value: null, unit: null, observed_at: null, recent: false };
      const observed = tagIST(r.collected_at);
      return { parameter: p, value: r.value, unit: r.unit || null, observed_at: observed, recent: Date.now() - Date.parse(observed) < RECENT_HOURS * 3600e3 };
    });
  }
  const searchedOf = (st) => (st.last_seen ? { from: addDays(st.last_seen.slice(0, 10), 1 - LATEST_DAYS), to: st.last_seen.slice(0, 10) } : null);

  // /api/latest?station=<station_id>
  async function latestRoute(q) {
    const station = q.get("station") || "";
    if (!/^[A-Za-z0-9_]{1,40}$/.test(station)) throw new ApiError(400, "invalid_station", "Unknown station id.");
    needKey();
    const [stations, meta] = await Promise.all([delhiStations(), datasetMeta()]);
    const st = stations.find((s) => s.id === station);
    if (!st) throw new ApiError(400, "unknown_station", "That station is not in XKDR's Delhi station list.");
    const best = await latestRows(stations); // same cached requests as /api/latest-all
    return {
      kind: "latest",
      source: SOURCE,
      station: { id: st.id, name: st.name, source: st.source, latitude: st.latitude, longitude: st.longitude, last_seen: st.last_seen },
      searched: searchedOf(st),
      readings: readingsOf(st, best),
      recent_hours: RECENT_HOURS,
      dataset_exported_at: meta.exported_at,
      fetched_at: toIST(new Date()),
    };
  }

  // /api/latest-all (every Delhi station)
  async function latestAllRoute() {
    needKey();
    const [stations, meta] = await Promise.all([delhiStations(), datasetMeta()]);
    const best = await latestRows(stations);
    return {
      kind: "latest_all",
      source: SOURCE,
      stations: stations.map((st) => ({ id: st.id, name: st.name, source: st.source, searched: searchedOf(st), readings: readingsOf(st, best) })),
      recent_hours: RECENT_HOURS,
      dataset_exported_at: meta.exported_at,
      fetched_at: toIST(new Date()),
    };
  }

  // /api/history?start=YYYY-MM-DD&end=YYYY-MM-DD&agg=daily|hourly&station=all|<station_id>
  async function historyRoute(q) {
    const start = q.get("start"), end = q.get("end"), agg = q.get("agg") || "daily", station = q.get("station") || "all";
    if (!parseDay(start) || !parseDay(end)) throw new ApiError(400, "invalid_date", "Dates must be real dates in YYYY-MM-DD format.");
    if (start > end) throw new ApiError(400, "invalid_range", "The start date must be on or before the end date.");
    if (!Object.hasOwn(MAX_DAYS, agg)) throw new ApiError(400, "invalid_agg", 'Resolution must be "daily" or "hourly".');
    const days = daysBetween(start, end) + 1;
    if (days > MAX_DAYS[agg]) throw new ApiError(400, "range_too_long", `${agg === "daily" ? "Daily" : "Hourly"} requests are limited to ${MAX_DAYS[agg]} days (you asked for ${days}).`);
    if (end > toIST(new Date()).slice(0, 10)) throw new ApiError(400, "future_date", "The end date is in the future. This panel only shows historical data.");
    if (station !== "all" && !/^[A-Za-z0-9_]{1,40}$/.test(station)) throw new ApiError(400, "invalid_station", "Unknown station id.");
    needKey();

    const [stations, meta] = await Promise.all([delhiStations(), datasetMeta()]);
    const chosen = station === "all" ? stations : stations.filter((s) => s.id === station);
    if (!chosen.length) throw new ApiError(400, "unknown_station", "That station is not in XKDR's Delhi station list.");
    const label = station === "all" ? "Delhi (all stations)" : chosen[0].name;
    const cov = coverageOf(chosen, meta);
    if (start > cov.to || end < cov.from) {
      throw new ApiError(422, "outside_coverage", `XKDR has no readings for this period. ${label} has data from ${cov.from} to ${cov.to}.`, { coverage: cov });
    }

    // only ask XKDR for the part of the range it covers; the rest is shown as gaps
    const qStart = start < cov.from ? cov.from : start;
    const qEnd = end > cov.to ? cov.to : end;
    const params = new URLSearchParams({ start: qStart, end: qEnd, agg, format: "json", limit: String(ROW_LIMIT) });
    if (station === "all") params.set("state", "Delhi");
    else params.set("station", station);
    POLLUTANTS.forEach((p) => params.append("parameter", p));

    return cached(`history|${start}|${end}|${params}`, 10 * 60e3, async () => {
      const body = await xkdr("/v1/measurements?" + params);
      return buildHistory(body, { start, end, agg, station, chosen, label, meta, cov, qStart, qEnd });
    });
  }

  const ROUTES = { "/api/stations": stationsRoute, "/api/latest": latestRoute, "/api/latest-all": latestAllRoute, "/api/history": historyRoute };

  // Returns null for paths that are not XKDR routes, otherwise { status, body, cdnSeconds, retryAfter }.
  async function handle(pathname, query, client) {
    const route = ROUTES[pathname];
    if (!route) return null;
    const reply = (status, data, extra) => ({ status, body: JSON.stringify(data), ...extra });
    const wait = rateWait(client);
    if (wait) return reply(429, { error: { code: "too_many_requests", message: `Too many requests. Try again in ${wait} seconds.`, retry_after: wait } }, { retryAfter: wait });
    try {
      return reply(200, await route(query), { cdnSeconds: CDN_SECONDS[pathname] });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Something went wrong on the server.");
      if (!(e instanceof ApiError)) console.error("XKDR route error:", scrub(e && e.message));
      return reply(err.status, { error: { code: err.code, message: err.message, retry_after: err.retryAfter, coverage: err.coverage } }, { retryAfter: err.retryAfter });
    }
  }
  return { handle };
}

module.exports = { createXkdr, buildHistory, periodAxis, parseDay };
