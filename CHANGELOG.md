# Changelog

All notable changes to VayuDrishti. The format follows [Keep a Changelog](https://keepachangelog.com/).

## 1.1.0 (2026-10-26)

A large step from a local dashboard to a tool you can use in the field and put on the internet.

### Added
- **Field counter:** tap once per vehicle (cars, bikes and autos; trucks and buses) with a 5, 10 or 15 minute timer. Pause, undo and finish early. It computes vehicles per hour and the heavy share, refuses to scale a count under 30 seconds, keeps the screen awake, and fills the observation form.
- **Dust calculator:** milligrams, plate area and days to mg/m²/day.
- **Live conditions:** live US AQI (IQAir) and traffic speed and congestion (TomTom).
- **Delhi NCR place dropdown:** 46 places in Delhi, Noida and Greater Noida, Gurugram, Ghaziabad and Faridabad, plus "Somewhere else" and "Use my location". The last choice is remembered.
- **AQI guidance:** a plain-language note for each US AQI band, based on the US EPA's categories.
- **Atmosphere:** the page's haze takes the colour of the current air quality; the AQI and the hotspot score are shown as iris rings.
- **Saved live readings and trend chart** for each place, with clear and a cap of 200.
- **Optional auto-refresh** for live data every 15 minutes, off by default and paused while the tab is hidden.
- **Observations guide:** an introduction, step-by-step "How to take an observation", and a hint under every field.
- **CSV import** with row-by-row validation (also drops duplicates and demo rows), alongside the existing export.
- **Sorting and search** of the saved observations table.
- **Survey totals export and import** so a group can combine answers.
- **Print report:** a dated, clean report on white paper (or PDF) in any theme.
- **Deployment:** Vercel (serverless functions and `vercel.json`), Render (`render.yaml`), Docker, and any Node host, with `/healthz`.
- **Protection for the free API quotas:** a 10 minute cache, a per-visitor rate limit and a daily cap per provider.
- **Content security policy** that allows the page's one inline script by hash, plus HSTS on HTTPS hosts and other security headers.
- **Tests and CI:** an automated test suite (`npm test`, no dependencies) and a GitHub Action for Node 20 and 22 that also builds the Docker image.
- **Documentation:** user guide, deployment guide, architecture guide, design philosophy and this changelog.

### Changed
- **Complete redesign** around the brand ("Atmosphere"): warm paper and ink, Fraunces and Inter, glass for controls, frosted panels for content, concentric corners, restrained colour and motion, light and dark themes. See [DESIGN.md](DESIGN.md).
- **Hotspot score** now measures against fixed references (300 mg/m²/day, 2000 vehicles/h, 30% heavy) and includes the heavy-vehicle share (40% dust, 40% traffic, 20% heavy). Before, it was scaled against the busiest place loaded, so one place was always 100.
- The site now lives in `public/`; the server only serves those three files.
- API keys moved from the browser into the server's environment (`.env` locally).
- Charts use one palette (sage and warm clay) and a shared font; the survey explains that totals are per browser and how to combine them.
- On phones, panels no longer blur (only the header, floating bar and drawer do).

### Fixed
- Loading sample data no longer overwrites real survey totals, and demo data can be removed without touching your own.
- Dates used the UTC day, so in India sample dates were a day early and the form defaulted to yesterday before 05:30.
- Corrupt or old-format data in `localStorage` no longer crashes the page.
- The observations table and the insight counts now follow the filters.
- The CSV export file name and a tab/carriage-return formula-injection gap.
- A chart showed dust as text instead of a number; charts now tell you when Chart.js could not load.

### Security
- Chart.js is loaded with an integrity hash; charts have text descriptions.
- Imports (CSV and survey totals) are validated and size limited. The server accepts only GET and HEAD, serves only three files, never reflects a visitor's key, and returns a clean error instead of crashing.

## 1.0.0

First release: a local, single-page dashboard with observations stored in the browser, charts, a hotspot ranking, an anonymous health survey, sample data and CSV export.
