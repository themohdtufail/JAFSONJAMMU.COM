#!/usr/bin/env bash
# Restore an encrypted backup INTO AN EMPTY DATABASE.   TARGET_DATABASE_URL=... BACKUP_PASSPHRASE=... bash deploy/restore.sh backup.sql.gz.enc
# Refuses to touch a database that already has tables, so a typo cannot overwrite live data. Restore to a new database, check it, then switch over.
set -euo pipefail
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"; : "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"; f="${1:?usage: restore.sh <backup file>}"
if [ -f "$f.sha256" ]; then ( cd "$(dirname "$f")" && sha256sum -c "$(basename "$f").sha256" >/dev/null ) || { echo "Checksum mismatch: backup is damaged" >&2; exit 1; }; fi
n=$(psql "$TARGET_DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
[ "$n" = "0" ] || { echo "Target database is not empty ($n tables). Create a new empty database and restore there." >&2; exit 1; }
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$f" | gunzip | psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -q
echo "Restored. Tables: $(psql "$TARGET_DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
