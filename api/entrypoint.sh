#!/bin/sh
# api container entrypoint — apply the canonical schema, then start the server.
# The 19-table schema.sql is the SINGLE schema source; the runtime never
# auto-creates tables (no ensureSchema divergence). On a fresh volume the
# migration builds every table; on an existing volume it is a no-op.
set -e

echo "[entrypoint] applying migrations (api/db/schema.sql)"
node db/migrate.js

echo "[entrypoint] starting api"
exec node dist/index.js
