#!/usr/bin/env bash
# Restores the production database from a backup file. Run by hand only, never by CI or other scripts.
#
# Usage, from your computer (-t is required: the script waits for you to type "yes"):
#   ssh -t crm-deploy personal-crm/deploy/restore.sh <backup file>
# <backup file> is a path on the server or just a file name from personal-crm/backups/.
#
# Steps: check the backup -> show which file replaces which database and wait for "yes" ->
# save a copy of the current database -> stop the app -> drop the database and create it empty ->
# load the backup -> start the same app version again -> smoke /health.
#
# It never changes the app version and does not run migrations. To get the database back together
# with the app version it was taken at, first deploy that version to prod (Deploy prod in GitHub with the
# SHA from the file name, or the rollback box if it is the previous prod version), then restore.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'printf "\nERROR: command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR
# Prod only. The test stand database is recreated with refresh-staging-db.sh.
use_env prod

[ $# -eq 1 ] || die "usage: restore.sh <backup file>"
[ -t 0 ] || die "restore waits for you to type \"yes\": run it in a terminal, with ssh -t"

# ---------------------------------------------------------------- backup file
backup="$1"
if [ ! -f "$backup" ] && [[ "$backup" != */* ]] && [ -f "$BACKUP_DIR/$backup" ]; then
  backup="$BACKUP_DIR/$backup"
fi
[ -f "$backup" ] || die "backup file not found: $1
Files in $BACKUP_DIR:
$(ls -1 "$BACKUP_DIR" 2>/dev/null | sed 's/^/    /' || true)"
[ -r "$backup" ] || die "cannot read $backup"
backup="$(realpath "$backup")"
backup_name="$(basename "$backup")"
# Version of the app the backup was taken at, from the file name (empty if the name has none).
backup_version="$(sed -nE 's/.*_([0-9a-f]{40})\.dump$/\1/p' <<< "$backup_name")"

check_env_file

# No deploy may start while the database is being replaced: deploy.sh takes the same lock.
mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "a deploy is running right now: wait for it to finish, then run restore again"

# ---------------------------------------------------------------- app version (stays the same)
version="$(current_app_version)"
is_sha "$version" || die "no app version has been deployed yet, there is nothing to restore into"
export APP_IMAGE="$IMAGE_REPO:$version"
docker image inspect "$APP_IMAGE" >/dev/null 2>&1 \
  || die "the image of the current app version is not on the server: $APP_IMAGE"

# ---------------------------------------------------------------- check the backup
log "Checking the backup"
compose up --detach --wait postgres
# Reads the whole file the way a restore would, without touching the database.
pg_restore_stdin '--file=/dev/null' < "$backup" \
  || die "$backup is not a database backup or it is damaged. Nothing was changed"
info "the file is a complete database backup"

# ---------------------------------------------------------------- confirmation
db_info="$(pg_sh 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-align --tuples-only \
  --command="select current_database(), pg_size_pretty(pg_database_size(current_database()))"' < /dev/null)"
IFS='|' read -r db_name db_size <<< "$db_info"
postgres_container="$(docker inspect --format '{{.Name}}' "$(compose ps --quiet postgres)")"

log "Restore the production database"
info "Backup file:  $backup"
info "              $(du -h "$backup" | cut -f1), written $(date -u -r "$backup" '+%Y-%m-%d %H:%M UTC')"
info "              taken at app version ${backup_version:-unknown (not in the file name)}"
info "Database:     \"$db_name\" in container ${postgres_container#/}, $db_size now"
info "              it will be DELETED and loaded from the backup file"
info "App version:  $version, stays the same; migrations are not run"
info "First, a copy of the current database is saved to $BACKUP_DIR"
if [ -n "$backup_version" ] && [ "$backup_version" != "$version" ]; then
  printf '\nWARNING: the backup was taken at app version %s,\n' "$backup_version"
  info "but version $version is running and may not work with that database."
  info "To get the app and the database of that time back: answer no, run Deploy prod in GitHub"
  info "with SHA $backup_version (or the rollback box if it is the previous prod version),"
  info "then run restore again."
fi
printf '\n'
read -r -p "Type yes to replace the database: " answer || answer=""
[ "$answer" = "yes" ] || die "not confirmed. Nothing was changed"

# ---------------------------------------------------------------- copy of the current database
log "Saving a copy of the current database"
backup_db restore "$version"
copy="$BACKUP_FILE"

# From here on the database is being replaced. If the script stops halfway (an error, Ctrl+C,
# a lost connection), it says what state things are in. Nothing is put back automatically.
replacing=1
on_exit() {
  [ "$replacing" = 1 ] || return 0
  printf '\nERROR: restore did not finish. The app is stopped, the database may be empty or missing.\n' >&2
  printf 'Nothing was rolled back. The database as it was before restore is saved in\n    %s\n' "$copy" >&2
  printf 'To put it back: ssh -t crm-deploy personal-crm/deploy/restore.sh %s\n' "${copy##*/}" >&2
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------------------------------------------------------------- replace the database
log "Stopping the app"
compose stop app

log "Replacing the database"
pg_sh 'dropdb --username="$POSTGRES_USER" --force "$POSTGRES_DB"' < /dev/null
info "dropped \"$db_name\""
pg_sh 'createdb --username="$POSTGRES_USER" --owner="$POSTGRES_USER" "$POSTGRES_DB"' < /dev/null
info "created \"$db_name\" empty"
# One transaction: either the whole backup is loaded or nothing is.
pg_restore_stdin '--username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --exit-on-error --single-transaction' \
  < "$backup"
info "loaded $backup_name"
replacing=0

# ---------------------------------------------------------------- start the same version
log "Starting the app, version $version"
if ! compose up --detach --wait --wait-timeout 120 app; then
  compose logs --tail 50 app || true
  die "the database is restored, but the app did not become healthy. Nothing was rolled back"
fi

log "Smoke test: GET /health"
if ! check_health; then
  compose logs --tail 50 app || true
  die "the database is restored, but /health does not answer 200. Nothing was rolled back"
fi

log "RESTORED from $backup_name"
info "app version: $version (unchanged)"
info "the database as it was before restore: $copy"
