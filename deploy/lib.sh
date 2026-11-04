# Shared settings and helpers for the server scripts (deploy.sh, rollback.sh, restore.sh, compose.sh).
# Not run on its own: the scripts load it with "source".

IMAGE_REPO="ghcr.io/pashke/personal-crm"
COMPOSE_PROJECT="prod"
APP_HOST="app.whobook.ru"
APP_URL="https://$APP_HOST"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
STATE_DIR="$APP_DIR/state"
# Image tags (git commit SHAs) of the running version and the one before it.
CURRENT_FILE="$STATE_DIR/current-version"
PREVIOUS_FILE="$STATE_DIR/previous-version"

# Database backups. Outside deploy/, so deploys never replace or delete them.
BACKUP_DIR="$APP_DIR/backups"
# Backups taken by deploys are rotated. Copies taken by restore.sh are kept until deleted by hand.
KEEP_DEPLOY_BACKUPS=10

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# docker compose for the production stack. APP_IMAGE must be exported before the call.
compose() {
  docker compose -p "$COMPOSE_PROJECT" \
    --project-directory "$APP_DIR" \
    -f "$APP_DIR/deploy/compose.yaml" \
    --env-file "$ENV_FILE" \
    "$@"
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

# The env file holds the database password: it must exist and be readable by its owner only.
check_env_file() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing. Create it with POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB (see README)."
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

# The app version on the server now: the app container's version,
# or the last successful deploy if there is no container. Empty if nothing was ever deployed.
current_app_version() {
  local version
  version="$(running_version)"
  is_sha "$version" || version="$(read_version "$CURRENT_FILE")"
  printf '%s' "$version"
}

# Dumps the production database to BACKUP_DIR/<UTC time>_<reason>_<app version>.dump
# and reads the whole dump back to make sure it can be restored.
# The postgres service must be running. Sets BACKUP_FILE to the path of the new file.
#   backup_db deploy  <version>  - before a deploy, <version> is the one running before it
#   backup_db restore <version>  - restore.sh saves the current database before replacing it
backup_db() {
  local reason=$1 version=${2:-none}
  local file partial
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
  # Reads the whole dump the way a restore would, without touching the database.
  if ! pg_restore_stdin '--file=/dev/null' < "$partial"; then
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
check_health() {
  local ok=0
  smoke "app container, http://127.0.0.1:3000/health" "http://127.0.0.1:3000/health" || ok=1
  smoke "nginx, $APP_URL/health" --resolve "$APP_HOST:443:127.0.0.1" "$APP_URL/health" || ok=1
  return "$ok"
}
