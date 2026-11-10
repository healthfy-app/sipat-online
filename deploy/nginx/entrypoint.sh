#!/bin/sh
set -eu

certificate=/etc/letsencrypt/live/sipat-online/fullchain.pem
private_key=/etc/letsencrypt/live/sipat-online/privkey.pem

if [ -s "$certificate" ] && [ -s "$private_key" ]; then
    cp /etc/nginx/sipat-online-https.conf /etc/nginx/conf.d/default.conf
else
    cp /etc/nginx/sipat-online-http.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
