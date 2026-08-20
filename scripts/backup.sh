#!/usr/bin/env bash
# backup.sh — R6 backup for the self-hosted stack.
#
# Backs up:
#   1. PostgreSQL  → ./backups/pg/<ts>.sql.gz   (logical dump; restores anywhere)
#   2. MinIO       → ./backups/minio/<ts>/      (mc mirror of all buckets)
#   3. Redis       → ./backups/redis/<ts>.rdb   (queue/job state, best-effort)
#
# Retention: keep the last 14 backups per type (default; tune KEEP_BACKUPS).
#
# ⚠️ ENC_KEY (BYOK AES master key) is NOT inside the DB dump — back it up
#    separately (e.g. a password manager). Without ENC_KEY the encrypted BYOK
#    columns cannot be decrypted.
#
# Usage: ./scripts/backup.sh   (add to cron, e.g. daily at 03:00)
set -euo pipefail

cd "$(dirname "$0")/.."

# Load env so MINIO_ROOT_USER/PASSWORD come through.
set -a; [[ -f .env ]] && source .env; set +a

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_ROOT/pg" "$BACKUP_ROOT/minio" "$BACKUP_ROOT/redis"

echo "🟢 Backup start: $TS"

# --- 1. PostgreSQL ---
PGUSER="${POSTGRES_USER:-avs}"
PGDB="${POSTGRES_DB:-ai_video_studio}"
echo "📦 Dumping PostgreSQL ($PGDB)…"
docker compose exec -T postgres pg_dump -U "$PGUSER" "$PGDB" \
  | gzip -9 > "$BACKUP_ROOT/pg/$TS.sql.gz"
echo "   → $BACKUP_ROOT/pg/$TS.sql.gz ($(du -h "$BACKUP_ROOT/pg/$TS.sql.gz" | cut -f1))"

# --- 2. MinIO (all buckets) ---
echo "📦 Mirroring MinIO…"
docker compose run --rm --no-deps \
  -e MINIO_ENDPOINT=minio -e MINIO_PORT=9000 \
  -e MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}" \
  -e MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}" \
  -v "$(pwd)/$BACKUP_ROOT/minio:/backup" \
  minio/mc sh -c '
    mc alias set local "http://$MINIO_ENDPOINT:$MINIO_PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1
    mc mirror --overwrite local "/backup/'"$TS"'"
  '
echo "   → $BACKUP_ROOT/minio/$TS/"

# --- 3. Redis (best-effort; queue/job state) ---
if docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD:-}" --no-auth-warning SAVE >/dev/null 2>&1; then
  docker compose cp "redis:/data/dump.rdb" "$BACKUP_ROOT/redis/$TS.rdb" >/dev/null 2>&1 \
    && echo "   → $BACKUP_ROOT/redis/$TS.rdb" \
    || echo "   ⚠️  Redis dump copy failed (skipping, non-fatal)"
else
  echo "   ℹ️  Redis SAVE not available (skipping, non-fatal)"
fi

# --- Retention ---
echo "🧹 Pruning backups older than $KEEP_BACKUPS…"
find "$BACKUP_ROOT/pg"    -name '*.sql.gz' -mtime "+$KEEP_BACKUPS" -delete
find "$BACKUP_ROOT/minio" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_BACKUPS" -exec rm -rf {} +
find "$BACKUP_ROOT/redis" -name '*.rdb'    -mtime "+$KEEP_BACKUPS" -delete

echo "✅ Backup complete."
