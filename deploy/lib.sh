# Shared settings and helpers for the server scripts (deploy.sh, rollback.sh, compose.sh).
# Not run on its own: the scripts load it with "source".

IMAGE_REPO="ghcr.io/pashke/personal-crm"
COMPOSE_PROJECT="prod"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
STATE_DIR="$APP_DIR/state"
# Image tags (git commit SHAs) of the running version and the one before it.
CURRENT_FILE="$STATE_DIR/current-version"
PREVIOUS_FILE="$STATE_DIR/previous-version"

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
