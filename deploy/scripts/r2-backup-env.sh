# Sourced by backup-postgres.sh and restore-postgres.sh (not run on its own).
#
# Reads the backup settings from deploy/.env.production (written by deploy-vm.sh) and, when
# the R2 key of the backups is there, defines the rclone remote "r2" through environment
# variables, so a new VM needs no `rclone config`. Without the key, rclone keeps using the
# remote configured by hand, as before.
#
# Sets R2_BACKUP_BUCKET when it was not already set.

r2_backup_setting() {
  [ -f deploy/.env.production ] || return 0
  sed -n "s/^$1=//p" deploy/.env.production | tail -n 1 | tr -d '"'"'"'\r'
}

if [ -z "${R2_BACKUP_BUCKET:-}" ]; then
  R2_BACKUP_BUCKET="$(r2_backup_setting R2_BACKUP_BUCKET)"
fi

r2_backup_key_id="$(r2_backup_setting R2_BACKUP_ACCESS_KEY_ID)"
if [ -n "$r2_backup_key_id" ] && [ "${RCLONE_REMOTE:-r2}" = "r2" ]; then
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$r2_backup_key_id"
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(r2_backup_setting R2_BACKUP_SECRET_ACCESS_KEY)"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
  RCLONE_CONFIG_R2_ENDPOINT="$(r2_backup_setting R2_SERVICE_URL)"
  export RCLONE_CONFIG_R2_ENDPOINT
  # a key limited to one bucket cannot list or create buckets
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
fi
unset r2_backup_key_id
