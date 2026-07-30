#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node dist/db/migrate.js

if [ "$RUN_SEED_ON_BOOT" = "true" ]; then
  echo "[entrypoint] Seeding database (idempotent)..."
  node dist/db/seed.js
fi

echo "[entrypoint] Starting server..."
exec node dist/server.js
