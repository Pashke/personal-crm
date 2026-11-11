#!/usr/bin/env bash
# docker compose for one environment, for manual commands on the server (as user deploy).
# Uses the right project, files, settings and the image of the version that is running now.
#
# Usage: compose.sh <prod|staging> <docker compose arguments>
# Examples:
#   compose.sh prod ps                         - containers of prod and their state
#   compose.sh staging logs --tail 100 app     - recent app logs of the test stand
#   compose.sh prod run --rm seed              - fill an empty database with test contacts
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -ge 1 ] || die "usage: compose.sh <prod|staging> <docker compose arguments>"
use_env "$1"
shift

current="$(read_version "$CURRENT_FILE")"
[ -n "$current" ] || die "no version has been deployed to $ENV_NAME yet ($CURRENT_FILE is empty)"
export APP_IMAGE="$IMAGE_REPO:$current"

compose "$@"
