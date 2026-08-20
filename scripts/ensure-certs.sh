#!/usr/bin/env bash
# ensure-certs.sh — guarantee nginx has certs so it can boot.
#
# If real Let's Encrypt certs already exist in ./certs (fullchain.pem +
# privkey.pem), this does nothing. Otherwise it generates a self-signed pair
# (10y) so local/dev HTTPS works end-to-end. Run before `docker compose up`
# the first time. Production: use scripts/issue-cert.sh to fetch real certs.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

CERTS_DIR="${CERTS_DIR:-./certs}"
mkdir -p "$CERTS_DIR" "$CERTS_DIR/webroot"

if [[ -f "$CERTS_DIR/fullchain.pem" && -f "$CERTS_DIR/privkey.pem" ]]; then
  echo "✅ Certs already present in $CERTS_DIR — nothing to do."
  exit 0
fi

echo "⚠️  No certs found — generating a SELF-SIGNED dev pair (local HTTPS only)."
echo "   For production run: DOMAIN=... ACME_EMAIL=... ./scripts/issue-cert.sh"
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout "$CERTS_DIR/privkey.pem" \
  -out "$CERTS_DIR/fullchain.pem" \
  -subj "/CN=localhost" >/dev/null 2>&1

# webroot just needs to exist (ACME placeholder)
touch "$CERTS_DIR/webroot/.gitkeep"
echo "✅ Wrote $CERTS_DIR/fullchain.pem + $CERTS_DIR/privkey.pem (self-signed)."
