#!/usr/bin/env bash
# Turn recorded clips into slide/project-page GIFs (≤ 10 MB each, the project-page upload limit).
# Usage: bash build/clips.sh [speed=1.5] [width=1280] [fps=15]
set -euo pipefail
cd "$(dirname "$0")/../out"
SPEED=${1:-1.5}; W=${2:-1280}; FPS=${3:-15}
mkdir -p gifs
for c in clips/*.mp4; do
  n=$(basename "$c" .mp4)
  ffmpeg -y -loglevel error -i "$c" -vf "setpts=PTS/${SPEED},fps=${FPS},scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" "gifs/$n.gif"
  sz=$(du -m "gifs/$n.gif" | cut -f1)
  if [ "$sz" -ge 10 ]; then
    ffmpeg -y -loglevel error -i "$c" -vf "setpts=PTS/${SPEED},fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" "gifs/$n.gif"
  fi
  if [ "$(du -m "gifs/$n.gif" | cut -f1)" -ge 10 ]; then
    ffmpeg -y -loglevel error -i "$c" -vf "setpts=PTS/${SPEED},fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "gifs/$n.gif"
  fi
  echo "gifs/$n.gif  $(du -h "gifs/$n.gif" | cut -f1)"
done
