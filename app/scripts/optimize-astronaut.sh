#!/usr/bin/env bash
# Original files remain untouched. Requires Node/npm and Python 3.
set -euo pipefail
source_model=${1:?Usage: optimize-astronaut.sh source.glb [output.glb]}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
output_model=${2:-"$script_dir/../src/copilot/assets/astronaut.glb"}
scratch_model=$(mktemp --suffix=.glb)
trap 'rm -f "$scratch_model"' EXIT
# Chat uses idle, greeting, agreement and observation; walking is unused.
python3 - "$source_model" "$scratch_model" <<'PY'
import json, struct, sys
with open(sys.argv[1], 'rb') as f:
    header = f.read(12)
    length, kind = struct.unpack('<II', f.read(8))
    document = json.loads(f.read(length))
    remainder = f.read()
document['animations'] = [a for a in document['animations'] if a.get('name') != 'walk']
payload = json.dumps(document, separators=(',', ':')).encode()
payload += b' ' * (-len(payload) % 4)
with open(sys.argv[2], 'wb') as f:
    f.write(struct.pack('<III', 0x46546c67, 2, 20 + len(payload) + len(remainder)))
    f.write(struct.pack('<II', len(payload), kind))
    f.write(payload)
    f.write(remainder)
PY
npx --yes @gltf-transform/cli@4.5.1 optimize "$scratch_model" "$output_model" \
  --texture-size 512 --texture-compress webp --compress meshopt \
  --simplify-ratio 0.4 --simplify-error 0.005
