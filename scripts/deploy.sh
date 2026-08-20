#!/usr/bin/env bash
# deploy.sh — build, start and verify the full stack (one command).
#
#   ./scripts/deploy.sh            # local/dev (self-signed certs)
#   DOMAIN=... ./scripts/deploy.sh # production after issue-cert.sh
#
# Steps: env check → ensure certs → build → up → verify (HTTP→HTTPS, TLS,
# /health, /api/health, headers). Exits non-zero if verification fails.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- 1. .env guard ---
if [[ ! -f .env ]]; then
  echo "ℹ️  No .env — copying from .env.example. Set real secrets before prod!"
  cp .env.example .env
fi

# --- 2. Certs (self-signed if none; real if issued) ---
./scripts/ensure-certs.sh

# --- 3. Build (must --build — stale images cause silent runtime breakage) ---
echo "🔨 Building images…"
docker compose build

# --- 4. Up ---
echo "🚀 Starting stack…"
docker compose up -d

# --- 5. Wait for health ---
echo "⏳ Waiting for nginx to become healthy…"
for i in $(seq 1 20); do
  st="$(docker inspect -f '{{.State.Health.Status}}' ai-video-studio-nginx-1 2>/dev/null || echo starting)"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
echo "   nginx health: $st"

# --- 6. Verify ---
echo "🧪 Verifying…"
HTTP_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 http://localhost/ || true)
HTTPS_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 https://localhost/ || true)
API_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 https://localhost/api/health || true)
HSTS=$(curl -sk -D- -o /dev/null --max-time 8 https://localhost/ 2>/dev/null | grep -i strict-transport-security | tr -d '\r' || echo "missing")

echo "   http://localhost/        → $HTTP_CODE  (expect 301)"
echo "   https://localhost/       → $HTTPS_CODE (expect 200)"
echo "   https://localhost/api/health → $API_CODE (expect 200)"
echo "   HSTS header              → ${HSTS:-missing}"

if [[ "$HTTPS_CODE" != "200" || "$API_CODE" != "200" ]]; then
  echo "❌ Verification failed. Run: docker compose logs --tail=50 nginx web api" >&2
  exit 1
fi
echo "✅ Stack is up and HTTPS is serving. (LAN: https://$(ipconfig getifaddr en0 2>/dev/null || echo '<your-ip>')/ — self-signed, so browsers warn; production certs remove that.)"
