#!/usr/bin/env bash
# docker compose for the production stack, for manual commands on the server (as user deploy).
# Uses the right project ("prod"), files and the image of the version that is running now.
#
# Examples:
#   compose.sh ps                      - containers and their state
#   compose.sh logs --tail 100 app     - recent app logs
#   compose.sh run --rm seed           - fill an empty database with test contacts
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

current="$(read_version "$CURRENT_FILE")"
[ -n "$current" ] || die "no version has been deployed yet ($CURRENT_FILE is empty)"
export APP_IMAGE="$IMAGE_REPO:$current"

compose "$@"
