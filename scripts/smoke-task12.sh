#!/usr/bin/env bash
# PIPELINE_TASK_12 smoke test — runs against the running 7-container stack.
#   scripts/smoke-task12.sh [base_url]
# Base URL defaults to https://localhost (nginx TLS, self-signed → curl -k).
#
# The /app/* routes sit behind the Next.js proxy guard (src/proxy.ts) which
# requires the `avs_session` cookie (URL-encoded JSON {user:{id,name,email}}).
# We inject a mock session so SSR'd pages render their real content.
set -uo pipefail

BASE="${1:-https://localhost}"
CURL=(curl -sk --noproxy '*')
MAX_WAIT=90   # seconds to wait for all 7 containers to become healthy
PASS=0
FAIL=0

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }

# ---------------------------------------------------------------------------
# Mock session — matches src/lib/auth-session.ts writeSession() format.
# ---------------------------------------------------------------------------
SESSION_JSON='{"user":{"id":"smoke-user","name":"Smoke Test","email":"smoke@test.local","isMock":true},"token":""}'
SESSION_ENC=$(node -e 'process.stdout.write(encodeURIComponent(JSON.stringify(JSON.parse(process.argv[1]))))' "$SESSION_JSON")
AUTH_COOKIE="avs_session=$SESSION_ENC"

# ---------------------------------------------------------------------------
# 1. Wait until all 7 services are healthy (or at least running)
# ---------------------------------------------------------------------------
say "== Waiting for containers =="
for i in $(seq 1 "$MAX_WAIT"); do
  running=$(docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null \
    | awk '$2=="running" {n++} END {print n+0}')
  healthy=$(docker compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null \
    | awk '$2=="healthy" {n++} END {print n+0}')
  if [ "$healthy" = "7" ] && [ "$running" = "7" ]; then
    docker compose ps --format '  {{.Name}}\t{{.Status}}'
    break
  fi
  sleep 3
done

healthy=$(docker compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null | awk '$2=="healthy"' | wc -l | tr -d ' ')
running=$(docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null | awk '$2=="running"' | wc -l | tr -d ' ')
if [ "$healthy" != "7" ] || [ "$running" != "7" ]; then
  bad "not all 7 containers healthy (running=$running healthy=$healthy)"
  docker compose ps
  exit 1
fi
ok "7/7 containers healthy"

# ---------------------------------------------------------------------------
# 2. Route sweep — every route must answer 200
# ---------------------------------------------------------------------------
say "== Route sweep =="
for r in /health / /login; do
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' --max-time 20 "$BASE$r")
  [ "$code" = "200" ] && ok "$code  $r" || bad "$code  $r"
done
# Authenticated app routes (mock session cookie)
for r in /app /app/quick /app/tasks /app/tasks/new /app/products \
         /app/products/new /app/benchmarks /app/benchmarks/new /app/projects \
         /app/templates /app/assets /app/profile /app/settings; do
  code=$("${CURL[@]}" -b "$AUTH_COOKIE" -o /dev/null -w '%{http_code}' --max-time 20 "$BASE$r")
  [ "$code" = "200" ] && ok "$code  $r" || bad "$code  $r"
done
# API routes (X-User-Id header; backend defaults missing identity to 'dev')
for r in /api/products /api/benchmarks /api/assets /api/tasks /api/projects \
         /api/prompts /api/model-configs /api/auth/me; do
  code=$("${CURL[@]}" -H "X-User-Id: smoke-user" -o /dev/null -w '%{http_code}' --max-time 20 "$BASE$r")
  [ "$code" = "200" ] && ok "$code  $r" || bad "$code  $r"
done

# ---------------------------------------------------------------------------
# 3. Markers — key pages must render their signature content
# ---------------------------------------------------------------------------
say "== Content markers =="
check_marker() {
  local route="$1" marker="$2"
  if "${CURL[@]}" -b "$AUTH_COOKIE" --max-time 20 "$BASE$route" | grep -q "$marker"; then
    ok "marker '$marker' on $route"
  else
    bad "missing marker '$marker' on $route"
  fi
}
# SSR renders with the default "en" locale (the client hook switches to zh
# after hydration), so markers match the English SSR output.
check_marker /app             "Today"
check_marker /app/quick       "Quick Generate"
check_marker /app/tasks       "Video Tasks"
check_marker /app/tasks/new   "New Task"
check_marker /app/products    "Products"
check_marker /app/benchmarks  "Benchmarks"
check_marker /app/projects    "Projects"
check_marker /app/templates   "Templates"
check_marker /app/assets      "Assets"
check_marker /app/profile     "Profile"
check_marker /app/settings    "Settings"
check_marker /login           "Log in"

# ---------------------------------------------------------------------------
# 4. API round-trip — create + read a product, benchmark, asset, then delete
# ---------------------------------------------------------------------------
say "== API CRUD round-trip =="
crud() {
  local label="$1" url="$2" body="$3"
  local created
  created=$("${CURL[@]}" -H "X-User-Id: smoke-user" -H "Content-Type: application/json" \
    -X POST -d "$body" --max-time 20 "$BASE$url")
  local id
  id=$(printf '%s' "$created" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.id||"")}catch{console.log("")}})')
  if [ -z "$id" ]; then
    bad "$label create failed: $(printf '%s' "$created" | head -c 160)"
    return
  fi
  local list
  list=$("${CURL[@]}" -H "X-User-Id: smoke-user" --max-time 20 "$BASE$url")
  if printf '%s' "$list" | grep -q "$id"; then
    ok "$label CRUD (created $id, listed)"
  else
    bad "$label create→list round-trip failed"
  fi
  local del
  del=$("${CURL[@]}" -H "X-User-Id: smoke-user" -X DELETE -o /dev/null -w '%{http_code}' \
    --max-time 20 "$BASE$url/$id")
  [ "$del" = "204" ] && ok "$label delete (204)" || bad "$label delete -> $del"
}
crud "product"   "/api/products"    '{"name":"冒烟测试商品","category":"测试","price":99,"commission_rate":30}'
crud "benchmark" "/api/benchmarks"  '{"account":"冒烟账号","title":"冒烟对标视频","duration":30}'
crud "asset"     "/api/assets"      '{"type":"image","name":"冒烟素材","url":"https://example.com/x.png","size":1024}'

# ---------------------------------------------------------------------------
# 5. Web container logs — no uncaught SSR / client errors on the pages
# ---------------------------------------------------------------------------
say "== Web container log scan =="
pos=$(docker logs web 2>&1 | wc -l | tr -d ' ')
for r in /app /app/quick /app/tasks /app/tasks/new /app/products /app/benchmarks /app/projects /app/templates /app/assets /app/profile /app/settings /login; do
  "${CURL[@]}" -b "$AUTH_COOKIE" -o /dev/null --max-time 20 "$BASE$r"
done
sleep 2
tail_=$(docker logs web 2>&1 | tail -n +$((pos+1)))
if echo "$tail_" | grep -iE 'error|unhandled|TypeError|ReferenceError|ECONNREFUSED|Failed to' | grep -vE 'Error: ENOENT|favicon|Download the React DevTools' >/dev/null; then
  bad "web logs contain error lines after page hits:"
  echo "$tail_" | grep -iE 'error|unhandled|TypeError|ReferenceError|ECONNREFUSED|Failed to' | grep -vE 'Error: ENOENT|favicon|Download the React DevTools' | head -15 | sed 's/^/    /'
else
  ok "no error lines in web log delta"
fi

# ---------------------------------------------------------------------------
say ""
printf 'PASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[ "$FAIL" = "0" ] || exit 1
exit 0
