#!/usr/bin/env bash
# Logs of the containers of one environment or of the monitoring, from the server journal (journald), as user deploy.
# The journal keeps the lines of replaced containers too: after a deploy, a rollback, a database restore
# or a restart, the lines of the previous container are still there. journald limits the size of the
# whole journal itself: when it is full, the oldest lines are deleted.
#
# Usage: logs.sh <prod|staging> <app|postgres|postgres-exporter|migrate|seed|all> [journalctl options]
#   app       - the app
#   postgres  - the database
#   postgres-exporter - metrics of the prod database for the monitoring (prod only)
#   migrate   - database migrations, run by every deploy
#   seed      - demo data
#   all       - every container of the environment
# The monitoring of the server (deploy/monitoring, one for both environments):
#        logs.sh monitoring <grafana|prometheus|node-exporter|blackbox|all> [journalctl options]
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
#   logs.sh monitoring grafana -n 50        - Grafana: alerts, emails, sign-ins
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage="usage: logs.sh <prod|staging> <app|postgres|postgres-exporter|migrate|seed|all> [journalctl options]
       logs.sh monitoring <grafana|prometheus|node-exporter|blackbox|all> [journalctl options]"
[ $# -ge 2 ] || die "$usage"
if [ "$1" = monitoring ]; then
  # The compose project of deploy/monitoring/compose.yaml.
  COMPOSE_PROJECT=monitoring
  services="grafana prometheus node-exporter blackbox"
else
  use_env "$1"
  services="app postgres postgres-exporter migrate seed"
fi
service="$2"
shift 2

# Fields that compose.yaml asks Docker to add to every line (logging options, "labels").
match=("COM_DOCKER_COMPOSE_PROJECT=$COMPOSE_PROJECT")
if [ "$service" != all ]; then
  [[ " $services " == *" $service "* ]] || die "unknown container \"$service\". $usage"
  match+=("COM_DOCKER_COMPOSE_SERVICE=$service")
fi

# Docker writes the container logs to the system journal, which only root and the group
# systemd-journal can read. deploy/server-setup/setup.sh adds user deploy to this group.
id -nG | tr ' ' '\n' | grep -qx systemd-journal \
  || die "user $(id -un) cannot read the server journal: it is not in group systemd-journal. Run deploy/server-setup/setup.sh (see README, \"Логи\")"

# --all: show every line as it is. Without it journalctl hides lines with terminal control codes as
# "[74B blob data]", and such a line can matter: the migrations print their result with colors and a spinner.
exec journalctl --no-hostname --all "${match[@]}" "$@"
