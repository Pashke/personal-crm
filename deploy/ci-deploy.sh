#!/usr/bin/env bash
# Runs in GitHub Actions (not on the server): copies the deploy scripts into the folder of one
# environment on the server and runs the deploy there.
#
# Usage:
#   ci-deploy.sh staging        - Deploy staging: the image of the current commit (IMAGE_TAG) to the test stand
#   ci-deploy.sh prod           - Deploy prod: picks the version (see pick_prod_version), checks that it passed
#                                 the test stand, deploys it to prod
#   ci-deploy.sh prod-rollback  - Deploy prod with the rollback box: the prod version before the current one,
#                                 which the server remembers (rollback.sh); no test stand check
# The prod modes write to the run summary which version was deployed.
#
# Environment (set by the workflows):
#   DEPLOY_HOST, DEPLOY_USER, DEPLOY_KNOWN_HOSTS  - where to connect, and the server's SSH host key
#   DEPLOY_SSH_KEY                                - private deploy key (GitHub secret)
#   REGISTRY_USER, REGISTRY_TOKEN                 - lets the server pull the image from GHCR
#   IMAGE_TAG                                     - staging: git commit SHA = image tag
#   INPUT_SHA                                     - prod: the SHA field of Deploy prod, may be empty
#   GH_TOKEN                                      - prod: reads the Deploy staging history and commits with gh
#   GITHUB_REF, GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_STEP_SUMMARY - set by GitHub Actions
set -Eeuo pipefail

# In GitHub Actions the error also shows on the page of the run.
die() { [ "${GITHUB_ACTIONS:-}" != true ] || printf '::error::%s\n' "$*"; printf '\nERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

# The folders of the environments in the home of user deploy: the same as in deploy/lib.sh (use_env).
MODE="${1:-}"
case "$MODE" in
  staging) ENVIRONMENT=staging; REMOTE_APP_DIR="personal-crm-staging" ;;
  prod | prod-rollback) ENVIRONMENT=prod; REMOTE_APP_DIR="personal-crm" ;;
  *) die "usage: ci-deploy.sh <staging|prod|prod-rollback>" ;;
esac

# Successful runs of this workflow on main are the history of the test stand: only their commits go to prod.
STAGING_WORKFLOW="deploy-staging.yml"

# Only main is deployed: a run started from another branch would bring that branch's deploy scripts.
[ "${GITHUB_REF:-}" = "refs/heads/main" ] \
  || die "deploys run from main only, this run is on ${GITHUB_REF:-an unknown ref}. Start it again from main"

for name in DEPLOY_HOST DEPLOY_USER DEPLOY_KNOWN_HOSTS DEPLOY_SSH_KEY REGISTRY_USER REGISTRY_TOKEN; do
  [ -n "${!name:-}" ] || die "$name is not set"
done

summary() { [ -z "${GITHUB_STEP_SUMMARY:-}" ] || printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"; }
commit_url() { printf '%s/%s/commit/%s' "${GITHUB_SERVER_URL:-https://github.com}" "$GITHUB_REPOSITORY" "$1"; }
# "[`abc1234`](link) first line of the commit message", or just the SHA if GitHub does not answer.
commit_ref() {
  local title
  title="$(gh api "repos/$GITHUB_REPOSITORY/commits/$1" --jq '.commit.message | split("\n")[0]' 2>/dev/null || true)"
  printf '[`%s`](%s) %s' "${1:0:7}" "$(commit_url "$1")" "$title"
}

# Sets IMAGE_TAG (full SHA), CHOSEN_HOW and STAGING_RUN_URL from the SHA field of Deploy prod.
# Dies, before anything on the server is touched, if the commit has not passed the test stand.
pick_prod_version() {
  local sha run
  sha="$(printf '%s' "${INPUT_SHA:-}" | tr -d '[:space:]' | tr 'A-F' 'a-f')"
  if [ -z "$sha" ]; then
    run="$(gh run list --repo "$GITHUB_REPOSITORY" --workflow "$STAGING_WORKFLOW" --branch main --status success \
      --limit 1 --json headSha,url --jq '.[] | "\(.headSha) \(.url)"')" \
      || die "cannot read the history of Deploy staging from GitHub. Nothing was deployed"
    [ -n "$run" ] || die "there is no successful Deploy staging run on main yet: nothing has passed the test stand"
    IMAGE_TAG="${run%% *}"
    STAGING_RUN_URL="${run#* }"
    CHOSEN_HOW="the latest version that passed the test stand (the SHA field was empty)"
  else
    [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || die "the SHA field must be a commit SHA (7 to 40 hex characters), got: $INPUT_SHA"
    IMAGE_TAG="$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha" --jq .sha 2>/dev/null)" \
      || die "commit $sha is not found in $GITHUB_REPOSITORY. Nothing was deployed"
    STAGING_RUN_URL="$(gh run list --repo "$GITHUB_REPOSITORY" --workflow "$STAGING_WORKFLOW" --branch main \
      --status success --commit "$IMAGE_TAG" --limit 1 --json url --jq '.[].url')" \
      || die "cannot read the history of Deploy staging from GitHub. Nothing was deployed"
    [ -n "$STAGING_RUN_URL" ] \
      || die "commit $IMAGE_TAG has not passed the test stand: it has no successful Deploy staging run on main. Nothing was deployed"
    CHOSEN_HOW="the SHA given by hand"
  fi
  [[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || die "not a full commit SHA: $IMAGE_TAG"
}

case "$MODE" in
  staging)
    [[ "${IMAGE_TAG:-}" =~ ^[0-9a-f]{40}$ ]] || die "IMAGE_TAG is not a full git commit sha: ${IMAGE_TAG:-}"
    ;;
  prod)
    log "Picking the version for prod"
    pick_prod_version
    printf '    %s: %s\n    passed the test stand: %s\n' "$CHOSEN_HOW" "$IMAGE_TAG" "$STAGING_RUN_URL"
    ;;
esac

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh_dir="$(mktemp -d)"
# Until the prod deploy finishes, the run summary says it failed.
finished=0
on_exit() {
  rm -rf "$ssh_dir"
  if [ "$ENVIRONMENT" = prod ] && [ "$finished" = 0 ] && [ "${summary_started:-0}" = 1 ]; then
    summary "- **Result: FAILED**, see the log of this step. Nothing was rolled back."
  fi
}
trap on_exit EXIT
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
# The version the server has recorded as running on prod (empty if none).
prod_version() { remote "cat $REMOTE_APP_DIR/state/current-version 2>/dev/null || true" < /dev/null | tr -d '[:space:]'; }

if [ "$ENVIRONMENT" = prod ]; then
  before="$(prod_version)"
  if [ "$MODE" = prod ]; then
    summary "### Deploy to prod: \`$IMAGE_TAG\`" "" \
      "- Commit: $(commit_ref "$IMAGE_TAG")" \
      "- Chosen: $CHOSEN_HOW" \
      "- Passed the test stand: $STAGING_RUN_URL" \
      "- Prod before: \`${before:-none}\`"
  else
    summary "### Rollback of prod" "" "- Prod before: \`${before:-none}\`"
  fi
  summary_started=1
fi

log "Copying deploy scripts to $DEPLOY_USER@$DEPLOY_HOST:~/$REMOTE_APP_DIR/deploy"
# The whole folder is replaced, so files deleted from the repo disappear from the server too.
# server-setup/ is the one-time root setup and ci-*.sh run in GitHub Actions: neither is needed on the server.
# The folder of the environment is created on its first deploy, readable by user deploy only.
tar -C "$DEPLOY_DIR" --exclude=./server-setup --exclude='./ci-*.sh' -czf - . \
  | remote "set -e
      mkdir -p -m 700 $REMOTE_APP_DIR
      cd $REMOTE_APP_DIR
      rm -rf deploy.new
      mkdir deploy.new
      tar -C deploy.new -xzf -
      rm -rf deploy
      mv deploy.new deploy"

if [ "$MODE" = prod-rollback ]; then
  log "Running rollback.sh on the server"
  remote "bash $REMOTE_APP_DIR/deploy/rollback.sh" < /dev/null
else
  log "Running deploy.sh $ENVIRONMENT on the server"
  printf '%s' "$REGISTRY_TOKEN" \
    | remote "bash $REMOTE_APP_DIR/deploy/deploy.sh $ENVIRONMENT $IMAGE_TAG $(printf '%q' "$REGISTRY_USER")"
fi

if [ "$ENVIRONMENT" = prod ]; then
  after="$(prod_version)"
  [ "$MODE" = prod ] || summary "- Rolled back to: $(commit_ref "$after")"
  summary "- **Result: prod runs \`$after\`**"
  log "Prod runs $after"
fi
finished=1
