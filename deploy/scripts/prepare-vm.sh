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
command -v curl > /dev/null || missing+=(curl)
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

# cosign checks the signature of the images before the deploy loads them (deploy-vm.sh). The binary comes from the
# official release and must match the checksum pinned here; a new version changes the three lines together.
cosign_version=v3.1.4
case "$(uname -m)" in
  x86_64) cosign_file=cosign-linux-amd64; cosign_sha256=424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa ;;
  aarch64) cosign_file=cosign-linux-arm64; cosign_sha256=ade83b7aac62e131cacfe96d958948b2150cc9efec46a570a2649b8e27dedad2 ;;
  *) echo "No cosign build for $(uname -m)." >&2; exit 1 ;;
esac
if ! /usr/local/bin/cosign version 2>/dev/null | grep -q "GitVersion: *$cosign_version\$"; then
  echo "Installing cosign $cosign_version"
  cosign_download="$(mktemp)"
  curl --fail --silent --show-error --location --output "$cosign_download" \
    "https://github.com/sigstore/cosign/releases/download/$cosign_version/$cosign_file"
  if ! echo "$cosign_sha256  $cosign_download" | sha256sum --check --status; then
    rm -f "$cosign_download"
    echo "The cosign download does not match its pinned checksum." >&2
    exit 1
  fi
  install -m 0755 "$cosign_download" /usr/local/bin/cosign
  rm -f "$cosign_download"
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
