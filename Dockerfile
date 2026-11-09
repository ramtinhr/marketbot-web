FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty means same-origin /backoffice/v1, proxied by the nginx below.
ARG VITE_PANEL=trading
ENV VITE_PANEL=${VITE_PANEL}
ARG VITE_API_BASE=
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build && \
    if [ "$VITE_PANEL" = "backoffice" ]; then cp deploy/backoffice.nginx.conf.template deploy/panel-nginx.conf.template; else cp deploy/nginx.conf.template deploy/panel-nginx.conf.template; fi

FROM nginx:1.28-alpine
# The official image renders /etc/nginx/templates/*.template with envsubst at
# start, substituting only variables that are set - nginx's own $host etc. stay.
ENV API_UPSTREAM=http://127.0.0.1:8080 \
    WEB_HOST=0.0.0.0 \
    WEB_PORT=80
COPY --from=build /app/deploy/panel-nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null || exit 1
