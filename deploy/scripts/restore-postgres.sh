#!/usr/bin/env bash
# Restore drill: loads a backup into a NEW database, never over the live one,
# and prints row counts to compare with the production database.
#
# Usage: restore-postgres.sh <backup>
#   <backup>  a local .dump file, or an rclone path such as
#             r2:<bucket>/postgres/sipat-online-20261114-030000.dump
#
# WARNING: the database `sipat_online_restore_test` is DROPPED and recreated at
# the start. It is a scratch database; the live one (POSTGRES_DB) is not touched.
# When done, drop it with:
#   docker compose $COMPOSE_ARGS exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" sipat_online_restore_test'
#
# Settings: COMPOSE_ARGS and RCLONE, as in backup-postgres.sh.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <backup file or rclone path>" >&2
  exit 1
fi
source_arg="$1"

COMPOSE_ARGS="${COMPOSE_ARGS:---env-file deploy/.env.production -f deploy/compose.production.yaml}"
RCLONE="${RCLONE:-rclone}"
# shellcheck disable=SC2206 # intentional word splitting of the command settings
compose=(docker compose $COMPOSE_ARGS)
# shellcheck disable=SC2206
rclone_cmd=($RCLONE)

tmp=""
trap '[ -z "$tmp" ] || rm -f "$tmp"' EXIT

if [ -f "$source_arg" ]; then
  dump="$source_arg"
elif [[ "$source_arg" == *:* ]]; then
  tmp="$(mktemp)"
  echo "Downloading $source_arg..."
  "${rclone_cmd[@]}" cat "$source_arg" > "$tmp"
  dump="$tmp"
else
  echo "File not found: $source_arg" >&2
  exit 1
fi
if [ ! -s "$dump" ]; then
  echo "The backup file is empty." >&2
  exit 1
fi

echo "Recreating sipat_online_restore_test..."
"${compose[@]}" exec -T postgres sh -c '
  set -e
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS sipat_online_restore_test" -c "CREATE DATABASE sipat_online_restore_test"'

echo "Restoring..."
"${compose[@]}" exec -T postgres sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d sipat_online_restore_test' < "$dump"

echo "Row counts in sipat_online_restore_test:"
"${compose[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d sipat_online_restore_test -t -A -F " = "' <<'SQL'
SELECT 'Tenants', count(*) FROM tenancy."Tenants"
UNION ALL SELECT 'learning.LearningProgress', count(*) FROM learning."LearningProgress"
UNION ALL SELECT 'PlatformCourseVideos', count(*) FROM learning."PlatformCourseVideos";
SQL
