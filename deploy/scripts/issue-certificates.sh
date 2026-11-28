#!/usr/bin/env bash
# Issues or widens the Let's Encrypt certificate "sipat-online" by HTTP-01, for hosts
# without a wildcard certificate (no DNS zone of our own: sslip.io or plain DNS records).
#
# The certificate covers PLATFORM_HOST plus <key>.<TENANT_BASE_DOMAIN> of every active
# company in the database. It only calls Let's Encrypt when that list changed, so it is
# safe to run often: the systemd timer (deploy/systemd/sipat-certificates.timer) runs it
# every 10 minutes and a company created in the operation gets HTTPS a few minutes later.
# Renewal of an unchanged list is done by `certbot renew` (timer from cloud-init).
#
# Settings come from deploy/.env.production:
#   CERTIFICATE_MODE  http01 = this script; anything else (dns-azure, manual) = do nothing.
#   PLATFORM_HOST, TENANT_BASE_DOMAIN  hosts of the platform.
#   ASPIRE_HOST       optional host of the Aspire Dashboard page.
#   ACME_EMAIL        optional e-mail for expiry notices of Let's Encrypt.
# Run as root on the VM, from anywhere.
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$app_dir/deploy/.env.production"
compose=(docker compose --env-file "$env_file" -f "$app_dir/deploy/compose.production.yaml")
certbot_bin="${CERTBOT:-/opt/certbot/bin/certbot}"
webroot=/var/www/certbot
live_dir=/etc/letsencrypt/live/sipat-online

read_setting() {
  sed -n "s/^$1=//p" "$env_file" | tail -n 1 | tr -d '"'"'"'\r'
}

mode="$(read_setting CERTIFICATE_MODE)"
if [ "$mode" != "http01" ]; then
  echo "CERTIFICATE_MODE is '${mode:-empty}', not http01: nothing to do."
  exit 0
fi

platform_host="$(read_setting PLATFORM_HOST | tr '[:upper:]' '[:lower:]')"
base_domain="$(read_setting TENANT_BASE_DOMAIN | tr '[:upper:]' '[:lower:]')"
acme_email="$(read_setting ACME_EMAIL)"
: "${platform_host:?PLATFORM_HOST is empty in deploy/.env.production}"
: "${base_domain:?TENANT_BASE_DOMAIN is empty in deploy/.env.production}"

# active company keys. A query that fails is NOT "no companies": with a certificate already in place the script
# leaves it alone and tries again on the next run. On 2026-11-28 a busy database made the query fail and the
# certificate was reissued with the platform host only, taking every company off HTTPS until the next run.
# Only on the very first run (no certificate yet) a database that is not up means "only the platform host".
if ! keys="$("${compose[@]}" exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "select lower(\"Key\") from tenancy.\"Tenants\" where \"IsActive\" order by 1"' \
  2>/dev/null)"; then
  if [ -s "$live_dir/fullchain.pem" ]; then
    echo "Could not read the companies from the database: keeping the current certificate."
    exit 0
  fi
  keys=""
fi

wanted="$platform_host"
while IFS= read -r key; do
  # only plain DNS labels, never something that could become an argument
  if [[ "$key" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    wanted="$wanted"$'\n'"$key.$base_domain"
  fi
done <<< "$keys"
aspire_host="$(read_setting ASPIRE_HOST | tr '[:upper:]' '[:lower:]')"
if [[ "$aspire_host" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then
  wanted="$wanted"$'\n'"$aspire_host"
fi
wanted="$(printf '%s\n' "$wanted" | sort -u)"

current=""
if [ -s "$live_dir/fullchain.pem" ]; then
  current="$(openssl x509 -in "$live_dir/fullchain.pem" -noout -ext subjectAltName 2>/dev/null \
    | tr ',' '\n' | sed -n 's/^ *DNS://p' | sort -u)"
fi

if [ -n "$current" ] && [ "$current" = "$wanted" ]; then
  echo "Certificate already covers: $(echo "$wanted" | tr '\n' ' ')"
  exit 0
fi

domain_args=()
while IFS= read -r host; do
  domain_args+=(-d "$host")
done <<< "$wanted"

email_args=(--register-unsafely-without-email)
if [ -n "$acme_email" ]; then
  email_args=(--email "$acme_email")
fi

install -d -m 0755 "$webroot"
echo "Requesting certificate for: $(echo "$wanted" | tr '\n' ' ')"
"$certbot_bin" certonly --non-interactive --agree-tos "${email_args[@]}" \
  --webroot -w "$webroot" --cert-name sipat-online "${domain_args[@]}"

# the web container picks HTTP or HTTPS when it starts: restart it on the first certificate, reload afterwards
if "${compose[@]}" exec -T web grep -q 'listen 443' /etc/nginx/conf.d/default.conf 2>/dev/null; then
  "${compose[@]}" exec -T web nginx -s reload
else
  "${compose[@]}" restart web
fi
echo "Certificate ready."
