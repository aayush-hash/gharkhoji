#!/bin/bash
# Automatic database backups. Runs in the "backup" container (see docker-compose.yml).
#
#  - Takes a backup when it starts, then every BACKUP_EVERY_HOURS hours.
#  - Keeps BACKUP_KEEP_DAYS days of backups in ./backups on your computer/server, deletes older ones.
#  - Each file is checked after writing; a broken backup is deleted, never kept as "good".
#
# Restore: see backend/scripts/restore.sh
set -u
EVERY_HOURS="${BACKUP_EVERY_HOURS:-24}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups
umask 077   # backups contain personal data: readable only by the owner

mkdir -p "$DIR"
echo "Backups: every ${EVERY_HOURS}h, keeping ${KEEP_DAYS} days, into ${DIR}"

until pg_isready -q; do sleep 2; done

while true; do
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  file="$DIR/gharkhoji-$stamp.dump"
  # -Fc = compressed custom format (restore with pg_restore)
  if pg_dump -Fc --no-owner -f "$file.partial" && pg_restore --list "$file.partial" > /dev/null; then
    mv "$file.partial" "$file"
    echo "$(date -u +%FT%TZ) ✅ backup $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    echo "$(date -u +%FT%TZ) ❌ BACKUP FAILED" >&2
  fi
  find "$DIR" -name 'gharkhoji-*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/deleted old backup: /'
  sleep $(( EVERY_HOURS * 3600 ))
done
