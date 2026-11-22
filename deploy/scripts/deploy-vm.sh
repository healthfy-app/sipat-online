#!/usr/bin/env bash
# Deploys the current checkout to a VM: builds the two images HERE (the VM never builds),
# copies them and the deploy/ folder over SSH, writes deploy/.env.production on the VM from
# the environment variables below, runs db-init, starts postgres, api and web, issues the
# HTTPS certificate (CERTIFICATE_MODE=http01) and checks https://PLATFORM_HOST/health.
#
# The same script runs in GitHub Actions (.github/workflows/deploy-vm.yml, values from the
# GitHub environment) and from a workstation (values exported in the shell). See deploy/PIPELINE-VM.md.
#
# Required: DEPLOY_HOST DEPLOY_USER DEPLOY_APP_PATH DEPLOY_SSH_KEY_FILE DEPLOY_KNOWN_HOSTS_FILE
#           TENANT_BASE_DOMAIN PLATFORM_HOST POSTGRES_PASSWORD PLATFORM_OPERATOR_LOGIN_IDENTIFIER
# Optional: PLATFORM_OPERATOR_DISPLAY_NAME PLATFORM_OPERATOR_PASSWORD (first deploy only)
#           CERTIFICATE_MODE (http01|dns-azure|manual) ACME_EMAIL DEPLOY_ENVIRONMENT IMAGE_TAG
#           DEPLOY_PLATFORM (linux/amd64 default; linux/arm64 for Azure *p* sizes such as B2pts_v2)
#           VIDEO_STORAGE_PROVIDER (File|R2) R2_SERVICE_URL R2_VIDEO_BUCKET R2_ACCESS_KEY_ID
#           R2_SECRET_ACCESS_KEY R2_DIRECT_UPLOAD OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

for name in DEPLOY_HOST DEPLOY_USER DEPLOY_APP_PATH DEPLOY_SSH_KEY_FILE DEPLOY_KNOWN_HOSTS_FILE \
            TENANT_BASE_DOMAIN PLATFORM_HOST POSTGRES_PASSWORD PLATFORM_OPERATOR_LOGIN_IDENTIFIER; do
  if [ -z "${!name:-}" ]; then
    echo "Missing setting: $name" >&2
    exit 1
  fi
done
if ! [[ "$DEPLOY_APP_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "DEPLOY_APP_PATH must be an absolute path." >&2
  exit 1
fi

environment="${DEPLOY_ENVIRONMENT:-dev}"
tag="${IMAGE_TAG:-$(git rev-parse --short=12 HEAD)}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

ssh_options=(-i "$DEPLOY_SSH_KEY_FILE" -o BatchMode=yes -o StrictHostKeyChecking=yes
             -o UserKnownHostsFile="$DEPLOY_KNOWN_HOSTS_FILE" -o ServerAliveInterval=30)
target="$DEPLOY_USER@$DEPLOY_HOST"
remote() { ssh "${ssh_options[@]}" "$target" "$@"; }

echo "==> Environment file"
provider="${VIDEO_STORAGE_PROVIDER:-File}"
if [ "$provider" = "R2" ] && { [ -z "${R2_SERVICE_URL:-}" ] || [ -z "${R2_VIDEO_BUCKET:-}" ] \
    || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; }; then
  echo "WARNING: VIDEO_STORAGE_PROVIDER=R2 but the R2 settings are incomplete; videos stay on the VM volume (File)." >&2
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::warning::R2 settings incomplete; this deploy uses File video storage."
  provider=File
fi

env_file="$work/env.production"
(umask 077 && : > "$env_file")
put() {
  # one line per value: a line break would let a value add settings of its own
  case "$2" in *$'\n'*|*$'\r'*) echo "$1 has a line break" >&2; exit 1;; esac
  printf '%s=%s\n' "$1" "$2" >> "$env_file"
}
put POSTGRES_DB sipat_online
put POSTGRES_USER sipat_online
put POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
put TENANT_BASE_DOMAIN "$TENANT_BASE_DOMAIN"
put PLATFORM_HOST "$PLATFORM_HOST"
put PLATFORM_OPERATOR_LOGIN_IDENTIFIER "$PLATFORM_OPERATOR_LOGIN_IDENTIFIER"
put PLATFORM_OPERATOR_DISPLAY_NAME "${PLATFORM_OPERATOR_DISPLAY_NAME:-$PLATFORM_OPERATOR_LOGIN_IDENTIFIER}"
# only read while the account does not exist (first deploy)
put PLATFORM_OPERATOR_PASSWORD "${PLATFORM_OPERATOR_PASSWORD:-}"
put SIPAT_API_IMAGE "sipat-online-api:$tag"
put SIPAT_WEB_IMAGE "sipat-online-web:$tag"
put CERTIFICATE_MODE "${CERTIFICATE_MODE:-manual}"
put ACME_EMAIL "${ACME_EMAIL:-}"
put VIDEO_STORAGE_PROVIDER "$provider"
if [ "$provider" = "R2" ]; then
  put R2_SERVICE_URL "$R2_SERVICE_URL"
  put R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID"
  put R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY"
  put R2_VIDEO_BUCKET "$R2_VIDEO_BUCKET"
  put R2_DIRECT_UPLOAD "${R2_DIRECT_UPLOAD:-false}"
fi
if [ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]; then
  put OTEL_EXPORTER_OTLP_ENDPOINT "$OTEL_EXPORTER_OTLP_ENDPOINT"
  put OTEL_EXPORTER_OTLP_HEADERS "${OTEL_EXPORTER_OTLP_HEADERS:-}"
  put OTEL_SERVICE_NAME "sipat-online-api-$environment"
fi
echo "$(wc -l < "$env_file") settings; video storage: $provider; images: $tag"

platform="${DEPLOY_PLATFORM:-linux/amd64}"
echo "==> Build images ($platform)"
docker buildx build --load --platform "$platform" --file Dockerfile --tag "sipat-online-api:$tag" .
docker buildx build --load --platform "$platform" --file deploy/nginx/Dockerfile --tag "sipat-online-web:$tag" .
docker save "sipat-online-api:$tag" "sipat-online-web:$tag" | gzip -1 > "$work/images.tar.gz"
echo "images: $(du -h "$work/images.tar.gz" | cut -f1)"

echo "==> Copy release to $DEPLOY_HOST"
remote "test -d '$DEPLOY_APP_PATH' && mkdir -p '$DEPLOY_APP_PATH/deploy'"
tar --create --gzip --exclude=deploy/terraform --exclude=deploy/cloudflare --exclude='deploy/.env*' deploy \
  | remote "tar --extract --gzip --directory '$DEPLOY_APP_PATH'"
remote "umask 077 && cat > '$DEPLOY_APP_PATH/deploy/.env.production'" < "$env_file"
remote "cat > /tmp/sipat-online-images.tar.gz" < "$work/images.tar.gz"

echo "==> Start the stack"
remote "bash -s -- '$DEPLOY_APP_PATH'" <<'REMOTE'
set -euo pipefail
cd "$1"
chmod 0755 deploy/scripts/*.sh
gunzip -c /tmp/sipat-online-images.tar.gz | docker load
rm -f /tmp/sipat-online-images.tar.gz

compose=(docker compose --env-file deploy/.env.production --file deploy/compose.production.yaml)
"${compose[@]}" up -d --no-build postgres
"${compose[@]}" --profile tools run --rm db-init
"${compose[@]}" up -d --no-build --remove-orphans api web

# HTTPS by HTTP-01 (no wildcard zone): issue now and keep the company hosts in the certificate
sudo install -m 0644 deploy/systemd/sipat-certificates.service deploy/systemd/sipat-certificates.timer /etc/systemd/system/
sudo sed -i "s#/opt/sipat-online/app#$1#" /etc/systemd/system/sipat-certificates.service
sudo systemctl daemon-reload
if grep -q '^CERTIFICATE_MODE=http01$' deploy/.env.production; then
  sudo systemctl enable sipat-certificates.timer
  sudo systemctl start sipat-certificates.timer
  sudo deploy/scripts/issue-certificates.sh
else
  sudo systemctl disable --now sipat-certificates.timer 2>/dev/null || true
fi

docker image prune --all --force > /dev/null
"${compose[@]}" ps
REMOTE

echo "==> Health check"
curl --fail --silent --show-error --retry 12 --retry-delay 10 --retry-all-errors "https://$PLATFORM_HOST/health"
echo
echo "Operation portal: https://$PLATFORM_HOST"
