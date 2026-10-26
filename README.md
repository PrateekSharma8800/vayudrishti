# VayuDrishti

*See the air. Understand the impact.*

Urban Air Quality & Traffic Impact Assessment

Web dashboard built with plain HTML, CSS, JavaScript and Chart.js (CDN). No build step, no dependencies.

## Run

```
cp .env.example .env     # then put your keys in .env
node server.js           # http://localhost:8000
```

Needs Node 20.12+. Internet is needed to load Chart.js from the CDN.

Everything except the **Live** section also works by just opening `index.html`.

## Live AQI and traffic

The **Live** section shows the US AQI from [IQAir](https://www.iqair.com/air-pollution-data-api) and current speed/congestion from [TomTom](https://developer.tomtom.com/) for a lat/lon. The keys go in `.env` (git-ignored):

```
IQAIR_API_KEY=...
TOMTOM_API_KEY=...
```

`server.js` adds the keys to the API calls itself, so they never reach the browser. It serves only the three site files, listens on 127.0.0.1, and is meant for local use. If you deploy this publicly, put it behind your own auth and rate limiting first.

## Features

- Summary cards, location and date filters
- Add / edit / delete observations (saved in browser localStorage)
- Charts: traffic, dust deposition, traffic vs dust, location comparison
- Hotspot ranking (score 0–100 = 40% avg dust + 40% avg traffic + 20% avg heavy-vehicle share, each vs. a fixed reference; see `REF` in `app.js`)
- Anonymous aggregate health survey (only totals stored, per browser – not shared across devices)
- Sample data (clearly labelled “Sample”) – load or remove anytime without touching your own data
- Methodology and limitations
- Dark/light mode, CSV export, insights summary, mobile menu

## Files

`index.html` – page · `style.css` – design · `app.js` – logic

## Note

Sample values are invented for demonstration. Replace them with your own field measurements.
