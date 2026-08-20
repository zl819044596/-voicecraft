#!/usr/bin/env bash
# renew-cert.sh — renew the Let's Encrypt cert, reinstall for nginx, reload.
# Safe to run on a cron (e.g. weekly). Uses the DOMAIN from .env.
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${DOMAIN:-$(grep -E '^DOMAIN=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)}"
if [[ -z "${DOMAIN:-}" ]]; then
  echo "❌ DOMAIN not set (add DOMAIN=... to .env)." >&2
  exit 1
fi

echo "🔄 Renewing cert for $DOMAIN…"
docker compose --profile certbot run --rm certbot renew --non-interactive

# Reinstall + reload only if the cert files changed (renewal happened).
if [[ -f "./certs/live/$DOMAIN/fullchain.pem" ]]; then
  cp "./certs/live/$DOMAIN/fullchain.pem" ./certs/fullchain.pem
  cp "./certs/live/$DOMAIN/privkey.pem"  ./certs/privkey.pem
  docker compose exec nginx nginx -s reload
  echo "✅ Renewal complete, nginx reloaded."
else
  echo "ℹ️  No renewal needed this run."
fi
