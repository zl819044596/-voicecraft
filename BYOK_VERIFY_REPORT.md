# BYOK Key-Management (R1) — Verification Report

**Date:** 2026-08-08 (UTC) · **Host:** macOS (colima/docker 29.5.2) · **Repo:** /Volumes/Data/GitHub/ai-video-studio
**Result: ALL 11 CHECKS PASS** (with two environment notes documented below)

---

## 0. Environment note: HTTP vs HTTPS

nginx is configured (by design, R6) to serve HTTPS on 443 and 301-redirect all
HTTP on port 80 to HTTPS. The host has an HTTPS_PROXY env var set, so curl to
`localhost` must bypass the proxy (`--noproxy '*'`) and use `https://localhost`
with `-k` (self-signed dev cert). The plain-HTTP variant of each curl returns
`301 Moved Permanently` (documented in step 3 below); the HTTPS variants are
the functional equivalent of the requested checks and returned the expected
status codes.

## 1. Docker server version + compose ps (initial)

```
$ docker version --format '{{.Server.Version}}'
29.5.2

$ docker compose ps
NAME                         IMAGE                COMMAND                  SERVICE    CREATED          STATUS                    PORTS
ai-video-studio-api-1        avs/api:stage0       "docker-entrypoint.s…"   api        14 minutes ago   Up 14 minutes (healthy)   4000/tcp
ai-video-studio-minio-1      minio/minio          "/usr/bin/docker-ent…"   minio      14 minutes ago   Up 14 minutes (healthy)   9000/tcp
ai-video-studio-nginx-1      avs/nginx:stage1     "/docker-entrypoint.…"   nginx      28 minutes ago   Up 13 minutes (healthy)   0.0.0.0:80->80/tcp, [::]:80->80/tcp
ai-video-studio-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   14 minutes ago   Up 14 minutes (healthy)   5432/tcp
ai-video-studio-redis-1      redis:7-alpine       "docker-entrypoint.s…"   redis      14 minutes ago   Up 14 minutes (healthy)   6379/tcp
ai-video-studio-render-1     avs/render:stage0    "node worker/index.js"   render     28 minutes ago   Up 28 minutes (healthy)   4001/tcp
ai-video-studio-web-1        avs/web:stage1       "docker-entrypoint.s…"   web        14 minutes ago   Up 14 minutes (healthy)   3000/tcp
```
`.env` present with `ENC_KEY` (grep count = 1). All 7 services up (healthy) before rebuild.

## 2. Rebuild with --build, then compose ps

`docker compose up -d --build` — images rebuilt, containers recreated:

```
#49 [web] resolving provenance for metadata file
#49 DONE 0.0s
 Image avs/render:stage0 Built
 Image avs/api:stage0 Built
 Image avs/web:stage1 Built
 Image avs/nginx:stage1 Built
 Container ai-video-studio-postgres-1 Running
 Container ai-video-studio-redis-1 Running
 Container ai-video-studio-minio-1 Running
 Container ai-video-studio-api-1 Recreate
 Container ai-video-studio-render-1 Recreate
 Container ai-video-studio-render-1 Recreated
 Container ai-video-studio-api-1 Recreated
 Container ai-video-studio-web-1 Recreate
 Container ai-video-studio-web-1 Recreated
 Container ai-video-studio-nginx-1 Recreate
 Container ai-video-studio-nginx-1 Recreated
 Container ai-video-studio-minio-1 Waiting
 Container ai-video-studio-postgres-1 Waiting
 Container ai-video-studio-redis-1 Waiting
 Container ai-video-studio-redis-1 Healthy
 Container ai-video-studio-render-1 Starting
 Container ai-video-studio-postgres-1 Healthy
 Container ai-video-studio-minio-1 Healthy
 Container ai-video-studio-api-1 Starting
 Container ai-video-studio-render-1 Started
 Container ai-video-studio-api-1 Started
 Container ai-video-studio-api-1 Waiting
 Container ai-video-studio-api-1 Healthy
 Container ai-video-studio-web-1 Starting
 Container ai-video-studio-web-1 Started
 Container ai-video-studio-web-1 Healthy
 Container ai-video-studio-nginx-1 Starting
 Container ai-video-studio-nginx-1 Started
EXIT: 0
```

**Issue found & fixed:** after the rebuild, nginx entered a restart loop —
`[emerg] cannot load certificate "/etc/nginx/certs/fullchain.pem"` — even though
`certs/fullchain.pem` + `privkey.pem` existed on the host. Diagnosis: the
`./certs` bind mount was showing a **stale view inside the colima VM** (a
throwaway `nginx:alpine` container mounting the same dir only saw `webroot/`,
not the cert files created after the mount was first established). Fix: `touch`
on `certs/` and the cert files forced colima to resync the bind mount; a
throwaway container then listed all files (`.gitignore`, `PROBE.txt`,
`fullchain.pem`, `privkey.pem`, `webroot/`). Then `docker compose up -d --build nginx`
recreated nginx successfully (one transient container-name Conflict during
recreation, self-resolved by compose). After the fix, all services healthy:

```
$ docker compose ps
NAME                         IMAGE                COMMAND                  SERVICE    CREATED              STATUS                        PORTS
ai-video-studio-api-1        avs/api:stage0       "docker-entrypoint.s…"   api        About a minute ago   Up About a minute (healthy)   4000/tcp
ai-video-studio-minio-1      minio/minio          "/usr/bin/docker-ent…"   minio      29 minutes ago       Up 6 minutes (healthy)        9000/tcp
ai-video-studio-nginx-1      avs/nginx:stage1     "/docker-entrypoint.…"   nginx      About a minute ago   Up 50 seconds (healthy)       0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp
ai-video-studio-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   29 minutes ago       Up 6 minutes (healthy)        5432/tcp
ai-video-studio-redis-1      redis:7-alpine       "docker-entrypoint.s…"   redis      29 minutes ago       Up 6 minutes (healthy)        6379/tcp
ai-video-studio-render-1     avs/render:stage0    "node worker/index.js"   render     About a minute ago   Up About a minute (healthy)   4001/tcp
ai-video-studio-web-1        avs/web:stage1       "docker-entrypoint.s…"   web        About a minute ago   Up 56 seconds (healthy)       3000/tcp
```

## 3. Health check — PASS (200)

Plain HTTP (as literally specified) hits nginx's HTTP→HTTPS 301 by design:
```
$ curl -s -w '\nHTTP %{http_code}\n' localhost/api/health/full
<html>...<title>301 Moved Permanently</title>...</html>
HTTP 301
```
Functional check over HTTPS (equivalent, through nginx):
```
$ curl -sk --noproxy '*' -w '\nHTTP %{http_code}\n' https://localhost/api/health/full
{"status":"ok","service":"api","time":"2026-08-08T07:49:21.253Z","deps":{"postgres":{"ok":true,"detail":"pg (48ms)"},"redis":{"ok":true,"detail":"redis (24ms)"},"minio":{"ok":true,"detail":"minio (25ms)"}}}
HTTP 200
```
postgres / redis / minio all `ok:true`. **PASS.**

## 4. POST test key — PASS (200 {"ok":true})

```
$ curl -sk --noproxy '*' -w '\nHTTP %{http_code}\n' -X POST https://localhost/api/keys -H 'Content-Type: application/json' -d '{"provider":"llm","provider_name":"openai","key":"sk-tes...3456"}'
{"ok":true}
HTTP 200
```

## 5. GET keys — masked value, plaintext ABSENT — PASS

```
$ curl -sk --noproxy '*' -w '\nHTTP %{http_code}\n' https://localhost/api/keys
{"keys":[{"provider":"i2v","has_key":false},{"provider":"image","has_key":false},{"provider":"llm","provider_name":"openai","masked":"sk-…3456","has_key":true,"base_url":null,"created_at":"2026-08-08T07:49:45.534Z"},{"provider":"tts","has_key":false}]}
HTTP 200

$ echo "$BODY" | grep -c 'sk-tes\.\.\.3456'
0
plaintext ABSENT (grep count 0)
```
Masked value `sk-…3456` shown; full plaintext `sk-tes...3456` not in body. **PASS.**

## 6. DB ciphertext — base64, no plaintext — PASS

```
$ docker compose exec -T postgres psql -U avs -d ai_video_studio -c "SELECT provider_name, key_ciphertext, key_salt FROM api_keys;"
 provider_name |                      key_ciphertext                      |             key_salt
---------------+----------------------------------------------------------+----------------------------------
 openai        | aIpk529hnpCipKCixwSKkrvlXhOjzNcsV2sRDlmtXMVsU8ECEG16btA= | 368420fa5a1894d06d7b6b0f8c9cd265
(1 row)

$ ... | grep -c 'sk-tes\.\.\.3456'
0
plaintext ABSENT from DB row (count 0)
```
`key_ciphertext` is base64 (trailing `=`), `key_salt` is hex — at-rest encryption
working. **PASS.**

## 7. DELETE key — PASS (204, has_key flips to false)

```
$ curl -sk --noproxy '*' -o /dev/null -w 'HTTP %{http_code}\n' -X DELETE https://localhost/api/keys/openai
HTTP 204

$ curl -sk --noproxy '*' https://localhost/api/keys
{"keys":[{"provider":"i2v","has_key":false},{"provider":"image","has_key":false},{"provider":"llm","has_key":false},{"provider":"tts","has_key":false}]}
```
After DELETE, the `llm` entry no longer shows `has_key:true`. **PASS.**

## 8. /settings page — PASS (200)

```
$ curl -sk --noproxy '*' -o /dev/null -w 'HTTP %{http_code}\n' https://localhost/settings
HTTP 200
```

## 9. No plaintext in logs — PASS (0 / 0)

```
$ docker compose logs api 2>&1 | grep -c 'sk-tes\.\.\.3456'
0
$ docker compose logs nginx 2>&1 | grep -c 'sk-tes\.\.\.3456'
0
```
No key material leaked to api or nginx logs. **PASS.**

## 10. Malformed POST — PASS (400, key not echoed)

```
$ curl -sk --noproxy '*' -w '\nHTTP %{http_code}\n' -X POST https://localhost/api/keys -H 'Content-Type: application/json' -d '{"provider":"bogus","provider_name":"x","key":"abc"}'
{"error":"invalid provider"}
HTTP 400

$ ... | grep -c 'abc'
0
key NOT echoed (count 0)
```
Error message `invalid provider` does NOT echo the submitted key. **PASS.**

## 11. Git status — BYOK files tracked

```
$ git status --short
 M DEPLOYMENT.md
 M api/package.json
 M api/src/index.js
 M api/src/providers/llm.js
 M api/src/queue.js
 M api/src/routes/projects.js
 M api/src/routes/tasks.js
 M api/src/steps/lib.js
 M api/src/steps/s1.js
 M api/src/steps/s2.js
 M api/src/steps/s3.js
 M api/src/steps/s9.js
 M docker-compose.yml
 M render/worker/index.js
 M render/worker/package-lock.json
 M render/worker/package.json
 M src/app/app/projects/[id]/page.tsx
 M src/components/app-ui.tsx
 M src/lib/app-data.ts
?? api/src/helpers.js
?? api/src/storage.js
?? render/.dockerignore

Per-file check (git ls-files):
TRACKED: api/src/routes/keys.js
TRACKED: api/src/crypto.js
TRACKED: src/app/settings/page.tsx
TRACKED: docker-compose.yml
TRACKED: nginx/nginx.conf
TRACKED: api/src/index.js
```
All six BYOK files are **tracked** in git. `docker-compose.yml` and
`api/src/index.js` show as modified (M) — i.e. tracked with local changes;
`keys.js`, `crypto.js`, `settings/page.tsx`, `nginx/nginx.conf` are tracked and
committed with no working-tree changes (hence not listed in `git status --short`).

---

## Summary

| # | Check | Result |
|---|-------|--------|
| 1 | docker 29.5.2, all services up/healthy | PASS |
| 2 | rebuild `--build` + ps all healthy | PASS (nginx cert mount fixed) |
| 3 | /api/health/full → 200, pg/redis/minio ok | PASS (HTTPS; HTTP 301 by design) |
| 4 | POST key → 200 {"ok":true} | PASS |
| 5 | GET keys → masked `sk-…3456`, no plaintext | PASS |
| 6 | DB ciphertext base64 + salt, no plaintext | PASS |
| 7 | DELETE → 204, has_key:false after | PASS |
| 8 | /settings → 200 | PASS |
| 9 | logs api/nginx plaintext count = 0 | PASS |
| 10 | malformed POST → 400, no key echo | PASS |
| 11 | all 6 BYOK files tracked | PASS |

**Issues encountered & fixed:**
1. nginx crash-loop after rebuild — colima bind mount of `./certs` was stale
   (newly created cert files invisible to the VM). Fixed by `touch`ing the certs
   dir/files to force a resync, then recreating nginx. No code change required.
2. Local HTTPS_PROXY env var intercepted `localhost` curls — used
   `--noproxy '*'` (documented, not an app defect).

All containers left running and healthy at completion.
