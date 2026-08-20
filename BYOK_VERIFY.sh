#!/usr/bin/env bash
# BYOK R1 verification — run by the scheduler's (healthy) shell.
set -u
REPO=/Volumes/Data/GitHub/ai-video-studio
REPORT=$REPO/BYOK_VERIFY_REPORT.md
cd "$REPO" || exit 9

{
echo "# BYOK R1 Verification Report ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
echo
echo '## 0. Tooling'
docker version --format 'server={{.Server.Version}}' 2>&1
docker compose ps --format 'table {{.Name}}\t{{.Status}}' 2>&1

echo
echo '## 0.5 .env / ENC_KEY present?'
if [ -f .env ] && grep -q '^ENC_KEY=' .env; then
  echo "OK: .env exists and has ENC_KEY set"
else
  echo "MISSING: .env or ENC_KEY — copying .env.example to .env"
  cp .env.example .env
fi

echo
echo '## 1. Rebuild (docker compose up -d --build)'
docker compose up -d --build 2>&1 | tail -40
echo "--- wait for health ---"
sleep 25
docker compose ps --format 'table {{.Name}}\t{{.Status}}' 2>&1

echo
echo '## 2. /api/health/full'
curl -s -w '\nHTTP %{http_code}\n' localhost/api/health/full

echo
echo '## 3. POST /api/keys'
curl -s -w '\nHTTP %{http_code}\n' -X POST localhost/api/keys -H 'Content-Type: application/json' \
  -d '{"provider":"llm","provider_name":"openai","key":"sk-testBYOK-abcdef123456"}'

echo
echo '## 4. GET /api/keys (masked, must NOT contain plaintext)'
BODY=$(curl -s localhost/api/keys)
echo "$BODY"
if echo "$BODY" | grep -q 'sk-testBYOK-abcdef123456'; then
  echo '!!! PLAINTEXT LEAKED in GET response !!!'
else
  echo 'OK: plaintext NOT present in GET response'
fi

echo
echo '## 5. DB ciphertext check'
docker compose exec -T postgres psql -U avs -d ai_video_studio -c \
  "SELECT provider_name, key_ciphertext, key_salt FROM api_keys;" 2>&1
DBROW=$(docker compose exec -T postgres psql -U avs -d ai_video_studio -t -A -c \
  "SELECT key_ciphertext FROM api_keys WHERE provider_name='openai';" 2>/dev/null)
if echo "$DBROW" | grep -q 'sk-testBYOK-abcdef123456'; then
  echo '!!! PLAINTEXT STORED IN DB !!!'
else
  echo "OK: DB stores ciphertext (plaintext absent from row)"
fi

echo
echo '## 6. DELETE /api/keys/openai'
curl -s -o /dev/null -w 'DELETE HTTP %{http_code}\n' -X DELETE localhost/api/keys/openai
echo '-- after delete, GET:'
curl -s localhost/api/keys | python3 -c 'import sys,json; d=json.load(sys.stdin); print([k for k in d["keys"] if k["provider"]=="llm"])' 2>&1

echo
echo '## 7. /settings page'
curl -s -o /dev/null -w 'settings HTTP %{http_code}\n' localhost/settings

echo
echo '## 8. No-plaintext in logs'
echo '-- api logs grep sk-testBYOK:'
docker compose logs api 2>&1 | grep -c 'sk-testBYOK-abcdef123456' || echo '0 (clean)'
echo '-- nginx logs grep sk-testBYOK:'
docker compose logs nginx 2>&1 | grep -c 'sk-testBYOK-abcdef123456' || echo '0 (clean)'

echo
echo '## 9. Malformed POST → 400'
curl -s -w '\nHTTP %{http_code}\n' -X POST localhost/api/keys -H 'Content-Type: application/json' \
  -d '{"provider":"bogus","provider_name":"x","key":"abc"}'

echo
echo '## 10. git status (BYOK files committed?)'
git status --short 2>&1 | head -40

echo
echo '## DONE'
} > "$REPORT" 2>&1

echo "report written: $REPORT"
