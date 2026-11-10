#!/bin/sh
set -eu

compose_file=/opt/sipat-online/app/deploy/compose.production.yaml
environment_file=/opt/sipat-online/app/deploy/.env.production

if [ -f "$compose_file" ] && [ -f "$environment_file" ]; then
    docker compose --env-file "$environment_file" -f "$compose_file" restart web
fi
