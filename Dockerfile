# syntax=docker/dockerfile:1
# Production image for https://daisycal.home: builds the SPA, then serves it with nginx
# which also reverse-proxies /dav/ to Radicale (same origin, no CORS).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps: see README (npm 10.9 bug resolving the ESLint 10 peer set).
RUN npm ci --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Runtime configuration (envsubst is applied to /etc/nginx/templates at startup):
#   RADICALE_UPSTREAM   full URL of Radicale, e.g. https://calendar.home
#   RADICALE_USER       Radicale account the app uses (no login screen; nginx adds Basic auth)
#   RADICALE_PASSWORD   its password
#   DAV_BASE            path prefix the SPA uses (must match VITE_DAV_BASE at build), default /dav
#   RADICALE_SSL_VERIFY on|off – verify the upstream TLS certificate (default off, for self-signed .home certs)
#   RADICALE_CA_FILE    CA bundle used when RADICALE_SSL_VERIFY=on; mount your CA over the default
#   NGINX_RESOLVER      DNS resolver used to look up the upstream at request time (default Docker's 127.0.0.11)
ENV RADICALE_UPSTREAM=https://calendar.home \
    RADICALE_USER="" \
    RADICALE_PASSWORD="" \
    DAV_BASE=/dav \
    RADICALE_SSL_VERIFY=off \
    RADICALE_CA_FILE=/etc/nginx/radicale-ca.pem \
    NGINX_RESOLVER=127.0.0.11 \
    NGINX_ENVSUBST_FILTER='^(RADICALE_|DAV_|NGINX_RESOLVER)'

RUN rm /etc/nginx/conf.d/default.conf \
    && cp /etc/ssl/certs/ca-certificates.crt /etc/nginx/radicale-ca.pem
COPY docker/nginx/templates/ /etc/nginx/templates/
COPY docker/nginx/entrypoint.d/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/*.sh /docker-entrypoint.d/*.envsh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
