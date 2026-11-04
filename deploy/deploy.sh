#!/usr/bin/env bash
# Deploys one version of the app on the server, as user "deploy":
#   database backup -> image -> migrations (one-off container) -> new app container -> smoke /health -> cleanup.
# GitHub Actions calls it through deploy/ci-deploy.sh on every push to main.
# It can also be run by hand with an older version: that is how rollback.sh works.
#
# Usage: deploy.sh <git-commit-sha> [registry-user]
#   If the image is not on the server yet, a GHCR token is read from stdin to pull it.
#
# Any failure stops the script with a non-zero exit code. There is no automatic rollback:
#   - backup failed     -> nothing was changed, the old version keeps running;
#   - migrations failed -> the new version is not started, the old one keeps running;
#   - smoke failed      -> the new version is already started; roll back by hand (rollback.sh).
# The database can be put back from the backup by hand only, with restore.sh.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'printf "\nERROR: command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

TAG="${1:-}"
REGISTRY_USER="${2:-deploy}"
is_sha "$TAG" || die "usage: deploy.sh <full 40-character git commit sha> [registry-user]"
IMAGE="$IMAGE_REPO:$TAG"

# One deploy at a time: a manual run waits for a running CI deploy and vice versa.
# restore.sh takes the same lock, so a deploy also waits for a running restore.
mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -w 600 9 || die "another deploy or a restore has been running for 10 minutes, giving up"

log "Deploying $TAG"
check_env_file
# compose needs the app image name even for commands that only touch postgres.
# Starting postgres does not pull the app image.
export APP_IMAGE="$IMAGE"

# ---------------------------------------------------------------- database backup
before="$(current_app_version)"
log "Database backup (app version before this deploy: ${before:-none})"
# stdin may hold the GHCR token for the image step below: nothing here may read it.
compose up --detach --wait postgres < /dev/null
backup_db deploy "${before:-none}"
prune_deploy_backups

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
  die "smoke test failed: version $TAG is running but /health does not answer 200. Nothing was rolled back"
fi

# ---------------------------------------------------------------- record versions
current="$(read_version "$CURRENT_FILE")"
if [ "$current" != "$TAG" ]; then
  [ -z "$current" ] || printf '%s\n' "$current" > "$PREVIOUS_FILE"
  printf '%s\n' "$TAG" > "$CURRENT_FILE"
fi
previous="$(read_version "$PREVIOUS_FILE")"
log "Versions"
info "current:  $TAG"
info "previous: ${previous:-none}"

# ---------------------------------------------------------------- cleanup
# Keep only the images of the current and the previous version, so the disk does not fill up.
# Only this app's images are touched.
log "Cleanup: keeping only the current and the previous image"
while read -r tag; do
  if is_sha "$tag" && [ "$tag" != "$TAG" ] && [ "$tag" != "$previous" ]; then
    docker image rm "$IMAGE_REPO:$tag" >/dev/null
    info "removed $IMAGE_REPO:$tag"
  fi
done < <(docker image ls "$IMAGE_REPO" --format '{{.Tag}}')
docker image ls "$IMAGE_REPO" --format '    kept {{.Repository}}:{{.Tag}} ({{.Size}})'

log "DEPLOYED $TAG"
