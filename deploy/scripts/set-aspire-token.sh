#!/usr/bin/env bash
# Runs ON the VM (.github/workflows/aspire-token.yml): writes the Aspire Dashboard token read from stdin
# into deploy/.env.production and recreates only the aspire-dashboard container. No build, no other container.
# Usage: printf '%s\n' "$token" | bash set-aspire-token.sh /opt/sipat-online/app
set -euo pipefail

cd "$1"
env_file=deploy/.env.production
IFS= read -r token

if [ -z "$token" ]; then
  echo "Empty token." >&2
  exit 1
fi
case "$token" in *"'"*) echo "The token cannot have a single quote (')." >&2; exit 1;; esac
if ! grep -q '^ASPIRE_DASHBOARD=true$' "$env_file"; then
  echo "The Aspire Dashboard is off on this VM: set ASPIRE_DASHBOARD=true and run the full deploy." >&2
  exit 1
fi
if ! grep -q '^ASPIRE_HOST=' "$env_file"; then
  echo "The page https://aspire.<domain> was never set up here: run the full deploy once with the token." >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
grep -v '^ASPIRE_BROWSER_TOKEN=' "$env_file" > "$tmp" || true
# in single quotes: Compose would read a $ in it as a variable and change the token
printf "ASPIRE_BROWSER_TOKEN='%s'\n" "$token" >> "$tmp"
# same file (keeps its owner and mode 600)
cat "$tmp" > "$env_file"

docker compose --env-file "$env_file" --file deploy/compose.production.yaml up -d --force-recreate aspire-dashboard
echo "Aspire Dashboard recreated with the new token."
