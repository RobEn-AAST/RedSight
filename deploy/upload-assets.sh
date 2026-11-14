#!/usr/bin/env bash
# RedSight — upload the git-ignored assets CI cannot build. Run from the repo root on a
# machine that has them (re-run only when they change):
#   app/public/tiles/        → /var/www/mars.roben.club/demo/tiles/   (map XYZ tiles)
#   data/raw/engine-pilot/   → ~/apps/redsight-data/engine-pilot/ (hash-checked terrain bundle)
#   data/processed/themis_ti_10m.npy → ~/apps/redsight/data/processed/ (THEMIS sand grid for the
#                              live router's sand weight; git-ignored, so git reset keeps it)
# Usage: bash deploy/upload-assets.sh [ssh-host]   (default host alias: roben)
set -euo pipefail
HOST="${1:-roben}"
cd "$(dirname "$0")/.."
[ -d app/public/tiles ] || { echo "app/public/tiles missing — build tiles first (data/README.md)" >&2; exit 1; }
ssh "$HOST" "mkdir -p /var/www/mars.roben.club/demo/tiles"
rsync -az --delete --info=stats1 app/public/tiles/ "$HOST:/var/www/mars.roben.club/demo/tiles/"
if [ -f data/raw/engine-pilot/input-manifest.json ]; then
  ssh "$HOST" 'mkdir -p ~/apps/redsight-data'
  rsync -az --delete --info=stats1 data/raw/engine-pilot/ "$HOST:apps/redsight-data/engine-pilot/"
  # Manifest paths are rewritten to the VPS location by deploy/remote-deploy.sh.
  ssh "$HOST" 'sed -i "s#/home/ali/Nasa_Hackathon/data/raw/#$HOME/apps/redsight-data/#g" ~/apps/redsight-data/engine-pilot/input-manifest.json && systemctl --user restart redsight-engine.service 2>/dev/null || true'
fi
if [ -f data/processed/themis_ti_10m.npy ]; then
  ssh "$HOST" 'mkdir -p ~/apps/redsight/data/processed'
  rsync -az --info=stats1 data/processed/themis_ti_10m.npy "$HOST:apps/redsight/data/processed/"
else
  echo "warning: data/processed/themis_ti_10m.npy missing — live routes with a sand weight will fail" >&2
fi
echo "✔ assets uploaded to $HOST"
