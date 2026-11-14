#!/usr/bin/env bash
# RedSight — upload the git-ignored assets CI cannot build. Run from the repo root on a
# machine that has them (re-run only when they change):
#   app/public/tiles/        → /var/www/mars.roben.club/tiles/   (map XYZ tiles)
#   data/raw/engine-pilot/   → ~/apps/redsight-data/engine-pilot/ (hash-checked terrain bundle)
# Usage: bash deploy/upload-assets.sh [ssh-host]   (default host alias: roben)
set -euo pipefail
HOST="${1:-roben}"
cd "$(dirname "$0")/.."
[ -d app/public/tiles ] || { echo "app/public/tiles missing — build tiles first (data/README.md)" >&2; exit 1; }
rsync -az --delete --info=stats1 app/public/tiles/ "$HOST:/var/www/mars.roben.club/tiles/"
if [ -f data/raw/engine-pilot/input-manifest.json ]; then
  ssh "$HOST" 'mkdir -p ~/apps/redsight-data'
  rsync -az --delete --info=stats1 data/raw/engine-pilot/ "$HOST:apps/redsight-data/engine-pilot/"
  # Manifest paths are rewritten to the VPS location by deploy/remote-deploy.sh.
  ssh "$HOST" 'sed -i "s#/home/ali/Nasa_Hackathon/data/raw/#$HOME/apps/redsight-data/#g" ~/apps/redsight-data/engine-pilot/input-manifest.json && systemctl --user restart redsight-engine.service 2>/dev/null || true'
fi
echo "✔ assets uploaded to $HOST"
