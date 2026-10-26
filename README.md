# VayuDrishti

*See the air. Understand the impact.*

[![Tests](https://github.com/PrateekSharma8800/vayudrishti/actions/workflows/test.yml/badge.svg)](https://github.com/PrateekSharma8800/vayudrishti/actions/workflows/test.yml)

**VayuDrishti** (वायुदृष्टि: *vayu* = air, *drishti* = sight) is a small dashboard for urban air quality and traffic impact studies. Log field observations (traffic counts and dust deposition), rank hotspots, run an anonymous health survey, and pull **live AQI** and **live traffic** for any point on the map.

No frameworks, no build step, no dependencies. Plain HTML, CSS and JavaScript, plus a tiny Node server that keeps your API keys off the browser.

![VayuDrishti dashboard in light mode, with the haze tinted by a live AQI reading](docs/screenshots/dashboard-light.jpg)

<details>
<summary>More screenshots</summary>

![Dashboard in dark mode](docs/screenshots/dashboard-dark.jpg)
![Charts in dark mode](docs/screenshots/charts-dark.jpg)

</details>

## Features

- **Dashboard:** summary, filters (location, dates), and key numbers that count up when they change.
- **Observations:** the readings you take yourself in the field (vehicles counted, share of heavy vehicles, dust collected). A built-in guide explains how to take one. Add, edit and delete records; data lives in your browser (`localStorage`). Export to CSV and import it back on another device: rows are validated, duplicates and demo rows are skipped, and nothing existing is overwritten.
- **Charts:** traffic and dust over time, traffic vs dust, and a location comparison.
- **Hotspots:** every location scored 0 to 100 (see below) and ranked.
- **Live conditions:** pick any of about 45 places across Delhi, Noida, Gurugram, Ghaziabad and Faridabad (no latitude or longitude needed) to get the US AQI from [IQAir](https://www.iqair.com/air-pollution-data-api) and current speed and congestion from [TomTom](https://developer.tomtom.com/). After a fetch the page's atmosphere takes the colour of the air.
- **Health survey:** an anonymous, aggregate-only survey (totals only, per browser).
- **Sample data:** clearly labelled demo records you can load and remove without touching your own data.
- **Design:** light and dark themes, responsive down to phones, keyboard friendly, honours reduced motion and reduced transparency. The reasoning is in [DESIGN.md](DESIGN.md).

## Quick start

Needs [Node.js](https://nodejs.org/) 20.12 or newer. There is nothing to install.

```bash
cp .env.example .env      # then add your keys (see below)
node server.js            # or: npm start
```

Open <http://localhost:8000>. Everything except the **Live** section also works by simply opening `index.html` in a browser.

## Live data and API keys

The Live section needs two keys (both have free tiers):

```
IQAIR_API_KEY=...
TOMTOM_API_KEY=...
```

Put them in `.env`, which is git-ignored (when deployed, set them as environment variables instead). `server.js` adds the keys to the API calls itself, so they are never sent to the browser or committed. It serves only `index.html`, `app.js` and `style.css`, and listens on `127.0.0.1`.

- It is meant for **local use**. If you deploy it publicly, put it behind your own authentication and rate limiting first.
- Free IQAir keys are rate limited, so the page fetches only when you press **Fetch**. You can opt in to **Refresh every 15 minutes**; it pauses while the tab is hidden.
- TomTom reports speed and congestion on the nearest road, **not vehicle counts**, so it complements the vehicles per hour you count in the field instead of replacing it.

## How the hotspot score works

```
score = 40% dust + 40% traffic + 20% heavy-vehicle share
```

Each part is the location's average measured against a fixed reference (300 mg/m²/day, 2000 vehicles/h, 30% heavy) and capped at 1, so a score does not change just because another location was added. Below 40 is Low, 40 to 69 Moderate, 70 and above High. The references are teaching values you can change (`REF` in `app.js`); this is not an official air quality index.

## Project structure

| File | What it is |
|---|---|
| `index.html` | The page (markup and icons) |
| `style.css` | Design tokens, glass surfaces, motion |
| `app.js` | State, rendering, charts, live data |
| `server.js` | Local server and API proxy (reads `.env`) |
| `DESIGN.md` | The design philosophy |
| `.env.example` | The keys and optional settings |
| `Dockerfile`, `render.yaml` | Deployment (see Deploy) |

Charts use [Chart.js](https://www.chartjs.org/) from a CDN with an integrity hash; headings use Fraunces and Inter from Google Fonts (system fonts are the fallback).

## Deploy

VayuDrishti is one small Node process with no database. Visitors' observations and survey answers stay in their own browsers; the only secrets on the server are the two API keys.

**Render (easiest, free plan).** In Render choose **New > Blueprint**, pick this repository, and paste the two keys when asked. `render.yaml` sets everything else. The free plan sleeps after a while, so the first visit after a quiet period takes a minute.

**Docker (Fly.io, Railway, Cloud Run, a VPS...).**

```bash
docker build -t vayudrishti .
docker run -p 8080:8080 -e IQAIR_API_KEY=... -e TOMTOM_API_KEY=... vayudrishti
```

Add `-e TRUST_PROXY=1` when a proxy or load balancer sits in front, so rate limits see each visitor's real address.

**Any Node host.** Run `HOST=0.0.0.0 node server.js` (platforms usually provide `PORT`) with the two keys in the environment. HTTPS comes from the host; in production the server also sends HSTS.

| Variable | Default | Meaning |
|---|---|---|
| `IQAIR_API_KEY`, `TOMTOM_API_KEY` | none | Needed for the Live section |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` to accept outside connections |
| `PORT` | `8000` | Port to listen on |
| `TRUST_PROXY` | off | `1` when behind a proxy |
| `NODE_ENV` | none | `production` turns on HSTS |
| `CACHE_SECONDS` | `600` | A reading is reused for this long, per place |
| `RATE_LIMIT` | `30` | API requests per visitor per minute |
| `DAILY_UPSTREAM_CAP` | `400` | Calls per provider per day |

**Protecting your keys' free quota.** A public site spends your quota, so the server caches good readings, limits each visitor, and stops at a daily cap per provider (IQAir's free plan allows about 500 calls a day). Visitors see a clear message when a limit is reached. `GET /healthz` returns `ok` for health checks.

**Static-only hosts** (GitHub Pages, Netlify drop) can show everything except the Live section, which needs the server.

## Tests

```bash
npm test
```

Uses Node's built-in test runner, so there is still nothing to install. The server tests start `server.js` against a fake data provider; the app tests run `app.js` in a small fake browser (`test/helpers/dom.js`). A GitHub Action runs them on Node 20 and 22 for every push and pull request.

## Limits

- Small, non-random samples: results show patterns, not proof.
- Dust deposition is not the same as PM2.5 or PM10 concentration.
- Survey totals and observations are stored per browser, so they are not shared across devices.
- The traffic and dust correlation pools all locations, so differences between places can drive it.

## Privacy

Observations and survey totals never leave your browser. The only network calls are the live-data requests you trigger, which go through `server.js` to IQAir and TomTom with the coordinates you entered.
