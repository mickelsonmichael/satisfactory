#!/usr/bin/env bash
#
# push-save.sh - copy the latest Satisfactory .sav into this repo, regenerate the
# manifest, and push to GitHub. Designed to run inside a container (Portainer Stack)
# next to the dedicated server, on a schedule.
#
# Auth uses a GitHub Personal Access Token supplied via DEPLOY_TOKEN. The token is
# embedded in the remote URL only for the network operations (clone/fetch/push) and
# the cloned remote is then scrubbed back to a clean URL, so the token never lingers
# in .git/config on disk. Required permissions (as labeled in the GitHub UI):
#   - Fine-grained PAT: Repository permissions -> Contents -> "Read and write"
#                       (Metadata -> "Read-only" is added automatically)
#   - Classic PAT:      `repo` scope (or just `public_repo` if the repo is public)
#
# --- Required environment ---------------------------------------------------------
#   DEPLOY_TOKEN     GitHub PAT (fine-grained: Contents Read and write; classic: repo)
#   SAVE_SRC_DIR     Directory holding the server's .sav files (mount the server's
#                    SaveGames dir here, read-only is fine)
#
# --- Optional environment ---------------------------------------------------------
#   REPO_SLUG        owner/repo            (default: mickelsonmichael/satisfactory)
#   GIT_BRANCH       branch to push to     (default: release - the deploy branch.
#                    Saves go straight here so they never clutter main's history;
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

# --- Config -----------------------------------------------------------------------
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
# Authed URL embeds the PAT for network ops. "x-access-token" is an arbitrary
# username; GitHub authenticates on the token (password). Works for both classic
# and fine-grained PATs. Kept out of .git/config by passing it explicitly and
# scrubbing the remote after clone (see below).
AUTH_URL="https://x-access-token:${DEPLOY_TOKEN}@github.com/${REPO_SLUG}.git"

log() { printf '[push-save] %s\n' "$*"; }

run_once() {
  # --- Ensure repo is present & up to date ----------------------------------------
  if [ ! -d "${WORK_DIR}/.git" ]; then
    log "Cloning ${REPO_SLUG} into ${WORK_DIR}"
    mkdir -p "${WORK_DIR}"
    git clone --branch "${GIT_BRANCH}" --depth 1 "${AUTH_URL}" "${WORK_DIR}"
    # Don't leave the token sitting in .git/config; re-auth per network op below.
    git -C "${WORK_DIR}" remote set-url origin "${REPO_URL}"
  fi

  cd "${WORK_DIR}"
  git config --local user.name  "${GIT_AUTHOR_NAME}"
  git config --local user.email "${GIT_AUTHOR_EMAIL}"
  # Container UID may differ from the checkout owner; trust this dir.
  git config --global --add safe.directory "${WORK_DIR}" 2>/dev/null || true

  log "Syncing with origin/${GIT_BRANCH}"
  git fetch --depth 1 "${AUTH_URL}" "${GIT_BRANCH}"
  git reset --hard FETCH_HEAD

  # --- Locate the newest source save ----------------------------------------------
  local latest
  latest="$(ls -t "${SAVE_SRC_DIR}"/*.sav 2>/dev/null | head -1 || true)"
  if [ -z "${latest}" ]; then
    log "No .sav files found in ${SAVE_SRC_DIR}; nothing to do."
    return 0
  fi

  local stamp dest_dir dest
  # Minute precision (UTC) so frequent snapshots don't clobber each other.
  stamp="$(date -u +%Y%m%d-%H%M)"
  dest_dir="${WORK_DIR}/${SAVES_SUBDIR}"
  dest="${dest_dir}/satisfactory.${stamp}.sav"
  mkdir -p "${dest_dir}"

  log "Latest save: ${latest}"

  # --- Skip if no gameplay has occurred since the last uploaded save -------------
  # The server autosaves on a timer even when no one is playing, so header fields
  # (slot name, timestamp, playDurationSeconds) always change — playDurationSeconds
  # advances with server uptime, not player time. Instead we compare compressed
  # file sizes: idle saves fluctuate ±~2 KB per interval (just factory automation
  # changing item positions in the zlib stream), while real gameplay (new buildings,
  # research, etc.) consistently grows the file by 10–18 KB per interval.
  # A 5 KB threshold reliably separates the two without false positives.
  local SIZE_THRESHOLD=5000
  local newest_existing
  newest_existing="$(ls -t "${dest_dir}"/*.sav 2>/dev/null | head -1 || true)"
  if [ -n "${newest_existing}" ]; then
    local src_size dest_size delta abs_delta
    src_size="$(stat -c '%s' "${latest}")"
    dest_size="$(stat -c '%s' "${newest_existing}")"
    delta=$(( src_size - dest_size ))
    abs_delta=$(( delta < 0 ? -delta : delta ))
    if [ "${abs_delta}" -lt "${SIZE_THRESHOLD}" ]; then
      log "File size within idle threshold (${dest_size}B → ${src_size}B, delta ${delta}B < ${SIZE_THRESHOLD}B); nothing to do."
      return 0
    fi
    log "File size: ${dest_size}B → ${src_size}B (delta: ${delta}B)"
  fi

  cp -f "${latest}" "${dest}"

  # --- Optional retention: keep only the N newest .sav files ----------------------
  if [ "${MAX_SAVES}" -gt 0 ]; then
    ls -t "${dest_dir}"/*.sav 2>/dev/null | tail -n +"$((MAX_SAVES + 1))" | while read -r old; do
      log "Pruning old save: $(basename "${old}")"
      rm -f "${old}"
    done
  fi

  # --- Regenerate manifest (Node, no deps) ----------------------------------------
  log "Regenerating manifest"
  node scripts/generate-manifest.js

  # --- Commit & push only if something changed ------------------------------------
  git add "${SAVES_SUBDIR}"
  if git diff --cached --quiet; then
    log "No changes to commit."
    return 0
  fi

  git commit -m "chore: update save ${stamp}"
  log "Pushing to ${REPO_SLUG} (${GIT_BRANCH})"
  git push "${AUTH_URL}" "HEAD:${GIT_BRANCH}"
  log "Done."
}

# --- Entry point ------------------------------------------------------------------
if [ "${INTERVAL_SECONDS}" -gt 0 ]; then
  log "Loop mode: running every ${INTERVAL_SECONDS}s"
  while true; do
    run_once || log "Run failed (will retry next interval)"
    sleep "${INTERVAL_SECONDS}"
  done
else
  run_once
fi
