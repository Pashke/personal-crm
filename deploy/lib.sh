# Shared settings and helpers for the server scripts (deploy.sh, rollback.sh, restore.sh, compose.sh,
# refresh-staging-db.sh). Not run on its own: the scripts load it with "source", then call use_env.

IMAGE_REPO="ghcr.io/pashke/personal-crm"

# Each environment has its own folder in the home of user deploy, with its own .env (mode 600),
# state/ and a copy of deploy/: lib.sh is at <home>/<environment folder>/deploy/lib.sh.
# deploy/ci-deploy.sh copies deploy/ into the same folders.
DEPLOY_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROD_DIR="$DEPLOY_HOME/personal-crm"
STAGING_DIR="$DEPLOY_HOME/personal-crm-staging"

# Database backups of prod. Outside deploy/, so deploys never replace or delete them.
# The test stand has no backups of its own: it takes its copy of the prod database from here.
BACKUP_DIR="$PROD_DIR/backups"
# Backups taken by deploys are rotated. Copies taken by restore.sh are kept until deleted by hand.
KEEP_DEPLOY_BACKUPS=10

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Picks the environment a script works with: "prod" or "staging" (the test stand).
# Everything that differs between them is set here. compose.yaml reads the exported values.
use_env() {
  ENV_NAME="${1:-}"
  case "$ENV_NAME" in
    prod)
      APP_DIR="$PROD_DIR"
      APP_HOST="app.whobook.ru"
      APP_PORT=3000
      # No memory limits on prod: 0 means no limit.
      APP_MEMORY_LIMIT=0
      POSTGRES_MEMORY_LIMIT=0
      ;;
    staging)
      APP_DIR="$STAGING_DIR"
      APP_HOST="test-app.whobook.ru"
      APP_PORT=3001
      # The test stand shares the server with prod and must not take its memory.
      # The app limit also applies to the one-off containers made from the app image (migrations).
      APP_MEMORY_LIMIT=512m
      POSTGRES_MEMORY_LIMIT=256m
      ;;
    *) die "unknown environment \"$ENV_NAME\": expected prod or staging" ;;
  esac
  COMPOSE_PROJECT="$ENV_NAME"
  # The public address: sign-in links lead here; https makes the session cookies Secure.
  APP_URL="https://$APP_HOST"
  ENV_FILE="$APP_DIR/.env"
  STATE_DIR="$APP_DIR/state"
  # Image tags (git commit SHAs) of the running version and the one before it.
  CURRENT_FILE="$STATE_DIR/current-version"
  PREVIOUS_FILE="$STATE_DIR/previous-version"
  # One deploy at a time per environment (see wait_for_lock).
  LOCK_FILE="$STATE_DIR/deploy.lock"
  export APP_URL APP_PORT APP_MEMORY_LIMIT POSTGRES_MEMORY_LIMIT
}

# docker compose for the stack of the current environment. APP_IMAGE must be exported before the call.
compose() {
  docker compose -p "$COMPOSE_PROJECT" \
    --project-directory "$APP_DIR" \
    -f "$APP_DIR/deploy/compose.yaml" \
    --env-file "$ENV_FILE" \
    "$@"
}

# Takes the deploy lock of the current environment on file descriptor 9 and keeps it until the
# script ends. A manual run waits for a running CI deploy and vice versa, for up to 10 minutes.
# restore.sh and refresh-staging-db.sh take the same lock.
wait_for_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    info "another deploy (or a database restore) of $ENV_NAME is running: waiting for it, up to 10 minutes"
    flock -w 600 9 || die "another deploy or a restore of $ENV_NAME has been running for 10 minutes, giving up"
  fi
}

# Runs a shell command inside the postgres container, where POSTGRES_USER and POSTGRES_DB are set
# and no password is needed. stdin goes to the command: give it < /dev/null when it reads nothing,
# otherwise docker passes the script's own stdin through.
pg_sh() { compose exec -T postgres sh -c "$1"; }

# pg_dump and pg_restore work with a temporary file inside the container, not with a pipe:
# pg_restore cannot always read a dump that was streamed, and a failed dump never reaches the host
# as a half-written file. $POSTGRES_USER and $POSTGRES_DB are expanded inside the container.

# Writes a dump of the database (custom format) to stdout.
pg_dump_stdout() {
  pg_sh 'set -e
    f=$(mktemp)
    trap "rm -f $f" EXIT
    pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --file="$f"
    cat "$f"' < /dev/null
}

# Runs pg_restore with the given options on a dump read from stdin.
#   pg_restore_stdin '<pg_restore options>' < dump
pg_restore_stdin() {
  pg_sh "set -e
    f=\$(mktemp)
    trap \"rm -f \$f\" EXIT
    cat > \"\$f\"
    pg_restore $1 \"\$f\""
}

# Reads the whole backup file the way a restore would, without touching the database.
#   check_backup <file>
check_backup() { pg_restore_stdin '--file=/dev/null' < "$1"; }

# Loads a backup into the empty database of the current environment, in one transaction:
# either the whole backup is loaded or nothing is. Owners and grants of the original database are
# not copied: everything belongs to POSTGRES_USER of this environment.
#   load_backup <file>
load_backup() {
  pg_restore_stdin '--username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-privileges --exit-on-error --single-transaction' \
    < "$1"
}

# True if the database of the current environment has no tables yet: a new, empty volume.
db_is_empty() {
  local tables
  tables="$(pg_sh 'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-align --tuples-only --quiet' <<'SQL'
select count(*) from pg_catalog.pg_tables where schemaname not in ('pg_catalog', 'information_schema');
SQL
)" || die "cannot check whether the $ENV_NAME database is empty"
  [ "$tables" = "0" ]
}

# The newest prod backup, except the copies restore.sh saves before replacing the database:
# such a copy may hold exactly the data that had to be replaced. Empty if there is none.
# Names start with the UTC time, so in sorted order the newest comes last.
latest_prod_backup() {
  local files file latest=""
  shopt -s nullglob
  files=("$BACKUP_DIR"/*.dump)
  shopt -u nullglob
  for file in "${files[@]}"; do
    [[ "${file##*/}" == *_restore_* ]] || latest="$file"
  done
  printf '%s' "$latest"
}

# The env file holds the database password: it must exist and be readable by its owner only.
check_env_file() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing. Create it with POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, OWNER_EMAIL, BETTER_AUTH_SECRET, SMTP_URL (see README)."
  local mode owner
  mode=$(stat -c '%a' "$ENV_FILE")
  owner=$(stat -c '%U' "$ENV_FILE")
  [ "$mode" = "600" ] || die "$ENV_FILE has mode $mode, expected 600. Fix: chmod 600 $ENV_FILE"
  [ "$owner" = "$(id -un)" ] || die "$ENV_FILE belongs to $owner, expected $(id -un)"
}

is_sha() { [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; }

read_version() { [ -f "$1" ] && tr -d '[:space:]' < "$1" || true; }

# Image tag of this project's app container, running or stopped. Empty if there is no container.
# After a failed deploy it differs from current-version: the new container keeps running.
running_version() {
  local image
  image="$(docker ps --all \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
    --filter "label=com.docker.compose.service=app" \
    --format '{{.Image}}' | head -n 1)"
  printf '%s' "${image##*:}"
}

# The app version of the current environment now: the app container's version,
# or the last successful deploy if there is no container. Empty if nothing was ever deployed.
current_app_version() {
  local version
  version="$(running_version)"
  is_sha "$version" || version="$(read_version "$CURRENT_FILE")"
  printf '%s' "$version"
}

# Dumps the prod database to BACKUP_DIR/<UTC time>_<reason>_<app version>.dump
# and reads the whole dump back to make sure it can be restored.
# The postgres service must be running. Sets BACKUP_FILE to the path of the new file.
#   backup_db deploy  <version>  - before a deploy, <version> is the one running before it
#   backup_db restore <version>  - restore.sh saves the current database before replacing it
backup_db() {
  local reason=$1 version=${2:-none}
  local file partial
  [ "$ENV_NAME" = prod ] || die "backups are taken of the prod database only"
  file="$BACKUP_DIR/$(date -u +%Y-%m-%d_%H%M%S)_${reason}_${version}.dump"
  partial="$file.partial"
  [ ! -e "$file" ] || die "backup $file already exists"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  # The dump holds personal data: the file is readable by its owner only (umask 077 -> mode 600).
  # Written under a temporary name, so a broken dump never looks like a finished backup.
  if ! (umask 077 && pg_dump_stdout > "$partial"); then
    rm -f "$partial"
    die "database backup failed"
  fi
  if ! check_backup "$partial"; then
    rm -f "$partial"
    die "the new backup cannot be read back, it was deleted"
  fi
  mv "$partial" "$file"
  BACKUP_FILE="$file"
  info "saved $file ($(du -h "$file" | cut -f1))"
}

# Deletes the oldest backups taken by deploys, keeping KEEP_DEPLOY_BACKUPS of them.
# Names start with the time, so in sorted order the oldest come first.
prune_deploy_backups() {
  local backups i
  shopt -s nullglob
  backups=("$BACKUP_DIR"/*_deploy_*.dump)
  shopt -u nullglob
  for ((i = 0; i < ${#backups[@]} - KEEP_DEPLOY_BACKUPS; i++)); do
    rm -f -- "${backups[i]}"
    info "removed old backup ${backups[i]##*/}"
  done
}

# Deletes this app's images that no environment needs any more. Runs after a successful prod deploy.
# Kept: the current and the previous prod version, the current test stand version,
# and any image a container still uses (docker refuses to delete those).
# Waits for a running test stand deploy first: it may have pulled an image it has not recorded yet.
prune_images() {
  local staging_state="$STAGING_DIR/state" keep tag
  if [ -d "$staging_state" ]; then
    exec 8>"$staging_state/deploy.lock"
    if ! flock -n 8; then
      info "a test stand deploy is running: waiting for it, up to 10 minutes"
      if ! flock -w 600 8; then
        exec 8>&-
        info "the test stand deploy has been running for 10 minutes: cleanup skipped this time"
        return 0
      fi
    fi
  fi
  keep=" $(read_version "$PROD_DIR/state/current-version") $(read_version "$PROD_DIR/state/previous-version") $(read_version "$staging_state/current-version") "
  while read -r tag; do
    is_sha "$tag" || continue
    [[ "$keep" == *" $tag "* ]] && continue
    if docker image rm "$IMAGE_REPO:$tag" >/dev/null 2>&1; then
      info "removed $IMAGE_REPO:$tag"
    else
      info "kept $IMAGE_REPO:$tag: a container still uses it"
    fi
  done < <(docker image ls "$IMAGE_REPO" --format '{{.Tag}}')
  exec 8>&-
  docker image ls "$IMAGE_REPO" --format '    kept {{.Repository}}:{{.Tag}} ({{.Size}})'
}

# GET <url> until it answers 200, for up to 30 seconds.
#   smoke <name to print> <curl arguments...>
smoke() {
  local name=$1; shift
  local code=""
  for _ in $(seq 1 15); do
    code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$@" || true)"
    if [ "$code" = "200" ]; then
      info "$name: 200"
      return 0
    fi
    sleep 2
  done
  info "$name: $code"
  return 1
}

# Smoke test: /health answers 200 both from the app container and through nginx over HTTPS,
# as a visitor would request it. /health also checks that the app reaches the database.
# The test stand asks visitors for a password, but not requests from the server itself, like this one.
check_health() {
  local ok=0
  smoke "app container, http://127.0.0.1:$APP_PORT/health" "http://127.0.0.1:$APP_PORT/health" || ok=1
  smoke "nginx, $APP_URL/health" --resolve "$APP_HOST:443:127.0.0.1" "$APP_URL/health" || ok=1
  return "$ok"
}
