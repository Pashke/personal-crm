#!/usr/bin/env bash
# Runs in GitHub Actions (not on the server): copies the deploy scripts into the folder of one
# environment on the server and starts deploy.sh there for the image of the current commit.
#
# Usage: ci-deploy.sh <prod|staging>
#
# Environment (set by .github/workflows/deploy.yml):
#   DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS  - where to connect, and the server's SSH host key
#   DEPLOY_SSH_KEY                                - private deploy key (GitHub secret)
#   IMAGE_TAG                                     - git commit SHA = image tag
#   REGISTRY_USER, REGISTRY_TOKEN                 - lets the server pull the image from GHCR
set -Eeuo pipefail

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

# The folders of the environments in the home of user deploy: the same as in deploy/lib.sh (use_env).
ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  prod) REMOTE_APP_DIR="personal-crm" ;;
  staging) REMOTE_APP_DIR="personal-crm-staging" ;;
  *) die "usage: ci-deploy.sh <prod|staging>" ;;
esac

for name in DEPLOY_HOST DEPLOY_USER DEPLOY_KNOWN_HOSTS DEPLOY_SSH_KEY IMAGE_TAG REGISTRY_USER REGISTRY_TOKEN; do
  [ -n "${!name:-}" ] || die "$name is not set"
done
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || die "IMAGE_TAG is not a full git commit sha: $IMAGE_TAG"

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh_dir="$(mktemp -d)"
trap 'rm -rf "$ssh_dir"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key"

remote() {
  ssh -i "$ssh_dir/key" \
    -o IdentitiesOnly=yes \
    -o UserKnownHostsFile="$ssh_dir/known_hosts" \
    -o StrictHostKeyChecking=yes \
    -o BatchMode=yes \
    -o ConnectTimeout=20 \
    -o ServerAliveInterval=15 \
    "$DEPLOY_USER@$DEPLOY_HOST" "$@"
}

log "Copying deploy scripts to $DEPLOY_USER@$DEPLOY_HOST:~/$REMOTE_APP_DIR/deploy"
# The whole folder is replaced, so files deleted from the repo disappear from the server too.
# server-setup/ is the one-time root setup, it is not needed for deploys.
# The folder of the environment is created on its first deploy, readable by user deploy only.
tar -C "$DEPLOY_DIR" --exclude=./server-setup --exclude=./ci-deploy.sh -czf - . \
  | remote "set -e
      mkdir -p -m 700 $REMOTE_APP_DIR
      cd $REMOTE_APP_DIR
      rm -rf deploy.new
      mkdir deploy.new
      tar -C deploy.new -xzf -
      rm -rf deploy
      mv deploy.new deploy"

log "Running deploy.sh $ENVIRONMENT on the server"
printf '%s' "$REGISTRY_TOKEN" \
  | remote "bash $REMOTE_APP_DIR/deploy/deploy.sh $ENVIRONMENT $IMAGE_TAG $(printf '%q' "$REGISTRY_USER")"
