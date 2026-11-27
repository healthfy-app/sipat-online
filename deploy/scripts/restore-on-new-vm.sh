#!/usr/bin/env bash
# Moving to another VM: loads a backup from R2 into the database of THIS VM, which must be
# empty (a new VM). It refuses a database that already has the tables of the app, so it never
# overwrites live data.
#
# deploy-vm.sh runs it when the deploy is started with RESTORE_BACKUP, after Postgres starts
# and before db-init and the API. db-init then applies the migrations newer than the backup.
#
# Usage: restore-on-new-vm.sh <latest | sipat-online-YYYYMMDD-HHMMSS.dump>
# Settings: as in backup-postgres.sh (bucket and R2 key from deploy/.env.production).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <latest | sipat-online-YYYYMMDD-HHMMSS.dump>" >&2
  exit 1
fi
wanted="$1"
if [ "$wanted" != "latest" ] && ! [[ "$wanted" =~ ^sipat-online-[0-9]{8}-[0-9]{6}\.dump$ ]]; then
  echo "The backup must be 'latest' or a name like sipat-online-20261127-030000.dump." >&2
  exit 1
fi

COMPOSE_ARGS="${COMPOSE_ARGS:---env-file deploy/.env.production -f deploy/compose.production.yaml}"
RCLONE="${RCLONE:-rclone}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
# shellcheck source=deploy/scripts/r2-backup-env.sh
. deploy/scripts/r2-backup-env.sh
if [ -z "${R2_BACKUP_BUCKET:-}" ]; then
  echo "R2_BACKUP_BUCKET is not set: there is no backup to restore from." >&2
  exit 1
fi
# shellcheck disable=SC2206 # intentional word splitting of the command settings
compose=(docker compose $COMPOSE_ARGS)
# shellcheck disable=SC2206
rclone_cmd=($RCLONE)
folder="${RCLONE_REMOTE}:${R2_BACKUP_BUCKET}/postgres"

existing="$("${compose[@]}" exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "select count(*) from information_schema.tables where table_schema not in ('"'"'pg_catalog'"'"', '"'"'information_schema'"'"')"')"
if [ "$existing" != "0" ]; then
  echo "This VM's database already has data. Restoring is only done on a new VM; nothing was changed." >&2
  exit 1
fi

if [ "$wanted" = "latest" ]; then
  # the names carry the UTC date and time, so the last one in order is the newest
  wanted="$("${rclone_cmd[@]}" lsf --files-only --include 'sipat-online-*.dump' "$folder" | sort | tail -n 1)"
  if [ -z "$wanted" ]; then
    echo "No backup in $folder." >&2
    exit 1
  fi
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
echo "Downloading $folder/$wanted..."
"${rclone_cmd[@]}" cat "$folder/$wanted" > "$tmp"
if [ ! -s "$tmp" ]; then
  echo "The backup file is empty." >&2
  exit 1
fi

echo "Restoring into the database of this VM..."
"${compose[@]}" exec -T postgres sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$tmp"

"${compose[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F " = "' <<'SQL'
SELECT 'Tenants', count(*) FROM tenancy."Tenants"
UNION ALL SELECT 'learning.LearningProgress', count(*) FROM learning."LearningProgress"
UNION ALL SELECT 'PlatformCourseVideos', count(*) FROM learning."PlatformCourseVideos";
SQL
echo "Restored $wanted."
