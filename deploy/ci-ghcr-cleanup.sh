#!/usr/bin/env bash
# Runs in GitHub Actions after a successful Deploy prod: keeps the 10 newest builds of the app image in GHCR.
#
# A build is an image index tagged with the commit SHA plus the untagged manifests it points to
# (the image itself and its provenance attestation). In GHCR each of them is a separate package version.
# Deleted: the builds older than the 10 newest, whole (the tagged index and its parts), and untagged
# leftovers older than the oldest kept build. The parts of the kept builds are never deleted.
# The server keeps its own copies of the images it runs, so this never breaks prod or the test stand.
#
# Usage:
#   ci-ghcr-cleanup.sh             - deletes
#   DRY_RUN=1 ci-ghcr-cleanup.sh   - only prints what it would delete
# Environment:
#   GH_TOKEN                       - GitHub API: packages write (read is enough with DRY_RUN=1); from gh's login if unset
#   REGISTRY_USER, REGISTRY_TOKEN  - optional: GHCR login to read the builds; without them, anonymous (public package)
set -Eeuo pipefail

OWNER="Pashke"
PACKAGE="personal-crm"
REPOSITORY="pashke/personal-crm"
KEEP_BUILDS=10
VERSIONS_API="users/$OWNER/packages/container/$PACKAGE/versions"
DRY_RUN="${DRY_RUN:-0}"

die()  { [ "${GITHUB_ACTIONS:-}" != true ] || printf '::error::%s\n' "$*"; printf '\nERROR: %s\n' "$*" >&2; exit 1; }
log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
summary() { [ -z "${GITHUB_STEP_SUMMARY:-}" ] || printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"; }

# ---------------------------------------------------------------- versions of the package
# One line per version: id <TAB> digest <TAB> created_at <TAB> tags (comma-separated, empty if untagged).
log "Versions of $OWNER/$PACKAGE in GHCR"
versions="$(gh api --paginate "$VERSIONS_API?per_page=100" \
  --jq '.[] | [(.id | tostring), .name, .created_at, (.metadata.container.tags | join(","))] | @tsv')" \
  || die "cannot list the versions of the package"
[ -n "$versions" ] || die "the package has no versions"
# Builds: tagged versions, the newest first. ISO times sort as text.
mapfile -t builds < <(awk -F'\t' '$4 != ""' <<< "$versions" | sort -t $'\t' -k3,3r)
info "$(wc -l <<< "$versions") versions, ${#builds[@]} builds"
if [ "${#builds[@]}" -le "$KEEP_BUILDS" ]; then
  info "not more than $KEEP_BUILDS builds: nothing to delete"
  summary "GHCR: ${#builds[@]} builds, not more than $KEEP_BUILDS, nothing deleted."
  exit 0
fi

# ---------------------------------------------------------------- what the kept builds consist of
if [ -n "${REGISTRY_USER:-}" ] && [ -n "${REGISTRY_TOKEN:-}" ]; then
  token_json="$(curl -fsS -u "$REGISTRY_USER:$REGISTRY_TOKEN" "https://ghcr.io/token?scope=repository:$REPOSITORY:pull")"
else
  token_json="$(curl -fsS "https://ghcr.io/token?scope=repository:$REPOSITORY:pull")"
fi
registry_token="$(sed -nE 's/.*"token":"([^"]+)".*/\1/p' <<< "$token_json")"
[ -n "$registry_token" ] || die "cannot get a GHCR token to read the builds"

# Digests of the manifests an index points to (for a plain image manifest: its config and layers,
# which are not package versions and change nothing). Fails if GHCR does not answer.
parts_of() {
  local manifest
  manifest="$(curl -fsS -H "Authorization: Bearer $registry_token" \
    -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
    "https://ghcr.io/v2/$REPOSITORY/manifests/$1")" || return 1
  grep -oE '"digest"[[:space:]]*:[[:space:]]*"sha256:[0-9a-f]{64}"' <<< "$manifest" \
    | grep -oE 'sha256:[0-9a-f]{64}' || true
}

log "Keeping the $KEEP_BUILDS newest builds"
keep=" "
for build in "${builds[@]:0:KEEP_BUILDS}"; do
  IFS=$'\t' read -r _ digest created tags <<< "$build"
  # A failure here stops the script before anything is deleted: the parts of a kept build must be known.
  parts="$(parts_of "$digest")" || die "cannot read build $tags ($digest) from GHCR. Nothing was deleted"
  keep+="$digest $(tr '\n' ' ' <<< "$parts")"
  info "keep $tags ($created), $(wc -w <<< "$parts") parts"
done

# Untagged versions are deleted only if they are older than the oldest kept build, with an hour to spare:
# the parts of a build that is being pushed right now are newer and not tagged yet.
IFS=$'\t' read -r _ _ oldest_kept _ <<< "${builds[KEEP_BUILDS - 1]}"
cutoff="$(date -u -d "@$(( $(date -u -d "$oldest_kept" +%s) - 3600 ))" +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------- delete
log "Deleting the older builds and leftovers$([ "$DRY_RUN" = 1 ] && printf ' (DRY RUN: nothing is deleted)')"
deleted=0
while IFS=$'\t' read -r id digest created tags; do
  [[ "$keep" == *" $digest "* ]] && continue
  if [ -z "$tags" ] && [[ ! "$created" < "$cutoff" ]]; then
    continue
  fi
  what="${tags:-untagged part} ($created, $digest)"
  if [ "$DRY_RUN" = 1 ]; then
    info "would delete $what"
  else
    gh api --method DELETE "$VERSIONS_API/$id" --silent < /dev/null \
      || die "cannot delete $what. $deleted versions were deleted before it"
    info "deleted $what"
  fi
  deleted=$((deleted + 1))
done <<< "$versions"

if [ "$DRY_RUN" = 1 ]; then
  info "would delete $deleted versions"
else
  info "deleted $deleted versions"
  summary "GHCR: kept the $KEEP_BUILDS newest builds, deleted $deleted old versions."
fi
