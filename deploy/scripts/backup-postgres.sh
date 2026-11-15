#!/usr/bin/env bash
# Daily off-site backup of the SIPAT Online database to Cloudflare R2.
#
# Writes r2:<bucket>/postgres/sipat-online-YYYYMMDD-HHMMSS.dump and deletes the
# backups of that folder older than 30 days. Run from the systemd timer
# (deploy/systemd/sipat-backup.timer) or by hand on the VM.
#
# Settings (environment variables, all optional except the bucket):
#   R2_BACKUP_BUCKET  bucket of the backups. If unset, read from deploy/.env.production.
#   COMPOSE_ARGS      arguments for `docker compose`, to point at another stack.
#                     Default: --env-file deploy/.env.production -f deploy/compose.production.yaml
#   RCLONE            rclone command. Default: rclone. May hold a prefix (for example a
#                     `docker run ... rclone/rclone` line) to run without rclone installed.
#   RCLONE_REMOTE     rclone remote name. Default: r2.
#
# The dump goes to a temporary file first and is checked before the upload, so a
# failed pg_dump never leaves an empty or truncated backup in the bucket.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

COMPOSE_ARGS="${COMPOSE_ARGS:---env-file deploy/.env.production -f deploy/compose.production.yaml}"
RCLONE="${RCLONE:-rclone}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"

if [ -z "${R2_BACKUP_BUCKET:-}" ] && [ -f deploy/.env.production ]; then
  R2_BACKUP_BUCKET="$(sed -n 's/^R2_BACKUP_BUCKET=//p' deploy/.env.production | tail -n 1 | tr -d '"'"'"'\r')"
fi
if [ -z "${R2_BACKUP_BUCKET:-}" ]; then
  echo "R2_BACKUP_BUCKET is not set (environment or deploy/.env.production)." >&2
  exit 1
fi

# shellcheck disable=SC2206 # intentional word splitting of the command settings
compose=(docker compose $COMPOSE_ARGS)
# shellcheck disable=SC2206
rclone_cmd=($RCLONE)

name="sipat-online-$(date -u +%Y%m%d-%H%M%S).dump"
destination="${RCLONE_REMOTE}:${R2_BACKUP_BUCKET}/postgres"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "Dumping the database..."
"${compose[@]}" exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$tmp"

if [ ! -s "$tmp" ]; then
  echo "The dump is empty; nothing was uploaded." >&2
  exit 1
fi
# A readable table of contents proves the dump is complete and valid.
if ! "${compose[@]}" exec -T postgres pg_restore --list < "$tmp" > /dev/null; then
  echo "The dump is not readable by pg_restore; nothing was uploaded." >&2
  exit 1
fi

echo "Uploading $name ($(wc -c < "$tmp") bytes)..."
"${rclone_cmd[@]}" rcat "$destination/$name" < "$tmp"

echo "Removing backups older than 30 days..."
"${rclone_cmd[@]}" delete --min-age 30d --include 'sipat-online-*.dump' "$destination"

echo "Backup done: $destination/$name"
