#!/usr/bin/env bash
# issue-cert.sh — obtain a real Let's Encrypt cert (HTTP-01, webroot) and
# install it for nginx.
#
# Prereqs (R6 / see DEPLOYMENT.md):
#   1. Domain resolves to this host's public IP (A/AAAA record), and port 80
#      is reachable from the internet (Let's Encrypt validates via HTTP-01).
#   2. nginx is already up (it serves /.well-known/acme-challenge/).
#   3. DOMAIN and ACME_EMAIL are set (in .env or exported).
#
# Usage:
#   DOMAIN=makeavideo.app ACME_EMAIL=you@example.com ./scripts/issue-cert.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${DOMAIN:-${DOMAIN_ENV:-}}"
DOMAIN="${DOMAIN:-$(grep -E '^DOMAIN=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)}"
EMAIL="${ACME_EMAIL:-$(grep -E '^ACME_EMAIL=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)}"

if [[ -z "${DOMAIN:-}" ]]; then
  echo "❌ DOMAIN is not set. Export it or add DOMAIN=... to .env." >&2
  exit 1
fi
if [[ -z "${EMAIL:-}" ]]; then
  echo "❌ ACME_EMAIL is not set. Export it or add ACME_EMAIL=... to .env." >&2
  exit 1
fi

CERTS_DIR="./certs"
mkdir -p "$CERTS_DIR/live" "$CERTS_DIR/archive" "$CERTS_DIR/renewal" "$CERTS_DIR/webroot"

echo "🔐 Requesting Let's Encrypt cert for $DOMAIN (mail: $EMAIL)…"
docker compose --profile certbot run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos --no-eff-email \
  --non-interactive

# Install the freshly issued cert where nginx reads it.
echo "📦 Installing cert for nginx…"
cp "$CERTS_DIR/live/$DOMAIN/fullchain.pem" "$CERTS_DIR/fullchain.pem"
cp "$CERTS_DIR/live/$DOMAIN/privkey.pem" "$CERTS_DIR/privkey.pem"

# Reload nginx so it picks up the new certs (mount is live; no restart needed).
docker compose exec nginx nginx -s reload

echo "✅ Cert installed and nginx reloaded. HTTPS is live at https://$DOMAIN"
echo "   Renew ~60 days before expiry (see scripts/renew-cert.sh)."