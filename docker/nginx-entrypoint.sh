#!/bin/sh
set -e

# Use DOMAIN from env, or fallback to the default
DOMAIN="${DOMAIN:-proofdesk.duckdns.org}"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

echo "[entrypoint] Using domain: ${DOMAIN}"

# Replace the hardcoded domain in the nginx config
# We use a temp file to avoid issues with sed in-place on some systems
sed "s/proofdesk.duckdns.org/${DOMAIN}/g" /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf

# Generate a temporary self-signed cert so nginx can start before Let's Encrypt certs exist.
if [ ! -f "${CERT_DIR}/fullchain.pem" ]; then
    echo "[entrypoint] No TLS cert found — generating self-signed placeholder for ${DOMAIN}"
    mkdir -p "${CERT_DIR}"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "${CERT_DIR}/privkey.pem" \
        -out  "${CERT_DIR}/fullchain.pem" \
        -subj "/CN=${DOMAIN}" 2>/dev/null
    echo "[entrypoint] Placeholder cert written."
fi

exec nginx -g "daemon off;"
