#!/usr/bin/env bash
#
# push-save.sh — copy the latest Satisfactory .sav into this repo, regenerate the
# manifest, and push to GitHub. Designed to run inside a container (Portainer Stack)
# next to the dedicated server, on a schedule.
#
# Auth uses a GitHub deploy token / fine-grained PAT supplied via DEPLOY_TOKEN.
# The token needs `contents: write` on the target repo. It is passed to git through
# an Authorization header (never written to .git/config, never echoed) so it does not
# linger on disk in the cloned working tree.
#
# ── Required environment ────────────────────────────────────────────────────────
#   DEPLOY_TOKEN     GitHub token with contents:write (fine-grained PAT recommended)
#   SAVE_SRC_DIR     Directory holding the server's .sav files (mount the server's
#                    SaveGames dir here, read-only is fine)
#
# ── Optional environment ────────────────────────────────────────────────────────
#   REPO_SLUG        owner/repo            (default: mickelsonmichael/satisfactory)
#   GIT_BRANCH       branch to push to     (default: release — the deploy branch.
#                    Saves go straight here so they never clutter `main`'s history;
#                    pushing here triggers deploy.yml directly.)
#   WORK_DIR         where the repo is cloned/cached (default: /workspace/repo)
#   SAVES_SUBDIR     repo path for saves   (default: public/saves)
#   GIT_AUTHOR_NAME  commit author name    (default: satisfactory-bot)
#   GIT_AUTHOR_EMAIL commit author email   (default: bot@users.noreply.github.com)
#   MAX_SAVES        keep only the N newest .sav files (default: 0 = keep all)
#   INTERVAL_SECONDS if set (>0), loop forever, sleeping this long between runs.
#                    Leave unset for a one-shot run (e.g. driven by an external cron).
#
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────────
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN is required}"
: "${SAVE_SRC_DIR:?SAVE_SRC_DIR is required}"

REPO_SLUG="${REPO_SLUG:-mickelsonmichael/satisfactory}"
GIT_BRANCH="${GIT_BRANCH:-release}"
WORK_DIR="${WORK_DIR:-/workspace/repo}"
SAVES_SUBDIR="${SAVES_SUBDIR:-public/saves}"
GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-satisfactory-bot}"
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-bot@users.noreply.github.com}"
MAX_SAVES="${MAX_SAVES:-0}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-0}"

REPO_URL="https://github.com/${REPO_SLUG}.git"

log() { printf '[push-save] %s\n' "$*"; }

# Build the Authorization header value once. Format: "x-access-token:<token>" base64'd.
# git is invoked with -c http.extraheader=... so the token never touches .git/config
# or the process command line in plaintext. AUTH_HEADER is a local var, not exported.
AUTH_B64="$(printf 'x-access-token:%s' "${DEPLOY_TOKEN}" | base64 | tr -d '\n')"
git_auth() { git -c "http.extraheader=AUTHORIZATION: basic ${AUTH_B64}" "$@"; }

run_once() {
  # ── Ensure repo is present & up to date ───────────────────────────────────────
  if [ ! -d "${WORK_DIR}/.git" ]; then
    log "Cloning ${REPO_SLUG} into ${WORK_DIR}"
    mkdir -p "${WORK_DIR}"
    git_auth clone --branch "${GIT_BRANCH}" --depth 1 "${REPO_URL}" "${WORK_DIR}"
  fi

  cd "${WORK_DIR}"
  git config --local user.name  "${GIT_AUTHOR_NAME}"
  git config --local user.email "${GIT_AUTHOR_EMAIL}"
  # Container UID may differ from the checkout owner; trust this dir.
  git config --global --add safe.directory "${WORK_DIR}" 2>/dev/null || true

  log "Syncing with origin/${GIT_BRANCH}"
  git_auth fetch --depth 1 origin "${GIT_BRANCH}"
  git reset --hard "origin/${GIT_BRANCH}"

  # ── Locate the newest source save ─────────────────────────────────────────────
  local latest
  latest="$(ls -t "${SAVE_SRC_DIR}"/*.sav 2>/dev/null | head -1 || true)"
  if [ -z "${latest}" ]; then
    log "No .sav files found in ${SAVE_SRC_DIR}; nothing to do."
    return 0
  fi

  local date dest_dir dest
  date="$(date +%Y%m%d)"
  dest_dir="${WORK_DIR}/${SAVES_SUBDIR}"
  dest="${dest_dir}/satisfactory.${date}.sav"
  mkdir -p "${dest_dir}"

  log "Latest save: ${latest}"
  cp -f "${latest}" "${dest}"

  # ── Optional retention: keep only the N newest .sav files ─────────────────────
  if [ "${MAX_SAVES}" -gt 0 ]; then
    ls -t "${dest_dir}"/*.sav 2>/dev/null | tail -n +"$((MAX_SAVES + 1))" | while read -r old; do
      log "Pruning old save: $(basename "${old}")"
      rm -f "${old}"
    done
  fi

  # ── Regenerate manifest (Node, no deps) ───────────────────────────────────────
  log "Regenerating manifest"
  node scripts/generate-manifest.js

  # ── Commit & push only if something changed ───────────────────────────────────
  git add "${SAVES_SUBDIR}"
  if git diff --cached --quiet; then
    log "No changes to commit."
    return 0
  fi

  git commit -m "chore: update save ${date}"
  log "Pushing to ${REPO_SLUG} (${GIT_BRANCH})"
  git_auth push origin "HEAD:${GIT_BRANCH}"
  log "Done."
}

# ── Entry point ─────────────────────────────────────────────────────────────────
if [ "${INTERVAL_SECONDS}" -gt 0 ]; then
  log "Loop mode: running every ${INTERVAL_SECONDS}s"
  while true; do
    run_once || log "Run failed (will retry next interval)"
    sleep "${INTERVAL_SECONDS}"
  done
else
  run_once
fi
