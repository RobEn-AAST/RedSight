#!/usr/bin/env bash
# RedSight — ONE-TIME root setup on the roben VPS. Run as:
#   ssh -t roben 'sudo bash ~/apps/redsight/deploy/setup-root.sh'
# Touches ONLY: the mars.roben.club nginx site, and systemd linger for `roben`
# (so the RedSight user services start at boot and CI can restart them without sudo).
# Backs up the previous site file; aborts before reload if `nginx -t` fails.
set -euo pipefail

SRC=/home/roben/apps/redsight/deploy/nginx/mars.roben.club.conf
DST=/etc/nginx/sites-available/mars.roben.club

echo "── 1/3 nginx site (mars.roben.club only)"
[ -f "$DST" ] && cp -a "$DST" "/home/roben/backups/mars.roben.club.nginx.$(date +%Y%m%d-%H%M%S).bak"
install -m 644 "$SRC" "$DST"
ln -sfn "$DST" /etc/nginx/sites-enabled/mars.roben.club

echo "── 2/3 validate + reload nginx"
if ! nginx -t; then
  echo "nginx -t failed — restoring previous site file" >&2
  latest=$(ls -t /home/roben/backups/mars.roben.club.nginx.*.bak 2>/dev/null | head -1 || true)
  [ -n "$latest" ] && install -m 644 "$latest" "$DST"
  exit 1
fi
systemctl reload nginx

echo "── 3/3 linger for roben (user services survive logout/reboot)"
loginctl enable-linger roben

echo "✔ done — https://mars.roben.club now proxies /api to the RedSight backend"
