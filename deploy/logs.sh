#!/usr/bin/env bash
# Logs of the containers of one environment, from the server journal (journald), as user deploy.
# The journal keeps the lines of replaced containers too: after a deploy, a rollback, a database restore
# or a restart, the lines of the previous container are still there. journald limits the size of the
# whole journal itself: when it is full, the oldest lines are deleted.
#
# Usage: logs.sh <prod|staging> <app|postgres|migrate|seed|all> [journalctl options]
#   app       - the app
#   postgres  - the database
#   migrate   - database migrations, run by every deploy
#   seed      - demo data
#   all       - every container of the environment
# Examples:
#   logs.sh prod app -n 100                 - the last 100 lines of the prod app
#   logs.sh prod app --since -1h            - the last hour
#   logs.sh prod app --since today          - since midnight (server time, Moscow)
#   logs.sh prod app --since 2026-11-12T18:00 --until 2026-11-12T19:00
#   logs.sh prod app --grep Failed          - only lines with this text
# Through ssh, keep every option without spaces (as above): ssh joins the arguments into one line
# and the server splits it at spaces again, whatever the quotes on your side.
#   logs.sh prod app --follow               - new lines as they come, stop with Ctrl+C
#   logs.sh staging migrate -n 50           - migrations of the latest test stand deploys
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage="usage: logs.sh <prod|staging> <app|postgres|migrate|seed|all> [journalctl options]"
[ $# -ge 2 ] || die "$usage"
use_env "$1"
service="$2"
shift 2

# Fields that compose.yaml asks Docker to add to every line (logging options, "labels").
match=("COM_DOCKER_COMPOSE_PROJECT=$COMPOSE_PROJECT")
case "$service" in
  app | postgres | migrate | seed) match+=("COM_DOCKER_COMPOSE_SERVICE=$service") ;;
  all) ;;
  *) die "unknown container \"$service\". $usage" ;;
esac

# Docker writes the container logs to the system journal, which only root and the group
# systemd-journal can read. deploy/server-setup/setup.sh adds user deploy to this group.
id -nG | tr ' ' '\n' | grep -qx systemd-journal \
  || die "user $(id -un) cannot read the server journal: it is not in group systemd-journal. Run deploy/server-setup/setup.sh (see README, \"Логи\")"

# --all: show every line as it is. Without it journalctl hides lines with terminal control codes as
# "[74B blob data]", and such a line can matter: the migrations print their result with colors and a spinner.
exec journalctl --no-hostname --all "${match[@]}" "$@"
