#!/bin/sh
set -eu

certificate=/etc/letsencrypt/live/sipat-online/fullchain.pem
private_key=/etc/letsencrypt/live/sipat-online/privkey.pem
aspire_config=/etc/nginx/conf.d/sipat-online-aspire.conf

rm -f "$aspire_config"
if [ -s "$certificate" ] && [ -s "$private_key" ]; then
    cp /etc/nginx/sipat-online-https.conf /etc/nginx/conf.d/default.conf

    # Aspire Dashboard page (ASPIRE_HOST, set by deploy-vm.sh with ASPIRE_DASHBOARD=true): only over HTTPS,
    # behind the dashboard's own browser token. A host that is not a plain DNS name is ignored.
    aspire_host="${ASPIRE_HOST:-}"
    if printf '%s' "$aspire_host" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'; then
        cat > "$aspire_config" <<EOF
map \$http_upgrade \$aspire_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    http2 on;
    server_name $aspire_host;

    ssl_certificate $certificate;
    ssl_certificate_key $private_key;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    # resolved on each request: nginx still starts while the dashboard container is down
    resolver 127.0.0.11 valid=30s ipv6=off;
    set \$aspire_upstream http://aspire-dashboard:18888;

    location / {
        proxy_pass \$aspire_upstream;
        proxy_http_version 1.1;
        # the page is Blazor Server: it lives on a WebSocket
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$aspire_connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        # a redirect the dashboard builds with http:// stays on https
        proxy_redirect http://\$host/ https://\$host/;
        proxy_read_timeout 1h;
        proxy_buffering off;
    }
}
EOF
    fi
else
    cp /etc/nginx/sipat-online-http.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
