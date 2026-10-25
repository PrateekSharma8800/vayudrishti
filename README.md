# VayuDrishti

*See the air. Understand the impact.*

Urban Air Quality & Traffic Impact Assessment

Web dashboard built with plain HTML, CSS, JavaScript and Chart.js (CDN). No backend, no build step.

## Run

```
open index.html
```

(or `python3 -m http.server 8000` and visit http://localhost:8000). Internet is needed once to load Chart.js from the CDN.

## Features

- Summary cards, location and date filters
- Add / edit / delete observations (saved in browser localStorage)
- Charts: traffic, dust deposition, traffic vs dust, location comparison
- Hotspot ranking (score = 50% avg dust + 50% avg traffic, scaled 0–100)
- Anonymous aggregate health survey (only totals stored)
- Sample data (clearly labelled “Sample”) – load or delete anytime
- Methodology and limitations
- Dark/light mode, CSV export, insights summary, mobile menu

## Files

`index.html` – page · `style.css` – design · `app.js` – logic

## Note

Sample values are invented for demonstration. Replace them with your own field measurements.
