# marketbot-web

The dashboard for [MarketBot](../marketbot), as a React app. It used to be plain HTML pages served by [marketbot-api](../marketbot-dashboard); it is now its own project and talks to that API over `/api/v1` only.

Vite + React 19 + TypeScript + React Router. ECharts (npm) for the statistics charts.

## Running

```bash
npm install
npm run dev          # http://localhost:5173 - proxies /api and /health to marketbot-api
npm run build        # type-checks, then writes dist/
npm test             # i18n catalogue checks (vitest)
```

Start marketbot-api first (`npm run dev` there, port 8080). If it runs elsewhere, set `API_PROXY_TARGET` in `.env` (see `.env.example`).

With Docker (`docker-compose.yml`, host network, the API still runs on its own):

```bash
docker compose up --build          # the production image, http://localhost:8081
docker compose --profile dev up    # Vite with hot reload, http://localhost:5173
```

## CI and deploy

Same shape as the bot's and marketbot-api's workflows.

- **CI** (`.github/workflows/ci.yml`, every push and PR to `main`): typecheck, tests, build and a compose file check, then the image is built and, off pull requests, pushed to `ghcr.io/<repo>` as `main`, `latest` and the commit sha. Merges to `main` are announced in Telegram.
- **Deploy** (`.github/workflows/deploy.yml`, manual): pulls the chosen tag on the runner, side-loads it to the server over SSH, and runs `docker-compose.prod.yml` there. The container listens on `127.0.0.1:WEB_PORT` only; marketbot-api's nginx serves it on `WEB_DOMAIN` over HTTPS, so deploy the API first, with `WEB_DOMAIN` and `WEB_PORT` in its `API_ENV`, and issue the certificate for `WEB_DOMAIN` once (see that repo's `docker-compose.prod.yml`).

The deploy uses the same `production` environment settings as the other repos: secrets `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `SSH_HOST`, `SSH_USER`, optionally `WEB_ENV` (the server's `.env`: `WEB_PORT`, `API_PORT`) and `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID_CICD`; variables `WEB_DEPLOY_PATH` and optionally `SSH_PORT`.

## Where the API is

The app calls `API_BASE`, from `src/lib/api.ts`: same-origin `/api/v1` unless `VITE_API_BASE` is set at build time.

- **Same origin (recommended).** Serve `dist/` from the nginx that fronts the API, or use the image here: `docker build -t marketbot-web . && docker run -e API_UPSTREAM=http://127.0.0.1:8080 -e WEB_PORT=8081 --network host marketbot-web`. `deploy/nginx.conf.template` serves the app with an SPA fallback, proxies `/api/` (including the market page's WebSocket at `/api/v1/exchange/ws`) and `/health`.
- **Another origin.** Not supported for signed-in use: the API's session cookie is `SameSite=Strict` and CORS is open without credentials, so a dashboard on another site could sign in and still be answered 401 on everything else. Serve it the way `deploy/nginx.conf.template` does, with `/api` proxied on the same origin.

## Sign-in

`/login` is the only page reachable without a session; every other route sends you there and back (`?next=`). The session is an HttpOnly cookie the API sets, which this app never reads: it asks `GET /auth/me` on load, and any `401` afterwards (session expired, password changed elsewhere, admin removed) returns to the sign-in page. Sign out from the sidebar, under your name.

Admins are managed on **Admins** (`/admins`): add one (with a generated password if you like), reset another admin's password (signs them out everywhere), remove one, or change your own. The first admin comes from `ADMIN_USERNAME`/`ADMIN_PASSWORD` in marketbot-api's `.env`; see that repo's README, Sign-in.

## Layout

| Path | What it is |
|---|---|
| `src/App.tsx` | routes, one lazy chunk per page |
| `src/components/Layout.tsx` | sidebar, topbar, status pill and error banner; `usePageStatus()` for pages |
| `src/components/nav.tsx` | the menu and the per-page title/shortcut table, keyed by path |
| `src/pages/*` | one component per former HTML page |
| `src/lib/api.ts` | `API_BASE`, `fetchJSON`, `sendJSON`, `wsUrl` |
| `src/lib/ui.ts` | number formatting helpers and the provider colour mapping |
| `src/lib/charts.tsx` | shared ECharts styling, `<EChart>`, `<DataTable>`, `<Swatch>` |
| `src/lib/theme.tsx` | dark/light theme (stamped on `<html data-theme>`) |
| `src/i18n/` | runtime, React provider, and the `en`/`fa` catalogues |
| `src/styles/app.css` | the stylesheet, unchanged from the HTML dashboard |
| `public/fonts/` | Vazirmatn variable font (SIL OFL, `OFL.txt`) |

A new page needs a route in `App.tsx` and an entry in `nav.tsx` (`PAGES`, and `NAV` if it belongs in the menu).

## Languages

English and Persian (فارسی), switched without a reload from the sidebar footer. The choice is remembered per browser; `?lang=fa` forces one for a visit, and a first-time visitor gets what their browser asks for.

- **One catalogue per language**, `src/i18n/locales/<code>.ts`, registered in `src/i18n/index.tsx`. English is the fallback: a key missing from a translation falls back to it rather than putting a raw key on screen.
- **No component holds a user-visible string.** Components call `t('key', { vars })` from `useI18n()` (reading it through the hook is what re-renders on a language change). The few catalogue strings that carry markup render through `<Html k="key" />`.
- **Numbers, dates and plurals are locale properties.** Persian keeps Latin digits and Western grouping, as Iranian exchanges print prices, but takes the Jalali calendar for dates via `Intl`. Plurals come from `Intl.PluralRules` (`plural('audit.mismatches', n)`).
- **RTL is layout.** `app.css` uses logical properties, so the shell mirrors from `<html dir>` alone; the few things with a direction of their own (a `buy → sell` route, an order id, the chart canvas) are pinned LTR in one `[dir="rtl"]` block.
- **Charts rebuild rather than get relabelled.** ECharts paints into a canvas, so option builders depend on `useChartTokens()`, which changes on every theme or language switch.
- **`npm test` is the guard**: it fails if a locale misses a key English has, a translation drops a `{placeholder}`, the source uses a key no catalogue defines, or the Persian font the catalogue asks for is not shipped.
# marketbot-web
