#!/usr/bin/env bash
# Turns a bare Ubuntu/Debian VM into one that runs SIPAT Online, so any provider works
# (Azure, Hetzner, Oracle, a VM at the client): Docker with Compose, rclone (backups to R2),
# certbot (HTTPS), the folders of the app and a swap file when the VM has little memory.
#
# deploy-vm.sh runs it as root on every deploy, before copying the release. It only installs
# what is missing, so on a VM that is already prepared it ends in a few seconds.
#
# Usage (as root): prepare-vm.sh <app path> <deploy user>
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <app path> <deploy user>" >&2
  exit 1
fi
app_path="$1"
deploy_user="$2"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (the deploy user needs sudo without a password)." >&2
  exit 1
fi
if ! command -v apt-get > /dev/null; then
  echo "Only Ubuntu or Debian VMs are supported (apt-get not found)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
missing=()
command -v docker > /dev/null || missing+=(docker.io)
docker compose version > /dev/null 2>&1 || missing+=(docker-compose-v2)
command -v rclone > /dev/null || missing+=(rclone)
command -v openssl > /dev/null || missing+=(openssl)
[ -x /opt/certbot/bin/certbot ] || missing+=(python3-venv)
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Installing: ${missing[*]}"
  apt-get update -q
  apt-get install -y -q ca-certificates "${missing[@]}"
fi
systemctl enable --now docker

if [ ! -x /opt/certbot/bin/certbot ]; then
  echo "Installing certbot"
  python3 -m venv /opt/certbot
  /opt/certbot/bin/pip install --quiet --upgrade certbot
fi

# 1 GB of memory is not enough to start the API and Postgres side by side
memory_mb="$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)"
if [ "$memory_mb" -lt 3000 ] && [ -z "$(swapon --noheadings)" ]; then
  echo "Creating a 2 GB swap file (${memory_mb} MB of memory)"
  [ -f /swapfile ] || { fallocate -l 2048M /swapfile && chmod 600 /swapfile && mkswap /swapfile > /dev/null; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-sipat-swap.conf
  sysctl --quiet --system
fi

# webroot of the HTTP-01 challenge, served by the web container on port 80
install -d -m 0755 /var/www/certbot
id -nG "$deploy_user" | tr ' ' '\n' | grep -qx docker || usermod -aG docker "$deploy_user"
install -d -o "$deploy_user" -g "$deploy_user" -m 0750 "$app_path"
echo "VM ready."
