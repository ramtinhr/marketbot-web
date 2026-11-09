# Customer operations panel

`backoffice.parscryptoexchange.com` is a separate deployment of this repository.
It retains the current layout, controls, themes and English/Persian catalogues.
The default build is the trading dashboard; `VITE_PANEL=backoffice` selects the
customer operations routes, sidebar, branding at build time. Both panels use the same `/backoffice/v1` API.

## Pages and API

Both panels use the existing admin API at `/backoffice/v1`, with the same
login endpoints, admin accounts and financial services. There is no separate
operations prefix. Additional global record lists are served under
`/backoffice/v1/records/{resource}` in that same authenticated API.

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

The default trading build no longer exposes customer or withdrawal UI routes.
The split is frontend navigation and deployment; backend authentication and API
routes are shared. Cookies remain host-only, HttpOnly and SameSite=Strict, so
operators use the same credentials when signing in on each domain.

## Local development

```sh
npm run dev:backoffice # http://localhost:5174
npm run build:backoffice # dist-backoffice/
```

The Vite proxy uses `API_PROXY_TARGET` as before. Use a separate browser profile
if testing both panels on localhost with separate logins: cookies do not isolate
ports. Both builds default to the same API base; `VITE_API_BASE` remains an optional build-time override.

## Production

1. Deploy the matching marketbot-api revision.
2. Confirm loopback port 8083 is free. Run this repository's **Deploy** workflow
   with `delivery=source` on the updated commit. The release now builds both
   variants with explicit `VITE_PANEL` arguments and activates `web` (8081) and
   `backoffice` (8083) together under the existing `current` release.
   Set `BACKOFFICE_PORT=8083` in `WEB_ENV` if specifying ports explicitly.
   From the deployed web `current` directory, check:

   ```sh
   docker compose ps
   curl --fail http://127.0.0.1:8083/healthz
   ```

3. Point the `backoffice.parscryptoexchange.com` DNS A record at the host.
   In Cloudflare, use DNS-only while issuing the first certificate. Keep
   public port 80 reachable for the HTTP challenge.
4. The API's existing Docker nginx ingress now includes this hostname. Set
   `BACKOFFICE_DOMAIN=backoffice.parscryptoexchange.com` and `BACKOFFICE_PORT=8083`
   in its `API_ENV` deployment secret (these are also the defaults), then deploy
   the API release to ship the updated nginx templates and Compose settings.
   Before the certificate exists, this host serves the ACME challenge and
   returns 503 for other requests. From the deployed API's `current` directory:

   ```sh
   docker compose run --rm --entrypoint certbot certbot certonly \
     --webroot -w /var/www/certbot \
     -d backoffice.parscryptoexchange.com
   docker compose restart nginx
   docker compose exec -T nginx nginx -t
   ```

   Certbot prompts for registration details if this installation has no account.
   The existing Certbot service renews the certificate; nginx detects certificate
   changes within five minutes. Restarting nginx above activates the initial
   certificate immediately. Once HTTPS works, Cloudflare proxying may be enabled
   using Full (strict) SSL mode. Do not install the standalone
   `backoffice.public.nginx.conf` in this Docker ingress: it is an alternative
   only for hosts managed through system nginx.
5. Verify HTTPS login and `/backoffice/v1/auth/me`; verify `/backoffice/v1/users` uses the existing admin session. Check customer,
   bank, ledger and withdrawal pages with an admin session before retiring the
   old dashboard deployment.
6. Rebuild/redeploy the default trading dashboard to remove its old menu/routes.

`BACKOFFICE_PORT` and `API_PORT` may be supplied via the shell or Compose dotenv.
Update the public proxy when changing the port. The CI image matrix also builds both variants for the optional image delivery
mode. Source delivery builds both on the server from the selected commit. DNS, certificates and production deployment are not performed by the code
changes in this repository.
