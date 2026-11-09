# marketbot-web

Customer operations now have a separate build and deployment for
`backoffice.parscryptoexchange.com`: see [backoffice deployment](deploy/BACKOFFICE.md).

CI/CD setup and runtime secret templates: [deploy/README.md](deploy/README.md).

The dashboard for [MarketBot](../marketbot), as a React app. It used to be plain HTML pages served by [marketbot-api](../marketbot-dashboard); it is now its own project and talks to that API over `/backoffice/v1` only.

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

See [the CI/CD guide](deploy/README.md). Manual deployment defaults to source
builds on the host, with CI image transfer available as a fallback. Configure
`WEB_ENV` and `WEB_DEPLOY_PATH` in the GitHub production environment.

## Where the API is

The app calls `API_BASE`, from `src/lib/api.ts`: same-origin `/backoffice/v1` unless `VITE_API_BASE` is set at build time.

- **Same origin (recommended).** Serve `dist/` from the nginx that fronts the API, or use the image here: `docker build -t marketbot-web . && docker run -e API_UPSTREAM=http://127.0.0.1:8080 -e WEB_PORT=8081 --network host marketbot-web`. `deploy/nginx.conf.template` serves the app with an SPA fallback, proxies `/api/` (including the market page's WebSocket at `/backoffice/v1/exchange/ws`) and `/health`.
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

## Styling and state

Tailwind CSS is integrated with Vite and available across both frontend builds.
Utilities use the `tw:` prefix. `src/styles/tailwind.css` applies the shared form
control styling to existing filter fields and customer workspaces, using the
same theme variables for dark/light themes and RTL layouts. The existing
stylesheet remains in place; Tailwind Preflight is omitted to preserve it.

Zustand already manages authentication, theme, shell and page status. React Query
manages server data; component-local form state stays local.

## Languages

English and Persian (فارسی), switched without a reload from the sidebar footer. The choice is remembered per browser; `?lang=fa` forces one for a visit, and a first-time visitor gets what their browser asks for.

- **One catalogue per language**, `src/i18n/locales/<code>.ts`, registered in `src/i18n/index.tsx`. English is the fallback: a key missing from a translation falls back to it rather than putting a raw key on screen.
- **No component holds a user-visible string.** Components call `t('key', { vars })` from `useI18n()` (reading it through the hook is what re-renders on a language change). The few catalogue strings that carry markup render through `<Html k="key" />`.
- **Numbers, dates and plurals are locale properties.** Persian keeps Latin digits and Western grouping, as Iranian exchanges print prices, but takes the Jalali calendar for dates via `Intl`. Plurals come from `Intl.PluralRules` (`plural('audit.mismatches', n)`).
- **RTL is layout.** `app.css` uses logical properties, so the shell mirrors from `<html dir>` alone; the few things with a direction of their own (a `buy → sell` route, an order id, the chart canvas) are pinned LTR in one `[dir="rtl"]` block.
- **Charts rebuild rather than get relabelled.** ECharts paints into a canvas, so option builders depend on `useChartTokens()`, which changes on every theme or language switch.
- **`npm test` is the guard**: it fails if a locale misses a key English has, a translation drops a `{placeholder}`, the source uses a key no catalogue defines, or the Persian font the catalogue asks for is not shipped.
# marketbot-web

## Withdrawals

In the separate backoffice build, `/withdrawals` lists the Mini App's withdrawal requests with status and search
filters. Admins can edit pending requests (amount, destination, network,
beneficiary and note), approve them for processing, or reject them to release
the reserved balance. After paying externally, use **Mark paid** with the payout
reference to debit the reserved funds. Approval itself does not send a payment.
Every action requires a reason and confirmation; stale reviews fail with 409.

Requires the matching withdrawal endpoints in marketbot-api and the Mini App's
current shared withdrawal schema. The page has English and Persian labels and
uses explicit refresh while an operator reviews a stable snapshot.

Financial submissions to the updated API use durable idempotency keys. The
shared `financialRequest` client retains a key across unresolved/network failures, page reloads
and browser restarts using localStorage (payload digest and UUID only). Exchange
placements with an unknown outcome are shown as unconfirmed, retain the key,
and can be retried to reconcile the original operation. Deploy this dashboard
with the API's financial-request/reservation migration. If browser localStorage
is unavailable, financial submission stops before sending.

### Customer management

Open **Customers** in the backoffice sidebar (`/customers`). Search by name, phone, email or
national ID; real customers are shown by default. Each customer has profile,
wallet, bank-account, activity and admin-history sections. Wallet adjustments
require a reason and a review step and preserve exact decimal strings and
idempotency keys. Release operations select an admin hold rather than touching
order or withdrawal reservations. Withdrawal and P2P decisions use the existing
review workspace.

Deploy with the matching API changes and run its migration `009_customer_audit`
first. Admin edit history starts at that deployment; it does not backfill older
changes. All existing admin sessions have access under the current auth model.
