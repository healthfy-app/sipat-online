#!/usr/bin/env bash
# Deploys the current checkout to a VM: prepares a bare Ubuntu/Debian VM (prepare-vm.sh),
# builds the two images HERE (the VM never builds), copies them and the deploy/ folder over
# SSH, writes deploy/.env.production on the VM from the environment variables below, runs
# db-init, starts postgres, api and web, issues the HTTPS certificate (CERTIFICATE_MODE=http01),
# turns the daily backup to R2 on (R2_BACKUP_BUCKET) and checks https://PLATFORM_HOST/health.
#
# Moving to another VM: point DEPLOY_HOST at it and deploy once with RESTORE_BACKUP=latest
# (restore-on-new-vm.sh loads the last backup into the new, empty database). See deploy/PIPELINE-VM.md.
#
# The same script runs in GitHub Actions (.github/workflows/deploy-vm.yml, values from the
# GitHub environment) and from a workstation (values exported in the shell). See deploy/PIPELINE-VM.md.
#
# Required: DEPLOY_HOST DEPLOY_USER DEPLOY_APP_PATH DEPLOY_SSH_KEY_FILE DEPLOY_KNOWN_HOSTS_FILE
#           POSTGRES_PASSWORD PLATFORM_OPERATOR_LOGIN_IDENTIFIER
#           TENANT_BASE_DOMAIN PLATFORM_HOST: required with a domain of our own; when both are empty
#           and DEPLOY_HOST is an IPv4, they become <ip-with-dashes>.sslip.io and ops.<that> (dev)
# Optional: PLATFORM_OPERATOR_DISPLAY_NAME PLATFORM_OPERATOR_PASSWORD (first deploy only)
#           CERTIFICATE_MODE (http01|dns-azure|manual) ACME_EMAIL DEPLOY_ENVIRONMENT IMAGE_TAG
#           DEPLOY_PLATFORM (linux/amd64 default; linux/arm64 for Azure *p* sizes such as B2pts_v2)
#           VIDEO_STORAGE_PROVIDER (File|R2) R2_SERVICE_URL R2_VIDEO_BUCKET R2_ACCESS_KEY_ID
#           R2_SECRET_ACCESS_KEY R2_DIRECT_UPLOAD OTEL_EXPORTER_OTLP_ENDPOINT OTEL_EXPORTER_OTLP_HEADERS
#           ASPIRE_DASHBOARD (true: Aspire Dashboard on the VM receives the telemetry; wins over OTEL_*)
#           R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY (the key falls back to
#           R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY, for a key that can also write the backup bucket)
#           RESTORE_BACKUP (latest | sipat-online-YYYYMMDD-HHMMSS.dump: only on a new, empty VM)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# without a domain of our own the hosts follow the IP: a new VM only changes DEPLOY_HOST
if [ -z "${TENANT_BASE_DOMAIN:-}" ] && [ -z "${PLATFORM_HOST:-}" ] \
    && [[ "${DEPLOY_HOST:-}" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  TENANT_BASE_DOMAIN="${DEPLOY_HOST//./-}.sslip.io"
  PLATFORM_HOST="ops.$TENANT_BASE_DOMAIN"
  echo "Hosts from DEPLOY_HOST: $PLATFORM_HOST and <company>.$TENANT_BASE_DOMAIN"
fi
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
restore="${RESTORE_BACKUP:-}"
if [ -n "$restore" ] && [ "$restore" != "latest" ] && ! [[ "$restore" =~ ^sipat-online-[0-9]{8}-[0-9]{6}\.dump$ ]]; then
  echo "RESTORE_BACKUP must be 'latest' or a name like sipat-online-20261127-030000.dump." >&2
  exit 1
fi
if [ -n "$restore" ] && [ -z "${R2_BACKUP_BUCKET:-}" ]; then
  echo "RESTORE_BACKUP needs R2_BACKUP_BUCKET: that is where the backups are." >&2
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
  if [ "$environment" = "production" ]; then
    # in production a silent fallback would leave new uploads only on the VM disk
    echo "VIDEO_STORAGE_PROVIDER=R2 but the R2 settings are incomplete. Production does not fall back to File." >&2
    exit 1
  fi
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
# read by deploy/scripts/backup-postgres.sh: without it here, every deploy would switch the daily backup off
if [ -n "${R2_BACKUP_BUCKET:-}" ]; then
  backup_key_id="${R2_BACKUP_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
  backup_secret="${R2_BACKUP_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
  if [ -z "${R2_SERVICE_URL:-}" ] || [ -z "$backup_key_id" ] || [ -z "$backup_secret" ]; then
    echo "R2_BACKUP_BUCKET needs R2_SERVICE_URL and an R2 key (R2_BACKUP_ACCESS_KEY_ID/R2_BACKUP_SECRET_ACCESS_KEY)." >&2
    exit 1
  fi
  put R2_BACKUP_BUCKET "$R2_BACKUP_BUCKET"
  [ "$provider" = "R2" ] || put R2_SERVICE_URL "$R2_SERVICE_URL"
  # rclone reads the key from here (deploy/scripts/r2-backup-env.sh): a new VM needs no `rclone config`
  put R2_BACKUP_ACCESS_KEY_ID "$backup_key_id"
  put R2_BACKUP_SECRET_ACCESS_KEY "$backup_secret"
fi
if [ "${ASPIRE_DASHBOARD:-}" = "true" ]; then
  # the API sends its telemetry to the Aspire Dashboard container on the VM (compose service aspire-dashboard)
  put ASPIRE_DASHBOARD true
  put OTEL_EXPORTER_OTLP_ENDPOINT "http://aspire-dashboard:18889"
  put OTEL_EXPORTER_OTLP_PROTOCOL grpc
  put OTEL_SERVICE_NAME "sipat-online-api-$environment"
elif [ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]; then
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

echo "==> Prepare $DEPLOY_HOST"
# its own SSH session: the docker group it may add only counts from the next login
remote "sudo bash -s -- '$DEPLOY_APP_PATH' '$DEPLOY_USER'" < deploy/scripts/prepare-vm.sh

echo "==> Copy release to $DEPLOY_HOST"
remote "mkdir -p '$DEPLOY_APP_PATH/deploy'"
tar --create --gzip --exclude=deploy/terraform --exclude=deploy/cloudflare --exclude='deploy/.env*' deploy \
  | remote "tar --extract --gzip --directory '$DEPLOY_APP_PATH'"
remote "umask 077 && cat > '$DEPLOY_APP_PATH/deploy/.env.production'" < "$env_file"
remote "cat > /tmp/sipat-online-images.tar.gz" < "$work/images.tar.gz"

echo "==> Start the stack"
remote "bash -s -- '$DEPLOY_APP_PATH' '$restore'" <<'REMOTE' | tee "$work/remote.log"
set -euo pipefail
cd "$1"
restore="$2"
chmod 0755 deploy/scripts/*.sh
gunzip -c /tmp/sipat-online-images.tar.gz | docker load
rm -f /tmp/sipat-online-images.tar.gz

compose=(docker compose --env-file deploy/.env.production --file deploy/compose.production.yaml)
"${compose[@]}" up -d --no-build --wait postgres
if [ -n "$restore" ]; then
  # moving to a new VM: the data comes from the last backup, before db-init and the API touch the database
  deploy/scripts/restore-on-new-vm.sh "$restore" < /dev/null
fi
# -T and </dev/null: this script itself arrives on stdin, and "run" would swallow the rest of it
"${compose[@]}" --profile tools run --rm -T db-init < /dev/null
if grep -q '^ASPIRE_DASHBOARD=true$' deploy/.env.production; then
  "${compose[@]}" up -d aspire-dashboard
else
  "${compose[@]}" rm --stop --force aspire-dashboard
fi
"${compose[@]}" up -d --no-build --remove-orphans api web

# HTTPS by HTTP-01 (no wildcard zone): issue now and keep the company hosts in the certificate
for unit in sipat-certificates sipat-certbot-renew sipat-backup; do
  sudo install -m 0644 "deploy/systemd/$unit.service" "deploy/systemd/$unit.timer" /etc/systemd/system/
  sudo sed -i "s#/opt/sipat-online/app#$1#g" "/etc/systemd/system/$unit.service"
done
sudo systemctl daemon-reload
# renewal of the certificates in every mode (the Azure cloud-init installed an older copy of it)
sudo systemctl disable --now sipat-online-certbot-renew.timer 2>/dev/null || true
sudo systemctl enable --now sipat-certbot-renew.timer
if grep -q '^R2_BACKUP_BUCKET=' deploy/.env.production; then
  sudo systemctl enable --now sipat-backup.timer
else
  sudo systemctl disable --now sipat-backup.timer 2>/dev/null || true
fi
if grep -q '^CERTIFICATE_MODE=http01$' deploy/.env.production; then
  # through systemd, so a run started by the timer and this one never call certbot at the same time;
  # "start" of a oneshot waits until it ends and fails the deploy when the certificate fails
  sudo systemctl start sipat-certificates.service
  sudo systemctl enable --now sipat-certificates.timer
else
  sudo systemctl disable --now sipat-certificates.timer 2>/dev/null || true
fi

docker image prune --all --force > /dev/null
"${compose[@]}" ps
echo "REMOTE-DONE"
REMOTE
# a remote command that reads stdin would end the script early with success: require the last line
if ! grep -q '^REMOTE-DONE$' "$work/remote.log"; then
  echo "The remote steps did not run to the end." >&2
  exit 1
fi

echo "==> Health check"
curl --fail --silent --show-error --retry 12 --retry-delay 10 --retry-all-errors "https://$PLATFORM_HOST/health"
echo
echo "Operation portal: https://$PLATFORM_HOST"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "url=https://$PLATFORM_HOST" >> "$GITHUB_OUTPUT"
fi
