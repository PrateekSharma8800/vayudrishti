# Deploying VayuDrishti

VayuDrishti is a static site plus two small data endpoints (`/api/aqi` and `/api/traffic`). There is no database. Visitors' observations and survey answers stay in their own browsers, so the **only secrets** your deployment holds are the two API keys.

| Host | Best for | Notes |
|---|---|---|
| **Vercel** | Most people. Free Hobby plan, deploys on every push | Endpoints run as serverless functions |
| **Render** | An always-on server on a free plan | Sleeps after a while on the free plan |
| **Docker** | Fly.io, Railway, Cloud Run, a VPS, your own machine | One small image |
| **Any Node host** | Anywhere with Node 20.12+ | `node server.js` |

## Before you start

You need two free API keys:

- **IQAir** (air quality): sign up for the Community plan at <https://www.iqair.com/air-pollution-data-api>. About 500 calls a day.
- **TomTom** (traffic): create a key at <https://developer.tomtom.com/> with the Traffic API enabled. About 2,500 calls a day.

Treat both like passwords. Never put them in the code, in a commit, or in a chat. If one is ever exposed, create a new key and delete the old one.

## Vercel

### Steps (about five minutes)

1. **Get access to the repository.** Whoever deploys needs to be able to open this repository on GitHub: add them as a collaborator, or let them fork it.
2. **Create the project.** On <https://vercel.com> choose **Add New > Project**, sign in with GitHub, and **Import** the repository.
3. **Leave the settings alone.** `vercel.json` already tells Vercel: no framework, nothing to install or build, serve the `public/` folder.
4. **Add the keys.** Open **Environment Variables** on the same screen and add both, for Production and Preview:
   - `IQAIR_API_KEY`
   - `TOMTOM_API_KEY`
5. **Deploy.** Press **Deploy**. When it finishes you get an address like `https://vayudrishti-xxxx.vercel.app`.
6. **Check it works.** Open the address, go to **Live**, pick a place and press **Fetch live data**. You should see an AQI ring and traffic cards.

If you add or change a key **after** the first deploy, open **Deployments**, choose the latest one and press **Redeploy**. Environment variables only apply to new deployments.

### From the command line instead

```bash
npx vercel                              # first time: log in, link the project, accept the defaults
npx vercel env add IQAIR_API_KEY        # paste the key when asked; choose Production and Preview
npx vercel env add TOMTOM_API_KEY
npx vercel --prod
```

### Quick health check

Open `https://YOUR-ADDRESS/api/aqi?lat=28.6315&lon=77.2167` in a browser.

- JSON that starts with `{"status":"success"` means the key works.
- `{"error":"IQAIR_API_KEY is missing on the server"}` means the variable is not set (or you have not redeployed since adding it).
- A `403` from the provider means the key is wrong or its plan has expired.

### How it works on Vercel

- The page is served as static files from `public/`.
- `/api/aqi` and `/api/traffic` are serverless functions in `api/`. They run the same code as `server.js` (`lib/live.js`), so behaviour matches everywhere.
- **Good readings are cached on Vercel's CDN for 10 minutes** (`Cache-Control: s-maxage`), so repeat visitors never reach a function and never spend your quota. This is what really protects the free plans.
- The per-visitor rate limit and the daily cap live in each function instance's memory. On serverless, instances come and go and do not share memory, so those two are **best effort** only.
- Security headers, including the content security policy, come from `vercel.json`.
- Pushes to `main` redeploy automatically; every pull request gets its own preview address.

### If you change the page's inline script

`public/index.html` has one small inline `<script>` in the `<head>` (theme and a "js" flag). The content security policy allows it by its hash. If you edit it, run:

```bash
npm run sync:vercel
```

and commit the updated `vercel.json`. A test fails if you forget, so CI will tell you.

### Vercel limits to know

- The free **Hobby** plan is for personal, non-commercial use.
- Serverless functions have a time limit. The wait for IQAir or TomTom is capped at 8 seconds so a slow provider gives a clear error instead of a hung request.
- A custom domain can be added under **Settings > Domains**.

## Render

1. In Render choose **New > Blueprint** and pick this repository.
2. When asked, paste `IQAIR_API_KEY` and `TOMTOM_API_KEY`. `render.yaml` sets everything else (Node 22, `HOST=0.0.0.0`, `TRUST_PROXY=1`, the health check at `/healthz`).
3. Deploy. On the free plan the service sleeps after a quiet period, so the first visit afterwards takes about a minute.

## Docker

```bash
docker build -t vayudrishti .
docker run -p 8080:8080 -e IQAIR_API_KEY=... -e TOMTOM_API_KEY=... vayudrishti
```

Then open <http://localhost:8080>. The image uses `node:22-alpine`, runs as the unprivileged `node` user, and has a health check on `/healthz`. Add `-e TRUST_PROXY=1` when a proxy or load balancer sits in front, so rate limits see each visitor's real address. GitHub Actions builds the image and checks `/healthz` and the security headers on every push.

## Any Node host

```bash
HOST=0.0.0.0 PORT=8080 IQAIR_API_KEY=... TOMTOM_API_KEY=... node server.js
```

Most platforms provide `PORT` for you. Put it behind HTTPS (the platform usually does this).

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `IQAIR_API_KEY`, `TOMTOM_API_KEY` | none | Needed for the Live section |
| `HOST` | `127.0.0.1` | `0.0.0.0` accepts outside connections (needed on servers) |
| `PORT` | `8000` | Port to listen on |
| `TRUST_PROXY` | off | `1` when a proxy sits in front; then `X-Forwarded-For` identifies visitors |
| `NODE_ENV` | none | `production` adds the HSTS header |
| `CACHE_SECONDS` | `600` | How long a reading is reused, per place |
| `RATE_LIMIT` | `30` | API requests per visitor per minute |
| `DAILY_UPSTREAM_CAP` | `400` | Calls per provider per day; keep it under your plan's limit |
| `UPSTREAM_TIMEOUT_MS` | `8000` | How long to wait for IQAir or TomTom |

Locally, put the keys in `.env` (copied from `.env.example`). It is git-ignored and never served.

## Protecting your free quota

A public site spends your quota, so there are four layers:

1. **Cache:** a good reading is reused for 10 minutes (and by Vercel's CDN as well).
2. **Per-visitor limit:** 30 data requests per minute per visitor, then a clear "try again in N seconds".
3. **Daily cap per provider:** 400 fresh calls a day, then "the daily limit is used up, try again tomorrow". Cached readings are still served.
4. **Only good readings are cached,** so an error never gets stuck.

Visitors always see a plain message when a limit is hit. The Live section is the only thing that spends quota; everything else works without keys.

## Security notes

- The keys exist only in the server's environment. The browser never receives them, and the proxy ignores any `key` a visitor tries to send.
- The server (and Vercel) send a content security policy that allows scripts only from the site itself, Chart.js on jsDelivr, and the one inline script by hash; they also send `nosniff`, `no-referrer`, `SAMEORIGIN` framing and HSTS on HTTPS hosts.
- Only GET and HEAD are accepted, and only the three files in `public/` are served.
- Observations are never uploaded, so there is no personal data to protect on the server.

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| Live says *"... is missing on the server"* | A key variable is not set for this deployment | Add it, then redeploy |
| Live says *"incorrect_api_key"* or a 403 | The key is wrong, has a stray space, or its plan expired | Create a fresh key and replace it |
| *"too many requests"* | A visitor went over 30 requests a minute | Wait the number of seconds shown |
| *"the daily limit ... is used up"* | The daily cap was reached | Wait for tomorrow, or raise `DAILY_UPSTREAM_CAP` if your plan allows |
| Live says *"could not reach the data provider"* | IQAir or TomTom did not answer in time | Try again in a minute |
| The page loads but looks unstyled or empty | The browser could not load fonts or Chart.js (offline or blocked) | Check the connection; the tables and forms still work |
| Vercel builds but shows 404 | The output directory is not `public/` | Do not override the settings; `vercel.json` sets it |
| A test about `vercel.json` fails | The inline script changed | Run `npm run sync:vercel` and commit |
