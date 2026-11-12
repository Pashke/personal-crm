#!/usr/bin/env bash
# Deploys one version of the app to one environment on the server, as user "deploy":
#   prod:    database backup -> image -> migrations (one-off container) -> new app container -> smoke /health
#            -> cleanup of images older than 2 weeks that no environment needs;
#   staging: (database still empty: load a copy of the newest prod backup) -> image -> migrations
#            -> new app container -> smoke /health. No backup.
# GitHub Actions calls it through deploy/ci-deploy.sh: the test stand on every push to main (Deploy staging),
# prod only when you run Deploy prod. It can also be run with an older version: that is how rollback.sh works.
#
# Usage: deploy.sh <prod|staging> <git-commit-sha> [registry-user]
#   If the image is not on the server yet, a GHCR token is read from stdin to pull it.
#
# Any failure stops the script with a non-zero exit code. There is no automatic rollback:
#   - backup failed     -> nothing was changed, the old version keeps running;
#   - migrations failed -> the new version is not started, the old one keeps running;
#   - smoke failed      -> the new version is already started; roll back by hand
#                          (prod: Deploy prod with the rollback box; staging: deploy.sh staging <older sha>).
# The prod database can be put back from a backup by hand only, with restore.sh.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'printf "\nERROR: command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

usage="usage: deploy.sh <prod|staging> <full 40-character git commit sha> [registry-user]"
[ $# -ge 2 ] || die "$usage"
use_env "$1"
TAG="$2"
REGISTRY_USER="${3:-deploy}"
is_sha "$TAG" || die "$usage"
IMAGE="$IMAGE_REPO:$TAG"

# One deploy at a time per environment. restore.sh and refresh-staging-db.sh take the same lock,
# so a deploy also waits for them.
wait_for_lock

log "Deploying $TAG to $ENV_NAME ($APP_URL)"
check_env_file
# compose needs the app image name even for commands that only touch postgres.
# Starting postgres does not pull the app image.
export APP_IMAGE="$IMAGE"

# ---------------------------------------------------------------- database
# stdin may hold the GHCR token for the image step below: nothing here may read it.
if [ "$ENV_NAME" = prod ]; then
  before="$(current_app_version)"
  log "Database backup (app version before this deploy: ${before:-none})"
  compose up --detach --wait postgres < /dev/null
  backup_db deploy "${before:-none}"
  prune_deploy_backups
else
  log "Database (no backup on the test stand)"
  compose up --detach --wait postgres < /dev/null
  if db_is_empty; then
    # A new test stand, or its database volume was deleted: it gets a copy of prod.
    # Nothing is deleted here, the database is empty.
    backup="$(latest_prod_backup)"
    [ -n "$backup" ] || die "the $ENV_NAME database is empty and there is no prod backup in $BACKUP_DIR to copy into it"
    info "the database is empty: loading a copy of the newest prod backup ${backup##*/}"
    check_backup "$backup" || die "$backup is damaged and was not loaded. Nothing was changed"
    load_backup "$backup"
    info "loaded"
  else
    info "keeps its data. A fresh copy of prod: refresh-staging-db.sh (see README)"
  fi
fi

# ---------------------------------------------------------------- image
log "Image $IMAGE"
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  info "already on the server"
else
  [ ! -t 0 ] || die "the image is not on the server; pass a GHCR token on stdin to pull it"
  token="$(cat)"
  [ -n "$token" ] || die "the image is not on the server and no GHCR token was given on stdin"
  # Log in with a throwaway docker config, so the token is never stored on the server.
  docker_config="$(mktemp -d)"
  trap 'rm -rf "$docker_config"' EXIT
  printf '%s' "$token" | DOCKER_CONFIG="$docker_config" docker login ghcr.io -u "$REGISTRY_USER" --password-stdin >/dev/null
  DOCKER_CONFIG="$docker_config" docker pull --quiet "$IMAGE"
  rm -rf "$docker_config"
  info "pulled"
fi

# ---------------------------------------------------------------- migrations
log "Migrations (one-off container from the new image)"
if ! compose run --rm migrate; then
  die "migrations failed: the new version was NOT started, the previous one keeps running"
fi

# ---------------------------------------------------------------- new version
log "Starting the new version"
if ! compose up --detach --wait --wait-timeout 120 app; then
  compose logs --tail 50 app || true
  die "the new app container did not become healthy. Smoke is red, nothing was rolled back"
fi
running="$(docker inspect --format '{{.Config.Image}}' "$(compose ps --quiet app)")"
[ "$running" = "$IMAGE" ] || die "the app container runs $running instead of $IMAGE"
info "app container runs $running"

# ---------------------------------------------------------------- smoke
log "Smoke test: GET /health"
if ! check_health; then
  compose logs --tail 50 app || true
  die "smoke test failed: version $TAG is running on $ENV_NAME but /health does not answer 200. Nothing was rolled back"
fi

# ---------------------------------------------------------------- record versions
current="$(read_version "$CURRENT_FILE")"
if [ "$current" != "$TAG" ]; then
  [ -z "$current" ] || printf '%s\n' "$current" > "$PREVIOUS_FILE"
  printf '%s\n' "$TAG" > "$CURRENT_FILE"
fi
previous="$(read_version "$PREVIOUS_FILE")"
log "Versions on $ENV_NAME"
info "current:  $TAG"
info "previous: ${previous:-none}"

# ---------------------------------------------------------------- cleanup
# Prod and the test stand share the images. Only a prod deploy cleans up, so the disk does not fill up.
if [ "$ENV_NAME" = prod ]; then
  log "Cleanup: images no environment needs"
  prune_images
fi

log "DEPLOYED $TAG to $ENV_NAME"
