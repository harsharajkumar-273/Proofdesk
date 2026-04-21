#!/bin/sh
set -e

DOMAIN="proofdesk.duckdns.org"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

# Generate a temporary self-signed cert so nginx can start before Let's Encrypt certs exist.
# Certbot (running on the host after the stack starts) will replace this with a real cert
# and send nginx a reload signal.
if [ ! -f "${CERT_DIR}/fullchain.pem" ]; then
    echo "[entrypoint] No TLS cert found — generating self-signed placeholder for ${DOMAIN}"
    mkdir -p "${CERT_DIR}"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "${CERT_DIR}/privkey.pem" \
        -out  "${CERT_DIR}/fullchain.pem" \
        -subj "/CN=${DOMAIN}" 2>/dev/null
    echo "[entrypoint] Placeholder cert written. Certbot will replace it after first deploy."
fi

exec nginx -g "daemon off;"
