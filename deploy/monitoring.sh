#!/usr/bin/env bash
# Updates the monitoring of the server (docker compose project "monitoring", see deploy/monitoring/compose.yaml)
# as user "deploy". Deploy prod runs it after the app deploy, through deploy/ci-deploy.sh monitoring, from the
# copy of deploy/ in /home/deploy/personal-crm-monitoring/deploy. It can also be run there by hand:
#   ssh crm-deploy personal-crm-monitoring/deploy/monitoring.sh
#
# Steps:
#   1. copies deploy/monitoring/ to a new folder config-<UTC time>/ next to .env and checks it
#      (Prometheus and blackbox settings);
#   2. checks the .env of the monitoring: mode 600, every line is there;
#   3. tells the monitoring the time of the newest daily backup;
#   4. starts the containers with the new folder (they are recreated) and waits until they are healthy;
#   5. checks: Prometheus and Grafana answer, the monitoring's own targets are up, every alert rule and
#      the "Сервер и приложение" page are loaded in Grafana;
#   6. deletes older config-* folders and old images of the monitoring that no container uses.
# A failure in steps 1-2 stops it before anything is changed: the running monitoring keeps working.
# Any failure means a non-zero exit code, and the "Update monitoring" step of Deploy prod is red.
# The app is never touched.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
trap 'printf "\nERROR: command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

[ $# -eq 0 ] || die "usage: monitoring.sh (no arguments)"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/monitoring"
MONITORING_ENV_FILE="$MONITORING_DIR/.env"
LOCK_FILE="$MONITORING_DIR/state/update.lock"
REQUIRED_LINES=(ALERT_EMAIL GF_SECURITY_ADMIN_PASSWORD GF_SMTP_PASSWORD)
PROMETHEUS_URL="http://127.0.0.1:9090"
GRAFANA_URL="http://127.0.0.1:3002"
# Grafana trusts this header from 127.0.0.1 (auth proxy): "admin" is its built-in admin, no new user is made.
GRAFANA_AS_ADMIN=(-H "X-WEBAUTH-USER: admin")
# Targets of the monitoring itself: one of them down means the monitoring does not work.
# postgres (the exporter of deploy/compose.yaml) belongs to the app stack: down is only a warning,
# the "База прода не отвечает" alert reports it.
OWN_JOBS=(prometheus node health certs)

# docker compose for the monitoring, with the settings of the folder given by CONFIG_DIR.
monitoring_compose() {
  docker compose -p monitoring \
    --project-directory "$MONITORING_DIR" \
    -f "$CONFIG_DIR/compose.yaml" \
    --env-file "$MONITORING_ENV_FILE" \
    "$@"
}

# The image of one service, as written in compose.yaml (lines "image: <name>:<tag>").
image_of() { sed -n "s|^ *image: *\(.*/$1:[^ ]*\) *$|\1|p" "$SRC_DIR/compose.yaml"; }

# Reading the JSON answers of Prometheus and Grafana (stdin). python3 comes with Ubuntu, jq does not.
# Targets of the given jobs that are not up, one line each: "<job> <address> <health> <error>".
json_down_targets() {
  python3 -c '
import json, sys
jobs = sys.argv[1].split()
for t in json.load(sys.stdin)["data"]["activeTargets"]:
    if t["labels"].get("job") in jobs and t["health"] != "up":
        print(t["labels"]["job"], t["scrapeUrl"], t["health"], t.get("lastError", ""))
' "$1"
}
# "up", "down" or "unknown" for the target of one job; "missing" if there is none.
json_target_health() {
  python3 -c '
import json, sys
found = [t["health"] for t in json.load(sys.stdin)["data"]["activeTargets"] if t["labels"].get("job") == sys.argv[1]]
print(found[0] if found else "missing")
' "$1"
}
# Number of items in a JSON list.
json_length() { python3 -c 'import json, sys; print(len(json.load(sys.stdin)))'; }

[ -d "$SRC_DIR" ] || die "$SRC_DIR is missing"
mkdir -p "$MONITORING_DIR/state"
exec 9>"$LOCK_FILE"
flock -w 600 9 || die "another update of the monitoring has been running for 10 minutes, giving up"

# ---------------------------------------------------------------- settings
log "Settings of the monitoring"
CONFIG_DIR="$MONITORING_DIR/config-$(date -u +%Y%m%d-%H%M%S)"
mkdir "$CONFIG_DIR"
cp -R "$SRC_DIR/." "$CONFIG_DIR/"
# Read by the containers: Prometheus and the exporters run as nobody, Grafana as its own user.
chmod -R a+rX "$CONFIG_DIR"
info "copied to $CONFIG_DIR"

prometheus_image="$(image_of prometheus)"
blackbox_image="$(image_of blackbox-exporter)"
[ -n "$prometheus_image" ] && [ -n "$blackbox_image" ] || die "cannot find the images of Prometheus and blackbox in $SRC_DIR/compose.yaml"
if ! docker run --rm --network none --entrypoint promtool -v "$CONFIG_DIR:/etc/monitoring:ro" \
     "$prometheus_image" check config --syntax-only /etc/monitoring/prometheus.yml; then
  rm -rf "$CONFIG_DIR"
  die "prometheus.yml has errors (see above). Nothing was changed, the running monitoring keeps working"
fi
if ! docker run --rm --network none -v "$CONFIG_DIR:/etc/monitoring:ro" \
     "$blackbox_image" --config.file=/etc/monitoring/blackbox.yml --config.check; then
  rm -rf "$CONFIG_DIR"
  die "blackbox.yml has errors (see above). Nothing was changed, the running monitoring keeps working"
fi
info "prometheus.yml and blackbox.yml: OK"

# ---------------------------------------------------------------- .env
log "The .env of the monitoring"
env_problem=""
if [ ! -f "$MONITORING_ENV_FILE" ]; then
  env_problem="$MONITORING_ENV_FILE is missing. Create it with the lines ${REQUIRED_LINES[*]} (see README, \"Мониторинг\")"
elif [ "$(stat -c '%a' "$MONITORING_ENV_FILE")" != 600 ]; then
  env_problem="$MONITORING_ENV_FILE has mode $(stat -c '%a' "$MONITORING_ENV_FILE"), expected 600. Fix: chmod 600 $MONITORING_ENV_FILE"
elif [ "$(stat -c '%U' "$MONITORING_ENV_FILE")" != "$(id -un)" ]; then
  env_problem="$MONITORING_ENV_FILE belongs to $(stat -c '%U' "$MONITORING_ENV_FILE"), expected $(id -un)"
else
  for name in "${REQUIRED_LINES[@]}"; do
    grep -Eq "^${name}=.+" "$MONITORING_ENV_FILE" \
      || env_problem="${env_problem:+$env_problem; }no line $name= in $MONITORING_ENV_FILE (see README, \"Мониторинг\")"
  done
fi
if [ -n "$env_problem" ]; then
  rm -rf "$CONFIG_DIR"
  die "$env_problem. Nothing was changed, the running monitoring keeps working"
fi
info "all lines are there"

# ---------------------------------------------------------------- the newest daily backup
log "Time of the newest daily backup"
write_backup_metric || info "WARNING: could not write $TEXTFILE_DIR/backup.prom: the backup alert will say \"нет данных\""

# ---------------------------------------------------------------- start
log "Starting the monitoring with $CONFIG_DIR"
export CONFIG_DIR TEXTFILE_DIR
mkdir -p "$TEXTFILE_DIR"
# The path of the settings folder is new, so compose recreates every container that mounts it.
if ! monitoring_compose up --detach --wait --wait-timeout 180 --remove-orphans --quiet-pull; then
  monitoring_compose ps --all || true
  monitoring_compose logs --tail 30 || true
  die "the monitoring did not start (see above). The app is not affected"
fi
info "containers are up and healthy"

# ---------------------------------------------------------------- checks
log "Checks"
problems=0

# The monitoring's own targets: Prometheus scrapes every 30 seconds, so give it up to 90 seconds after the start.
down_own=""
for _ in $(seq 1 30); do
  targets="$(curl -fsS --max-time 5 "$PROMETHEUS_URL/api/v1/targets?state=active" || true)"
  if [ -n "$targets" ]; then
    down_own="$(printf '%s' "$targets" | json_down_targets "${OWN_JOBS[*]}" || echo "cannot read the targets of Prometheus")"
    [ -n "$down_own" ] || break
  fi
  sleep 3
done
if [ -z "$targets" ]; then
  info "Prometheus does not answer on $PROMETHEUS_URL"
  problems=1
elif [ -n "$down_own" ]; then
  info "targets of the monitoring that do not answer:"
  printf '%s\n' "$down_own" | sed 's/^/      /'
  problems=1
else
  info "targets of the monitoring: all up"
fi
postgres_health="$(printf '%s' "$targets" | json_target_health postgres || echo unknown)"
if [ "$postgres_health" = up ]; then
  info "database metrics (postgres-exporter): up"
else
  info "WARNING: database metrics (postgres-exporter of prod) are $postgres_health. See logs.sh prod postgres-exporter"
fi

expected_rules="$(grep -c '^ *- uid: ' "$CONFIG_DIR/grafana/provisioning/alerting/rules.yaml")"
loaded_rules="$(curl -fsS --max-time 10 "${GRAFANA_AS_ADMIN[@]}" "$GRAFANA_URL/api/v1/provisioning/alert-rules" | json_length || echo 0)"
if [ "$loaded_rules" = "$expected_rules" ]; then
  info "alert rules in Grafana: $loaded_rules"
else
  info "alert rules in Grafana: $loaded_rules, expected $expected_rules"
  problems=1
fi
if curl -fsS --max-time 10 -o /dev/null "${GRAFANA_AS_ADMIN[@]}" "$GRAFANA_URL/api/dashboards/uid/server"; then
  info "the \"Сервер и приложение\" page: loaded"
else
  info "the \"Сервер и приложение\" page is not in Grafana"
  problems=1
fi
[ "$problems" = 0 ] || die "the monitoring runs, but not completely (see above)"

# ---------------------------------------------------------------- cleanup
log "Cleanup"
for dir in "$MONITORING_DIR"/config-*; do
  [ "$dir" = "$CONFIG_DIR" ] || { rm -rf "$dir"; info "removed ${dir##*/}"; }
done
# Images of the monitoring (and of postgres-exporter of the app stack) other than the ones in use.
# Images of the app itself are never touched here: prune_images in deploy/lib.sh keeps the ones a rollback needs.
for repo in grafana/grafana prom/prometheus prom/node-exporter prom/blackbox-exporter prometheuscommunity/postgres-exporter; do
  while read -r image; do
    [ -n "$image" ] || continue
    if docker image rm "$image" >/dev/null 2>&1; then
      info "removed the old image $image"
    fi
  done < <(docker image ls "$repo" --format '{{.Repository}}:{{.Tag}}' | grep -vxF -f <(grep -ho "$repo:[^ ]*" "$CONFIG_DIR/compose.yaml" "$(dirname "$SRC_DIR")/compose.yaml") || true)
done

log "MONITORING UPDATED: https://grafana.whobook.ru"
