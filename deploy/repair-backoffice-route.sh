#!/usr/bin/env bash
# Run on the production host. Repairs only the backoffice frontend vhost.
set -euo pipefail
container=marketbot-api-nginx
domain=backoffice.parscryptoexchange.com
port=8083
# Locate the existing host bind mounts; never assume flat vs release layout.
templates=$(docker inspect "$container" --format '{{range .Mounts}}{{if eq .Destination "/etc/marketbot-nginx/templates"}}{{.Source}}{{end}}{{end}}')
startup=$(docker inspect "$container" --format '{{range .Mounts}}{{if eq .Destination "/etc/marketbot-nginx/start.sh"}}{{.Source}}{{end}}{{end}}')
[[ -d "$templates" && -f "$startup" ]] || { echo 'Cannot locate nginx bind mounts' >&2; exit 1; }
# Do not mask an incorrect build or a stopped listener with another proxy layer.
curl --fail --silent --max-time 10 "http://127.0.0.1:$port/healthz" >/dev/null
if docker exec "$container" nginx -T 2>&1 | grep -Eq "server_name[[:space:]]+$domain[[:space:]]*;"; then
  echo 'An explicit backoffice vhost already exists; inspect it before replacing routing.' >&2
  exit 1
fi
cert="/etc/letsencrypt/live/$domain"
docker exec "$container" test -f "$cert/fullchain.pem" || {
  echo "First issue the certificate for $domain using the existing Certbot webroot workflow." >&2
  exit 1
}
backup=$(mktemp -d "$(dirname "$startup")/backoffice-route-backup.XXXXXX")
cp "$startup" "$backup/start.sh"
route="$templates/backoffice-frontend.conf"
[[ ! -e "$route" ]] || { echo "Route file already exists: $route" >&2; exit 1; }
cat > "$route" <<NGINX
server {
    listen 80;
    server_name $domain;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $domain;
    ssl_certificate $cert/fullchain.pem;
    ssl_certificate_key $cert/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
# Persist the extra vhost through the existing renderer and container restarts.
# Write in place: replacing the inode would leave a single-file bind mount stale.
python3 - "$startup" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]);s=p.read_text()
marker='    } > "$site.tmp"'
if s.count(marker)!=1: raise SystemExit('Unknown nginx renderer; no startup change made')
s=s.replace('/etc/letsencrypt/live/portal.parscryptoexchange.com/fullchain.pem 2>/dev/null', '/etc/letsencrypt/live/portal.parscryptoexchange.com/fullchain.pem /etc/letsencrypt/live/backoffice.parscryptoexchange.com/fullchain.pem 2>/dev/null')
s=s.replace(marker,'        cat "$templates/backoffice-frontend.conf"\n'+marker)
with p.open('w') as out: out.write(s)
PY
# Add the vhost immediately; the renderer also includes it on its next pass.
# If validation fails, restore every changed file before touching live nginx.
if ! docker exec "$container" sh -c 'printf "\ninclude /etc/marketbot-nginx/templates/backoffice-frontend.conf;\n" >> /etc/nginx/conf.d/marketbot.conf; nginx -t'; then
  cat "$backup/start.sh" > "$startup"
  docker exec "$container" sed -i '\|^include /etc/marketbot-nginx/templates/backoffice-frontend.conf;$|d' /etc/nginx/conf.d/marketbot.conf
  rm "$route"
  echo 'Validation failed; restored configuration without reloading nginx' >&2
  exit 1
fi
# Restart so the certificate watcher uses the updated renderer too.
docker restart "$container" >/dev/null
docker exec "$container" nginx -t
# Probe the origin with this hostname, bypassing Cloudflare and browser cache.
curl --fail --silent --show-error --retry 3 --retry-connrefused --max-time 15 --resolve "$domain:443:127.0.0.1" "https://$domain/" >/dev/null
echo "Backoffice frontend route installed: https://$domain -> 127.0.0.1:$port"
echo "Startup backup: $backup/start.sh. Include this route in the next normal ingress deployment."
