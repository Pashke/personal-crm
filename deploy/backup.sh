#!/usr/bin/env bash
# Daily backup of the prod database. The systemd timer personal-crm-backup.timer runs it every day
# at 03:00 Moscow time (installed by deploy/server-setup/setup.sh). Can also be run by hand, as user deploy:
#   ssh crm-deploy personal-crm/deploy/backup.sh
#
# Writes backups/<UTC time>_daily_<app version>.dump, reads it back to make sure it can be restored,
# then keeps the newest 7 daily backups. Backups taken before deploys are rotated separately (deploy.sh).
# Only reads the database: it never starts, stops or restarts anything. If the database of prod is not
# running, the backup fails and says so.
# Waits for a running deploy or restore of prod (up to 10 minutes), and they wait for it.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'printf "\nERROR: command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR
# Prod only: the test stand has no backups.
use_env prod

[ $# -eq 0 ] || die "usage: backup.sh (no arguments)"

wait_for_lock
check_env_file

# compose needs the app image name even for commands that only touch postgres.
version="$(current_app_version)"
is_sha "$version" || die "no app version has been deployed to prod yet, there is no database to back up"
export APP_IMAGE="$IMAGE_REPO:$version"

[ -n "$(compose ps --status running --quiet postgres)" ] \
  || die "the prod database (service postgres of project $COMPOSE_PROJECT) is not running: no backup was taken"

log "Daily backup of the prod database (app version $version)"
backup_db daily "$version"
prune_backups daily

log "BACKED UP to $BACKUP_FILE"
