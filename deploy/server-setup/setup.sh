#!/usr/bin/env bash
# One-time server setup for personal-crm:
#   Docker (container ports only on 127.0.0.1, log size limits),
#   user "deploy" that runs the app containers (GitHub Actions logs in as this user),
#   nginx: a stub page for the landing, the app proxied to its container,
#   one HTTPS certificate for both domains (certbot, renewal by systemd timer).
# Safe to run again: finished steps are skipped, files not created by this script are not touched.
#
# Usage (as root): bash setup.sh <letsencrypt-email>
# SSH keys for user deploy are taken from deploy-authorized_keys next to this script
# (uploaded separately, not stored in git). Without that file existing keys are kept.
set -Eeuo pipefail

LANDING_DOMAIN="whobook.ru"
APP_DOMAIN="app.whobook.ru"
DEPLOY_USER="deploy"
DEPLOY_HOME="/home/$DEPLOY_USER"
APP_DIR="$DEPLOY_HOME/personal-crm"
CERT_NAME="whobook.ru"
EXPECTED_IP="153.76.175.142"
ACME_ROOT="/var/www/letsencrypt"
# Files that carry this marker belong to this script and may be overwritten by it.
MARKER="managed-by: personal-crm deploy/server-setup"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL="${1:-}"
APT="apt-get -y -q -o DPkg::Lock::Timeout=300"

export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
trap 'printf "\nERROR: command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

# Install a file only if it is absent or was created by this script before.
install_managed() {
  local src=$1 dst=$2
  if [ -e "$dst" ] && ! grep -qF "$MARKER" "$dst"; then
    info "SKIP $dst: exists and was not created by this script"
    return 0
  fi
  install -m 0644 "$src" "$dst"
  info "installed $dst"
}

is_managed() { [ -f "$1" ] && grep -qF "$MARKER" "$1"; }

# ---------------------------------------------------------------- checks
[ "$(id -u)" -eq 0 ] || die "run as root: sudo bash $0 <letsencrypt-email>"
[ -n "$EMAIL" ] || die "usage: sudo bash $0 <letsencrypt-email>"
case "$EMAIL" in *?@?*.?*) ;; *) die "not an email address: $EMAIL" ;; esac

log "DNS"
for d in "$LANDING_DOMAIN" "$APP_DOMAIN"; do
  ips=$(getent ahostsv4 "$d" | awk '{print $1}' | sort -u | xargs || true)
  [ "$ips" = "$EXPECTED_IP" ] || die "$d resolves to '$ips', expected $EXPECTED_IP. Fix the DNS A record first."
  info "$d -> $ips"
done

# ---------------------------------------------------------------- docker
log "Docker"
if ! command -v docker >/dev/null 2>&1; then
  conflicts=$(dpkg-query -W -f='${Package} ${db:Status-Status}\n' \
    docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc 2>/dev/null \
    | awk '$2 == "installed" {print $1}' || true)
  [ -z "$conflicts" ] || die "packages that conflict with Docker CE are installed: $conflicts. Remove them by hand first."

  # Official Docker apt repository: https://docs.docker.com/engine/install/ubuntu/
  $APT update
  $APT install ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  $APT update
  $APT install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  info "installed"
else
  info "already installed"
fi

install -d -m 0755 /etc/docker
if ! cmp -s "$SRC_DIR/docker/daemon.json" /etc/docker/daemon.json 2>/dev/null; then
  if [ -f /etc/docker/daemon.json ]; then
    backup="/etc/docker/daemon.json.bak-$(date +%Y%m%d-%H%M%S)"
    cp /etc/docker/daemon.json "$backup"
    info "previous daemon.json saved as $backup"
  fi
  install -m 0644 "$SRC_DIR/docker/daemon.json" /etc/docker/daemon.json
  systemctl restart docker
  info "daemon.json installed, docker restarted"
else
  info "daemon.json is up to date"
fi
systemctl enable --now docker >/dev/null 2>&1

# Prove that published ports stay on 127.0.0.1: one container via "docker run" (default network)
# and one via docker compose (its own network). Both stop by themselves in 15 minutes.
log "Docker: published ports must bind to 127.0.0.1 only"
TEST_IMG=""
for img in busybox:stable mirror.gcr.io/library/busybox:stable; do
  if docker pull -q "$img" >/dev/null 2>&1; then TEST_IMG="$img"; break; fi
  info "could not pull $img"
done
[ -n "$TEST_IMG" ] || die "cannot pull a test image from Docker Hub or its mirror"
info "test image: $TEST_IMG"

TEST_DIR=/root/crm-bind-test
install -d -m 0700 "$TEST_DIR"
cat > "$TEST_DIR/compose.yaml" <<EOF
services:
  web:
    image: $TEST_IMG
    command: ["timeout", "900", "httpd", "-f", "-p", "8080"]
    ports:
      - "18081:8080"
EOF
docker rm -f crm-bind-test-run >/dev/null 2>&1 || true
docker run -d --rm --name crm-bind-test-run -p 18080:8080 "$TEST_IMG" timeout 900 httpd -f -p 8080 >/dev/null
docker compose -p crm-bind-test -f "$TEST_DIR/compose.yaml" up -d --quiet-pull >/dev/null
sleep 2

bind_run=$(docker port crm-bind-test-run 8080/tcp | xargs)
bind_compose=$(docker compose -p crm-bind-test -f "$TEST_DIR/compose.yaml" port web 8080 | xargs)
info "docker run     -p 18080:8080 -> $bind_run"
info "docker compose    18081:8080 -> $bind_compose"
for b in $bind_run $bind_compose; do
  case "$b" in 127.0.0.1:*) ;; *) die "a container port is published on $b, not only on 127.0.0.1" ;; esac
done
for p in 18080 18081; do
  curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$p/" || die "test container on 127.0.0.1:$p does not answer"
  if curl -s -o /dev/null --max-time 3 "http://$EXPECTED_IP:$p/"; then die "port $p answers on the public IP"; fi
  info "port $p: answers on 127.0.0.1, not on $EXPECTED_IP"
done
systemd-run --quiet --on-active=16min --unit="crm-bind-test-cleanup-$(date +%s)" /bin/sh -c \
  "docker compose -p crm-bind-test -f $TEST_DIR/compose.yaml down; docker rm -f crm-bind-test-run; docker image rm $TEST_IMG; rm -rf $TEST_DIR"
info "test containers stay up for 15 minutes for an outside check, then are removed"

# ---------------------------------------------------------------- deploy user
# GitHub Actions logs in as this user to deploy the app. It has no password and no sudo,
# only SSH keys and the docker group. Note: access to Docker is effectively root access.
log "Deploy user"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --user-group --shell /bin/bash "$DEPLOY_USER"
  info "created user $DEPLOY_USER (no password: SSH key login only)"
else
  info "user $DEPLOY_USER already exists"
fi
if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
  info "$DEPLOY_USER is in the docker group"
else
  usermod -aG docker "$DEPLOY_USER"
  info "added $DEPLOY_USER to the docker group"
fi

install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh" "$APP_DIR"
if [ -f "$SRC_DIR/deploy-authorized_keys" ]; then
  install -m 0600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
    "$SRC_DIR/deploy-authorized_keys" "$DEPLOY_HOME/.ssh/authorized_keys"
  info "installed $DEPLOY_HOME/.ssh/authorized_keys:"
  ssh-keygen -lf "$DEPLOY_HOME/.ssh/authorized_keys" | sed 's/^/      /'
elif [ -s "$DEPLOY_HOME/.ssh/authorized_keys" ]; then
  info "no deploy-authorized_keys next to the script: existing keys of $DEPLOY_USER are kept"
else
  die "no SSH keys for $DEPLOY_USER: put deploy-authorized_keys next to this script and run it again"
fi
info "app folder: $APP_DIR (database credentials go to $APP_DIR/.env, mode 600)"

# ---------------------------------------------------------------- nginx
log "nginx"
if ! command -v nginx >/dev/null 2>&1; then
  $APT install nginx
  info "installed"
else
  info "already installed"
fi
systemctl enable --now nginx >/dev/null 2>&1

# The package's own default site also claims "default_server" on port 80; our catch-all replaces it.
if [ -L /etc/nginx/sites-enabled/default ] \
   && [ "$(readlink -f /etc/nginx/sites-enabled/default)" = /etc/nginx/sites-available/default ]; then
  rm /etc/nginx/sites-enabled/default
  info "disabled the package's default site (the file stays in sites-available)"
fi

install -d -m 0755 /etc/nginx/snippets "$ACME_ROOT"
install_managed "$SRC_DIR/nginx/snippets/whobook-acme.conf" /etc/nginx/snippets/whobook-acme.conf
install_managed "$SRC_DIR/nginx/snippets/whobook-ssl.conf" /etc/nginx/snippets/whobook-ssl.conf
install_managed "$SRC_DIR/nginx/sites/00-default.conf" /etc/nginx/sites-available/00-default.conf
is_managed /etc/nginx/sites-available/00-default.conf \
  && ln -sfn /etc/nginx/sites-available/00-default.conf /etc/nginx/sites-enabled/00-default.conf

for site in "$LANDING_DOMAIN" "$APP_DOMAIN"; do
  install_managed "$SRC_DIR/nginx/sites/$site.conf" "/etc/nginx/sites-available/$site.conf"
  install -d -m 0755 "/var/www/$site"
  install_managed "$SRC_DIR/stubs/$site/index.html" "/var/www/$site/index.html"
done
install_managed "$SRC_DIR/stubs/$APP_DOMAIN/unavailable.html" "/var/www/$APP_DOMAIN/unavailable.html"

nginx -t -q
systemctl reload nginx

# ---------------------------------------------------------------- certificate
log "certbot"
if ! command -v certbot >/dev/null 2>&1; then
  $APT install certbot
  info "installed"
else
  info "already installed"
fi
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
install -m 0755 "$SRC_DIR/certbot/reload-nginx.sh" /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

if [ ! -f "/etc/letsencrypt/live/$CERT_NAME/fullchain.pem" ]; then
  log "Getting the certificate for $LANDING_DOMAIN and $APP_DOMAIN"
  # The HTTPS sites need the certificate to start, so first serve only the Let's Encrypt check over HTTP.
  install -m 0644 "$SRC_DIR/nginx/bootstrap.conf" /etc/nginx/sites-available/whobook-bootstrap.conf
  ln -sfn /etc/nginx/sites-available/whobook-bootstrap.conf /etc/nginx/sites-enabled/whobook-bootstrap.conf
  nginx -t -q
  systemctl reload nginx

  certbot certonly --webroot -w "$ACME_ROOT" \
    --cert-name "$CERT_NAME" -d "$LANDING_DOMAIN" -d "$APP_DOMAIN" \
    --email "$EMAIL" --agree-tos --no-eff-email --non-interactive
else
  info "certificate $CERT_NAME already exists"
fi
rm -f /etc/nginx/sites-enabled/whobook-bootstrap.conf /etc/nginx/sites-available/whobook-bootstrap.conf

log "Enabling HTTPS sites"
for site in "$LANDING_DOMAIN" "$APP_DOMAIN"; do
  if is_managed "/etc/nginx/sites-available/$site.conf"; then
    ln -sfn "/etc/nginx/sites-available/$site.conf" "/etc/nginx/sites-enabled/$site.conf"
    info "enabled $site"
  else
    info "SKIP $site: its config was not created by this script"
  fi
done
nginx -t -q
systemctl reload nginx

log "Renewal"
systemctl enable --now certbot.timer >/dev/null 2>&1
systemctl list-timers certbot.timer --no-pager || true
certbot renew --dry-run --cert-name "$CERT_NAME" -q
info "renewal dry run: OK"

# ---------------------------------------------------------------- summary
log "Summary"
info "docker:  $(docker --version)"
info "compose: $(docker compose version --short)"
info "nginx:   $(nginx -v 2>&1)"
info "certbot: $(certbot --version 2>&1)"
certbot certificates --cert-name "$CERT_NAME" 2>/dev/null | grep -E 'Domains|Expiry' | sed 's/^ */    /' || true
for d in "$LANDING_DOMAIN" "$APP_DOMAIN"; do
  http=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --resolve "$d:80:127.0.0.1" "http://$d/" || true)
  https=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$d:443:127.0.0.1" "https://$d/" || true)
  info "$d: http -> $http | https -> $https"
done
echo
echo "DONE"
