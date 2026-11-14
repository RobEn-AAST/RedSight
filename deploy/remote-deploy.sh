#!/usr/bin/env bash
# RedSight — runs ON the VPS (as roben). Pulls main, builds there, restarts. No sudo needed.
# CI (.github/workflows/deploy.yml) just SSHes in and runs this; you can too:
#   ssh roben 'bash ~/apps/redsight/deploy/remote-deploy.sh'
#   ~/apps/redsight            git clone of the public repo (reset to origin/main)
#   /var/www/mars.roben.club   built app/dist (tiles/ kept: git-ignored, deploy/upload-assets.sh)
#   ~/apps/redsight-data       terrain bundle (git-ignored; deploy/upload-assets.sh)
#   ~/apps/redsight.env        provider keys (never in git)
#   ~/apps/redsight-venv       Python venv for the engine
set -euo pipefail

APP="$HOME/apps/redsight"
VENV="$HOME/apps/redsight-venv"
NODE="$HOME/.local/opt/node/bin/node"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export PATH="$HOME/.local/opt/node/bin:$PATH"
BRANCH="${DEPLOY_BRANCH:-main}"
cd "$APP"

echo "── 0/5 code: origin/$BRANCH → build → web root"
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
echo "revision $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
# Re-exec once so the rest of this run uses the freshly pulled copy of this script.
if [ -z "${REDSIGHT_REEXEC:-}" ]; then REDSIGHT_REEXEC=1 exec bash "$APP/deploy/remote-deploy.sh"; fi
(
  cd app
  LOCK_HASH=$(sha256sum package-lock.json | cut -d' ' -f1)
  if [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
    npm ci --no-audit --no-fund --loglevel=error
    echo "$LOCK_HASH" > node_modules/.lock-hash
  fi
  # Tiles are git-ignored and live in the web root; link them so build + data check see them.
  [ -e public/tiles ] || ln -s /var/www/mars.roben.club/tiles public/tiles
  npm run build --silent
  npm run check:data --silent | tail -1
)
rsync -a --delete-after --delay-updates --exclude '/tiles/' app/dist/ /var/www/mars.roben.club/

echo "── 1/5 runtimes"
[ -x "$NODE" ] || { echo "Node missing at $NODE (see deploy/README.md bootstrap)" >&2; exit 1; }
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
REQ_HASH=$(sha256sum engine/requirements-api.txt | cut -d' ' -f1)
if [ "$(cat "$VENV/.req-hash" 2>/dev/null)" != "$REQ_HASH" ]; then
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r engine/requirements-api.txt
  echo "$REQ_HASH" > "$VENV/.req-hash"
fi
echo "node $("$NODE" -v) · $("$VENV/bin/python" -V)"

echo "── 2/5 terrain manifest paths → this host (idempotent)"
MANIFEST="$HOME/apps/redsight-data/engine-pilot/input-manifest.json"
if [ -f "$MANIFEST" ]; then
  sed -i "s#/home/ali/Nasa_Hackathon/data/raw/#$HOME/apps/redsight-data/#g" "$MANIFEST"
else
  echo "warning: no terrain bundle at $MANIFEST — routing will report 'unavailable'" >&2
fi

echo "── 3/5 systemd user units"
mkdir -p "$HOME/.config/systemd/user"
install -m 644 deploy/systemd/redsight-*.service "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --quiet redsight-engine.service redsight-copilot.service
systemctl --user restart redsight-engine.service redsight-copilot.service

echo "── 4/5 health (local)"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:8788/api/copilot/health >/dev/null && curl -fsS -m 3 http://127.0.0.1:8790/health >/dev/null; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  systemctl --user --no-pager status redsight-engine.service redsight-copilot.service | tail -30 >&2
  exit 1
fi
curl -fsS http://127.0.0.1:8788/api/copilot/health; echo
curl -fsS http://127.0.0.1:8790/health; echo

echo "── 5/5 warm the routing engine (first route loads the DTM)"
curl -fsS -m 120 -o /dev/null -w "warm route: %{http_code} in %{time_total}s\n" \
  -H 'Content-Type: application/json' -H 'Origin: https://mars.roben.club' \
  -d @deploy/warm-route.json http://127.0.0.1:8788/api/routing/route || echo "warm-up skipped (non-fatal)"

echo "✔ deployed $(git -C "$APP" rev-parse --short HEAD)"
