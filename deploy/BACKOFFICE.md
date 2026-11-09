# Customer operations panel

`backoffice.parscryptoexchange.com` is a separate deployment of this repository.
It retains the current layout, controls, themes and English/Persian catalogues.
The default build is the trading dashboard; `VITE_PANEL=backoffice` selects the
customer operations routes, sidebar, branding and API base at build time.

## Pages and API

The operations API lives in marketbot-api at `/backoffice/v1/operations`.
Deploy the API changes before deploying this panel. Existing services and data
are reused; this change requires no new database migration. Existing migrations
and the Miniapp-owned auction/P2P/withdrawal tables must already be initialized.
Missing optional record modules answer 503 with an explicit error.

| Page | Function |
| --- | --- |
| `/customers` | Existing profile, status, wallets, bank accounts and audit controls |
| `/withdrawals` | Existing bank and crypto withdrawal review controls |
| `/bank-accounts` | Global active bank account list; edit/archive through customer profile |
| `/deposits` | Crypto deposit list |
| `/payments` | Fiat payment/deposit list |
| `/ledger` | Global wallet entries with exact decimal strings |
| `/auctions` | Auction orders, including partial fills; read-only |
| `/p2p` | Existing peer-to-peer payment review and resolution |
| `/admins` | Existing admin management |

Record lists support user ID, applicable status/kind and asset/symbol filters,
manual refresh and pagination. Deposits and ledger entries are read-only: their
financial transitions continue to belong to existing settlement services.
Auction cancellation or other new auction mutations are not included.

The default trading build no longer exposes customer or withdrawal routes/menu
items. The API's original endpoints remain for compatibility during rollout.
The operations module does not register bot/provider/manual trading routes,
and the backoffice container rejects the legacy `/backoffice/v1/*` API outside
its operations namespace.

Both panels use existing admin accounts/permissions and the same auth store.
Cookies are host-only, HttpOnly and SameSite=Strict, with the existing
`/backoffice/v1` path, which covers the new namespace. Operators sign in on each
host. This is a separate panel and API surface, not a separate database, backend
process or role system. Existing admin password resets/session revocation apply
to both panels.

## Local development

```sh
npm run dev:backoffice # http://localhost:5174
npm run build:backoffice # dist-backoffice/
```

The Vite proxy uses `API_PROXY_TARGET` as before. Use a separate browser profile
if testing both panels on localhost with separate logins: cookies do not isolate
ports. Do not set the trading dashboard's `VITE_API_BASE` when building backoffice;
it overrides the namespace default.

## Production

1. Deploy the matching marketbot-api revision.
2. Confirm loopback port 8083 is free, then run:

   ```sh
   docker compose -p pars-backoffice -f docker-compose.backoffice.yml up -d --build
   curl --fail http://127.0.0.1:8083/healthz
   ```

3. Point the `backoffice.parscryptoexchange.com` DNS A record at the host. Add AAAA
   only if IPv6 is served there. Provision its TLS certificate through the
   existing host certificate workflow.
4. Install `deploy/backoffice.public.nginx.conf` in the host nginx configuration.
   Adjust the certificate paths and upstream port if needed, then run
   `nginx -t` and reload nginx through the existing service manager.
5. Verify HTTPS login and `/backoffice/v1/operations/auth/me`; verify the old
   `/backoffice/v1/users` endpoint returns 404 on this domain. Check customer,
   bank, ledger and withdrawal pages with an admin session before retiring the
   old dashboard deployment.
6. Rebuild/redeploy the default trading dashboard to remove its old menu/routes.

`BACKOFFICE_PORT` and `API_PORT` may be supplied via the shell or Compose dotenv.
Update the public proxy when changing the port. The existing trading CI/deploy
workflow is unchanged; this panel currently uses the explicit Compose command
above. DNS, certificates and production deployment are not performed by the code
changes in this repository.
