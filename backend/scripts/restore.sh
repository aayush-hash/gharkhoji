#!/bin/bash
# Restore a backup INTO the running database. ⚠️ This replaces the current data.
#
#   ls backups/                                                 # pick a file
#   docker compose exec backup bash /restore.sh gharkhoji-20260925-020000.dump
#   docker compose restart api worker
set -eu
name="${1:?Usage: restore.sh <backup file name from ./backups>}"
file="/backups/$(basename "$name")"
[ -f "$file" ] || { echo "No such backup: $file"; exit 1; }

read -r -p "This REPLACES all current GharKhoji data with $file. Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

# Skip the PostGIS extension itself (it's already installed); restore everything else as the app user
list="$(mktemp)"
pg_restore --list "$file" | grep -v -E ' EXTENSION - | COMMENT - EXTENSION |spatial_ref_sys' > "$list"
pg_restore --clean --if-exists --no-owner --role="${APP_DB_USER:-gharkhoji_app}" --use-list="$list" \
  --exit-on-error -d "$PGDATABASE" "$file"
rm -f "$list"
echo "✅ Restored $file. Now run: docker compose restart api worker"
