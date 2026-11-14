#!/usr/bin/env bash
# Encrypted database backup.   DATABASE_URL=... BACKUP_PASSPHRASE=... bash deploy/backup.sh [output-dir]
# Writes jafson-YYYYmmdd-HHMMSS.sql.gz.enc (AES-256, PBKDF2) and a .sha256 next to it. Copy it OFF the server (object storage, another account).
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"; : "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE (store it separately from the backups)}"
out="${1:-.}"; mkdir -p "$out"; f="$out/jafson-$(date -u +%Y%m%d-%H%M%S).sql.gz.enc"
pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" | gzip -9 | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$f"
( cd "$out" && sha256sum "$(basename "$f")" > "$(basename "$f").sha256" )
echo "$f"
