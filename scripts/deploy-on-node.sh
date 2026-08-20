#!/usr/bin/env bash
#
# Deploy step that runs ON the CloudJiffy node, piped in over SSH by
# .github/workflows/ci.yml. Keep it idempotent and safe to re-run by hand:
#
#   ssh -p 3022 <uid>@gate.cloudjiffy.net 'bash -s' < scripts/deploy-on-node.sh
#
# Order matters. `next build` runs BEFORE the app is touched, so the currently
# running bundle keeps serving the whole time and the swap at the end costs
# about a second. Building inside PM2 instead (what `npm start` does on a cold
# boot) would 502 the site for the entire build.
set -euo pipefail

# The `git reset --hard` below can rewrite THIS file, and bash reads a script
# incrementally -- so running it in place risks executing a half-swapped file.
# Over the CI pipe (`bash -s`) there is no file to clobber; when someone runs it
# by hand from the checkout, re-exec from a private copy first. The copy deletes
# itself immediately: on Linux the open fd keeps it readable to the end.
if [ "${DEPLOY_REEXEC:-}" != "1" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  _copy="$(mktemp)"
  cat "${BASH_SOURCE[0]}" > "$_copy"
  DEPLOY_REEXEC=1 exec bash "$_copy" "$@"
fi
[ "${DEPLOY_REEXEC:-}" = "1" ] && [ -f "$0" ] && rm -f "$0"

BRANCH="${DEPLOY_BRANCH:-dev}"
ROOT="${ROOT_DIR:-$HOME/ROOT}"
APP_PORT="${PORT:-3000}"
APP_NAME="${PM2_APP:-vknext-front}"

# A non-interactive SSH session skips the profile that puts nvm's node on PATH,
# so `npm`/`npx`/`pm2` are all missing unless we load it ourselves.
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-/opt/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi
command -v node >/dev/null 2>&1 || { echo "::deploy:: node is not on PATH" >&2; exit 1; }
echo "::deploy:: node $(node -v), npm $(npm -v)"

cd "$ROOT"

# ---------------------------------------------------------------- source
git fetch --prune origin
before="$(git rev-parse HEAD)"
git reset --hard "origin/${BRANCH}"
after="$(git rev-parse HEAD)"
echo "::deploy:: ${before:0:7} -> ${after:0:7} on ${BRANCH}"

# ---------------------------------------------------------------- deps
# npm ci wipes and reinstalls node_modules (~1 min), so only pay for it when the
# manifest actually moved -- or when HEAD did not move at all, which means this
# is a manual redeploy and a clean install is the point. `--omit=dev` mirrors
# what the platform installs, which is why every build-time dep must live in
# `dependencies`.
if [ "$before" = "$after" ] || ! git diff --quiet "$before" "$after" -- package.json package-lock.json; then
  echo "::deploy:: installing production dependencies"
  npm ci --omit=dev
else
  echo "::deploy:: dependencies unchanged, skipping npm ci"
fi

# ---------------------------------------------------------------- env guard
# NEXT_PUBLIC_* values are inlined at build time. A non-interactive shell does
# not get the platform's /.jelenv exports, and without this the build would
# silently fall back to the localhost API base and ship a dead bundle.
if [ -z "${NEXT_PUBLIC_API_BASE:-}" ] && [ -r /.jelenv ]; then
  from_jelenv="$(sed -n 's/^NEXT_PUBLIC_API_BASE=//p' /.jelenv | head -1)"
  [ -n "$from_jelenv" ] && export NEXT_PUBLIC_API_BASE="$from_jelenv"
fi
if [ -z "${NEXT_PUBLIC_API_BASE:-}" ] && ! grep -qs '^NEXT_PUBLIC_API_BASE=' .env.production; then
  echo "::deploy:: refusing to build -- NEXT_PUBLIC_API_BASE is set neither in the" >&2
  echo "::deploy:: node environment nor in .env.production. The bundle would point" >&2
  echo "::deploy:: at localhost. Set it in the CloudJiffy dashboard and retry." >&2
  exit 1
fi
echo "::deploy:: API base ${NEXT_PUBLIC_API_BASE:-<from .env.production>}"

# ---------------------------------------------------------------- build
# Peak is ~1 GB; the platform grants a 2560 MB heap but a bare SSH shell may not
# inherit NODE_OPTIONS, so set a floor when it is absent.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
echo "::deploy:: building into .next-build (live site still serving .next)"
# Two things matter here.
#
# 1. NEXT_DIST_DIR: building straight into `.next` rewrites the directory the
#    running server reads from, which 502s the live site for the entire build
#    (~17s measured). Build to the side, swap at the end.
# 2. ensure-build.js, not `next build` directly -- it also writes
#    deploy-fingerprint. Without that file the app's own ensure-build run at
#    startup sees a fingerprint mismatch and rebuilds a SECOND time inside PM2.
#
# `--strict` makes a failed build fail the pipeline instead of quietly serving
# the previous bundle.
rm -rf .next-build
NEXT_DIST_DIR=.next-build node scripts/ensure-build.js --strict
test -f .next-build/BUILD_ID || { echo "::deploy:: build produced no BUILD_ID" >&2; exit 1; }

# Swap: two renames on one filesystem, so the window where `.next` is missing is
# sub-millisecond and the app is restarted immediately after anyway. The previous
# build is kept for one generation to roll back to.
rm -rf .next.previous
[ -d .next ] && mv .next .next.previous
mv .next-build .next
echo "::deploy:: swapped in the new build (previous kept at .next.previous)"

# ---------------------------------------------------------------- swap
# BUILD_ID is now newer than every source file, so ensure-build.js no-ops and
# `npm start` goes straight to `next start`.
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
# Without `pm2 save` the dump is stale and the next platform restart brings back
# nothing -- this is exactly how the node ended up dead on 2026-08-19.
pm2 save

# ---------------------------------------------------------------- health gate
for _ in $(seq 1 45); do
  code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/" || true)"
  if [ "$code" = "200" ]; then
    echo "::deploy:: healthy on :${APP_PORT} at $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

echo "::deploy:: app did not answer 200 on :${APP_PORT} within 90s" >&2
pm2 logs "$APP_NAME" --lines 60 --nostream >&2 || true
exit 1
