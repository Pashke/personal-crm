#!/usr/bin/env bash
# Recreates the test stand database from the newest prod backup. By hand only, never by CI.
# For when the test stand data got broken, or to get a fresher copy of prod.
# Prod is not touched: its backups are only read.
#
# Usage, from your computer:
#   ssh -t crm-deploy personal-crm-staging/deploy/refresh-staging-db.sh        - asks you to type "yes"
#   ssh crm-deploy personal-crm-staging/deploy/refresh-staging-db.sh --yes     - without asking
#
# Steps: find and check the newest prod backup -> show which file replaces which database, confirm ->
# stop the test stand app -> drop its database and create it empty -> load the backup ->
# migrations of the test stand version -> start the same version again -> smoke /health.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'printf "\nERROR: command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR
use_env staging

case "$#:${1:-}" in
  0:) confirmed=0 ;;
  1:--yes) confirmed=1 ;;
  *) die "usage: refresh-staging-db.sh [--yes]" ;;
esac
[ "$confirmed" = 1 ] || [ -t 0 ] \
  || die "it waits for you to type \"yes\": run it in a terminal (ssh -t), or confirm with --yes"

check_env_file
# No deploy to the test stand may run while its database is being replaced: deploy.sh takes the same lock.
wait_for_lock

# ---------------------------------------------------------------- app version (stays the same)
version="$(current_app_version)"
is_sha "$version" \
  || die "nothing has been deployed to the test stand yet: its first deploy copies the prod database by itself"
export APP_IMAGE="$IMAGE_REPO:$version"
docker image inspect "$APP_IMAGE" >/dev/null 2>&1 \
  || die "the image of the current test stand version is not on the server: $APP_IMAGE"

# ---------------------------------------------------------------- newest prod backup
backup="$(latest_prod_backup)"
[ -n "$backup" ] || die "there is no prod backup in $BACKUP_DIR"
backup_name="${backup##*/}"

log "Checking the backup"
compose up --detach --wait postgres < /dev/null
check_backup "$backup" || die "$backup is damaged. Nothing was changed"
info "the file is a complete database backup"

# ---------------------------------------------------------------- confirmation
db_info="$(pg_sh 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-align --tuples-only \
  --command="select current_database(), pg_size_pretty(pg_database_size(current_database()))"' < /dev/null)"
IFS='|' read -r db_name db_size <<< "$db_info"

log "Recreate the test stand database"
info "Backup file:  $backup (prod)"
info "              $(du -h "$backup" | cut -f1), written $(date -u -r "$backup" '+%Y-%m-%d %H:%M UTC')"
info "Database:     \"$db_name\" of the test stand (project $COMPOSE_PROJECT), $db_size now"
info "              it will be DELETED and loaded from the backup file"
info "App version:  $version, stays the same; its migrations are applied after loading"
info "Prod is not touched"
if [ "$confirmed" = 0 ]; then
  printf '\n'
  read -r -p "Type yes to replace the test stand database: " answer || answer=""
  [ "$answer" = "yes" ] || die "not confirmed. Nothing was changed"
fi

# From here on the database is being replaced. If the script stops halfway (an error, Ctrl+C,
# a lost connection), it says what state things are in.
replacing=1
on_exit() {
  [ "$replacing" = 1 ] || return 0
  printf '\nERROR: refresh did not finish. The test stand app may be stopped, its database empty or not migrated.\n' >&2
  printf 'Prod is not affected. Run refresh-staging-db.sh again.\n' >&2
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------------------------------------------------------------- replace the database
log "Stopping the test stand app"
compose stop app

log "Replacing the database"
pg_sh 'dropdb --username="$POSTGRES_USER" --force "$POSTGRES_DB"' < /dev/null
info "dropped \"$db_name\""
pg_sh 'createdb --username="$POSTGRES_USER" --owner="$POSTGRES_USER" "$POSTGRES_DB"' < /dev/null
info "created \"$db_name\" empty"
load_backup "$backup"
info "loaded $backup_name"

log "Migrations of version $version"
compose run --rm migrate < /dev/null

# ---------------------------------------------------------------- start the same version
log "Starting the test stand app, version $version"
if ! compose up --detach --wait --wait-timeout 120 app; then
  compose logs --tail 50 app || true
  die "the app did not become healthy"
fi
replacing=0

log "Smoke test: GET /health"
if ! check_health; then
  compose logs --tail 50 app || true
  die "the database is recreated, but /health does not answer 200"
fi

log "REFRESHED the test stand database from $backup_name"
