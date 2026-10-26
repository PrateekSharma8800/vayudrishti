# How VayuDrishti works

For people who want to understand or change the code. No framework, no build step, no dependencies.

## The big picture

```
 Browser                                        Server (server.js)  or  Vercel functions (api/)
 ┌──────────────────────────────────┐           ┌──────────────────────────────────────────────┐
 │ public/index.html  markup        │  static   │ serve public/ only (three files)              │
 │ public/style.css   design        │ <──────── │ security headers + content security policy   │
 │ public/app.js      everything    │           │                                              │
 │                                  │  /api/aqi │ lib/live.js                                  │
 │ localStorage:                    │  /api/    │  rate limit > check point > check key >      │ ──> IQAir
 │  observations, survey, theme,    │  traffic  │  cache > daily cap > fetch (adds the key)    │ ──> TomTom
 │  last place, saved live readings │ ────────> │                                              │
 └──────────────────────────────────┘           └──────────────────────────────────────────────┘
```

Everything the user types stays in `localStorage`. The server only forwards two kinds of request to IQAir and TomTom, adding the keys.

## Files

| Path | Role |
|---|---|
| `public/index.html` | Markup, an SVG icon sprite, and one tiny inline script in `<head>` that sets the theme and a `js` class before first paint |
| `public/style.css` | Design tokens (`light-dark()` colours), glass surfaces, layout, motion, print and reduced-motion rules |
| `public/app.js` | All behaviour (see below) |
| `server.js` | Plain `http` server for local use, Docker and Render. Serves files, `/healthz` and the two API routes |
| `lib/live.js` | The live-data proxy as a function, `createLive(env)`. Shared by `server.js` and the Vercel functions |
| `lib/security.js` | Builds the security headers, including the CSP with the inline script's hash |
| `lib/xkdr.js` | Historical PM2.5 / PM10 from XKDR as a function, `createXkdr(env)`: stations, latest archived readings, history |
| `lib/vercel.js` | Adapts `lib/live.js` and `lib/xkdr.js` to a Vercel `(req, res)` function |
| `api/*.js` | One-line Vercel functions that call `lib/vercel.js` (`aqi`, `traffic`, `stations`, `latest`, `latest-all`, `history`) |
| `scripts/sync-vercel.js` | Generates `vercel.json` from `lib/security.js` and the page |
| `vercel.json` | **Generated**; do not edit by hand (`npm run sync:vercel`) |
| `test/` | Tests (see below) |

## public/app.js, section by section

The file is one script, ordered top to bottom:

1. **Storage:** `load()` and `save()` wrap `localStorage` with error handling; corrupt or old data is ignored.
2. **Motion helpers:** `countUp`, `ring` (the iris gauge), `animateRings`, `setAtmosphere`. `calm` is true under reduced motion.
3. **Theme, print:** theme button; `beforeprint` and `afterprint` swap a dark page to light while printing (nothing is saved).
4. **Sidebar drawer and active link:** one pill glides to the active section; sections reveal on scroll.
5. **Sample data, filters, hotspot calculation** (`locationStats`, the `REF` references).
6. **Rendering:** `renderAll` calls the individual renderers (insights, cards, table with sorting and search, hotspots, charts, survey, live history).
7. **Observation form, edit and delete.**
8. **Field counter** (a small state machine: tap, pause, undo, finish) and the **dust calculator**.
9. **Sample data and clearing; CSV export and import** (`parseCsv`, `importRows`).
10. **Survey,** and **survey totals** export and import (`readSurveyTotals`).
11. **Live conditions:** the `PLACES` list, `liveTarget()`, fetching, the saved-readings log and trend chart, auto-refresh.
12. **Start:** applies the theme, resets the form and renders.

## Where data is stored

| `localStorage` key | Holds |
|---|---|
| `aps_observations` | Your observations (and any loaded sample rows, flagged `sample: true`) |
| `aps_survey` | Survey totals: `{ n, counts, near, sample }` |
| `aps_live` | The last chosen place and coordinates |
| `aps_live_log` | Saved live readings (newest 200) |
| `aps_theme` | `light` or `dark`, only if the user picked one |

## The live-data proxy (`lib/live.js`)

`handle(pathname, query, client)` returns `null` for paths it does not own, otherwise `{ status, body, cache, retryAfter }`. In order it:

1. applies the **per-client rate limit** (`RATE_LIMIT` a minute) → 429
2. validates `lat` and `lon` → 400
3. checks the **key** exists in the environment → 500 (the message names the variable, never its value)
4. returns a **cached** reading if one is under `CACHE_SECONDS` old (key: route plus coordinates rounded to 3 decimals)
5. applies the **daily cap** per provider (`DAILY_UPSTREAM_CAP`) → 429
6. calls the provider with the key (a `key` sent by the browser is ignored), caching **only** 200 responses
7. turns a network failure or timeout into 502

The browser never sees a key and never sees the provider's URL.

## Security

- **Content security policy** (`lib/security.js`): scripts only from the site, `cdn.jsdelivr.net` (Chart.js, which also carries an integrity hash) and the one inline script **by its hash**, so `script-src` never needs `'unsafe-inline'`. The hash is computed from the page, so `server.js` is always right. `vercel.json` needs the same value written down, which is why it is generated and a test fails if it drifts.
- Headers: `nosniff`, `no-referrer`, `SAMEORIGIN` framing, a geolocation-only permissions policy, and HSTS on HTTPS hosts.
- Output is escaped with `esc()` wherever user text is placed into HTML (observation names, notes, imported rows, place names).
- Imports (CSV and survey totals) are treated as untrusted: validated field by field and size limited. A CSV import only adds records, and survey totals ask before anything changes.

## Tests

`npm test` runs Node's built-in runner over `test/`:

| File | Covers |
|---|---|
| `server.test.js` | File whitelist, headers, coordinate validation, key handling, provider errors, cache, rate limit, daily cap, proxy trust, CSP hash, HSTS (starts the real `server.js` against a fake provider) |
| `vercel.test.js` | The generated `vercel.json`, and `api/*.js` called with fake requests |
| `app.test.js` | Startup, sample data, saving and escaping, scoring, dates, theme, charts, the Live panel and dropdown, field counter, dust calculator, AQI guidance, auto-refresh |
| `csv.test.js` | CSV parsing, export and import round trip, validation |
| `survey.test.js` | Survey totals export and import, hostile files |
| `history.test.js` | Saved live readings and the trend chart |
| `table.test.js` | Sorting and searching the table |
| `print.test.js` | Printing in the light theme, and the print stylesheet |
| `helpers/dom.js` | A small fake browser that runs `public/app.js` and exposes elements by id |

The fake browser records `setInterval` and `window` events instead of running them, and tests control `Date.now()` by hand, so there are no sleeps and no flakiness.

## Common changes

**Add or move a place.** Edit `PLACES` in `public/app.js`: `["Name", latitude, longitude]` inside the right city group. A test checks every place is inside the Delhi NCR area, which catches typos.

**Change the hotspot references or weights.** Edit `REF` and the 40/40/20 weights in `locationStats` (`public/app.js`), then update the README's score section.

**Add a survey symptom.** Add it to `SYMPTOMS` in `public/app.js` and add a checkbox with the same value in `public/index.html`. Old exported totals still import (missing symptoms count as 0).

**Add a live data source.** Add its route and key variable to `API` in `lib/live.js`, create `api/<name>.js` (one line, like `api/aqi.js`), add a fetch function and an entry in `LIVE_SOURCES` in `public/app.js`, and add tests.

**Edit the inline script in `index.html`.** Run `npm run sync:vercel` and commit `vercel.json`.

## Conventions

- No dependencies. If something needs a package, think again first.
- Keys only ever live in the environment. Never in `public/`, never in a commit.
- One concern per commit; tests with the change.
- Anything that moves respects `prefers-reduced-motion`; anything translucent respects `prefers-reduced-transparency`.
