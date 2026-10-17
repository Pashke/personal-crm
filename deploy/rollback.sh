#!/usr/bin/env bash
# Manual rollback: starts an earlier version of the app again. Never runs automatically.
#
# Usage (on the server as user deploy):
#   rollback.sh          - back to the last good version:
#                          after a failed deploy - the last successfully deployed one,
#                          otherwise - the one before it
#   rollback.sh <sha>    - to a specific version; its image must still be on the server
#
# It runs the normal deploy (migrations, smoke /health) with the older image.
# Database changes made by the newer version are NOT undone: the older version works on the current database.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

current="$(read_version "$CURRENT_FILE")"
running_image="$(docker ps --all \
  --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
  --filter "label=com.docker.compose.service=app" \
  --format '{{.Image}}' | head -n 1)"
running="${running_image##*:}"

if [ -n "${1:-}" ]; then
  target="$1"
elif [ -n "$current" ] && [ "$running" != "$current" ]; then
  # The last deploy failed after starting its container: go back to the last successful version.
  target="$current"
else
  target="$(read_version "$PREVIOUS_FILE")"
fi
[ -n "$target" ] || die "no earlier version is recorded in $STATE_DIR"
is_sha "$target" || die "not a full git commit sha: $target"
docker image inspect "$IMAGE_REPO:$target" >/dev/null 2>&1 \
  || die "image $IMAGE_REPO:$target is not on the server. Kept images:
$(docker image ls "$IMAGE_REPO" --format '    {{.Tag}}')"

[ "$target" != "$running" ] || die "version $target is already running"

log "Rolling back: ${running:-nothing running} -> $target"
exec bash "$APP_DIR/deploy/deploy.sh" "$target" < /dev/null
