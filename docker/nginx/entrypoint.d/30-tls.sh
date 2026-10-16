#!/bin/sh
# Runs after the stock 20-envsubst-on-templates.sh. Keeps the HTTPS server block only when
# a certificate pair is mounted at /etc/nginx/certs/{fullchain,privkey}.pem.
set -e
TLS_CONF=/etc/nginx/conf.d/tls.conf
if [ -r /etc/nginx/certs/fullchain.pem ] && [ -r /etc/nginx/certs/privkey.pem ]; then
    echo "daisycal: TLS certificates found, serving HTTPS on 443 and redirecting HTTP"
    # Replace the HTTP server's app include with a redirect to HTTPS.
    cat > /etc/nginx/conf.d/default.conf <<'CONF'
server {
    listen 80;
    listen [::]:80;
    server_name _;
    location = /healthz { access_log off; add_header Content-Type text/plain; return 200 "ok\n"; }
    location / { return 301 https://$host$request_uri; }
}
CONF
else
    echo "daisycal: no TLS certificates at /etc/nginx/certs, serving plain HTTP on 80 only"
    rm -f "$TLS_CONF"
fi
