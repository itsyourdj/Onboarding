#!/bin/sh
set -e

# Ingest CSVs only for the local Postgres data source. In production the app
# reads from the semantic layer (DATA_SOURCE=semantic) and there is no database,
# so this step is skipped entirely.
if [ "${DATA_SOURCE:-postgres}" = "postgres" ]; then
  if [ -z "${DATA_DIR:-}" ]; then
    echo "[entrypoint] ERROR: DATA_SOURCE=postgres requires DATA_DIR to be set."
    exit 1
  fi
  echo "[entrypoint] DATA_SOURCE=postgres -> ingesting CSVs from ${DATA_DIR:-<unset>}"
  npm run load
else
  if [ -z "${SEMANTIC_API_URL:-}" ] || [ -z "${SEMANTIC_API_TOKEN:-}" ]; then
    echo "[entrypoint] ERROR: DATA_SOURCE=semantic requires SEMANTIC_API_URL and SEMANTIC_API_TOKEN."
    exit 1
  fi
  echo "[entrypoint] DATA_SOURCE=${DATA_SOURCE:-semantic} -> skipping CSV ingestion"
fi

echo "[entrypoint] starting Pulse on port ${PORT:-4000} (base: ${BASE_PATH:-/})"
exec npm start
