#!/usr/bin/env bash
# Points a GitHub environment (dev, production) at another VM: sets the variable DEPLOY_HOST
# (and DEPLOY_USER, when given) and the secret DEPLOY_SSH_KNOWN_HOSTS with the SSH key of the
# new VM. Run on your machine (Git Bash on Windows), with `gh` logged in as a repository admin.
#
# Usage: deploy/scripts/use-vm.sh <environment> <ip> [user]
#
# Before: the new VM is an Ubuntu/Debian with SSH open, the public key of the pipeline in
# ~/.ssh/authorized_keys of the user, and sudo without a password for that user (the default
# of the cloud images). Then run the deploy of that environment; see deploy/PIPELINE-VM.md.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <environment> <ip> [user]" >&2
  exit 1
fi
environment="$1"
host="$2"
user="${3:-}"

keys="$(ssh-keyscan -t ed25519 "$host" 2>/dev/null)"
if [ -z "$keys" ]; then
  echo "No SSH answer from $host (port 22 open? VM started?)." >&2
  exit 1
fi
echo "SSH key of $host:"
ssh-keygen -l -f <(printf '%s\n' "$keys")
echo "If the provider's console shows the fingerprint of the VM, check that it is the same."
read -r -p "Use $host for the '$environment' environment? [y/N] " answer
case "$answer" in y|Y|s|S) ;; *) echo "Nothing changed."; exit 1;; esac

gh variable set DEPLOY_HOST --env "$environment" --body "$host"
if [ -n "$user" ]; then
  gh variable set DEPLOY_USER --env "$environment" --body "$user"
fi
printf '%s\n' "$keys" | gh secret set DEPLOY_SSH_KNOWN_HOSTS --env "$environment"

platform_host="$(gh variable get PLATFORM_HOST --env "$environment" 2>/dev/null || true)"
if [[ "$platform_host" == *.sslip.io ]]; then
  echo "WARNING: PLATFORM_HOST is still $platform_host (the old IP). Delete PLATFORM_HOST and TENANT_BASE_DOMAIN" >&2
  echo "         so the deploy takes them from DEPLOY_HOST:" >&2
  echo "         gh variable delete PLATFORM_HOST --env $environment; gh variable delete TENANT_BASE_DOMAIN --env $environment" >&2
fi
echo "Done. Next: run the deploy of '$environment' with restore_backup=latest (GitHub, Actions)."
