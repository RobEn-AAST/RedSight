"""Copy the recorded pilot inputs into an ignored, hash-inventoried local bundle.

No downloads or terrain processing. Re-run against an existing bundle to relocate it.
"""

import argparse
import hashlib
import json
from pathlib import Path
import shutil


def digest(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--access-review', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    access = json.loads(args.access_review.read_text())
    assets = [(Path(x['local_crop']), x['local_crop_sha256']) for x in manifest['inputs']]
    assets += [(Path(manifest['coverage']['mosaic']), manifest['coverage']['sha256']),
               (Path(manifest['native_hazard']['artifact']), manifest['native_hazard']['sha256']),
               (Path(access['source']['native_window_cache']), access['source']['native_window_sha256']),
               (Path(access['aggregation_comparison']['p90_mask']['path']),
                access['aggregation_comparison']['p90_mask']['sha256'])]
    assets += [(Path(value), None) for key, value in manifest['s1_alignment'].items()
               if key in {'evidence_image', 'review_report', 'ortho_crop', 'native_primary_dtm_hillshade'}]
    assets.append((Path(manifest['stac_query']['captured_json']), manifest['stac_query']['sha256']))
    # Check recorded hashes before copying anything or writing relocated manifests.
    for path, expected in assets:
        if not path.is_file() or (expected and digest(path) != expected):
            raise ValueError(f'missing or checksum-mismatched pilot asset: {path}')
    out = args.out.resolve()
    mapping = {}
    inventory = {}
    copies = []
    planned_assets = {}
    for source, expected in assets:
        target = out / 'assets' / source.name
        actual = digest(source)
        if target in planned_assets and planned_assets[target] != actual:
            raise ValueError(f'pilot assets share a filename but differ: {target.name}')
        if target.exists() and (not target.is_file() or digest(target) != actual):
            raise ValueError(f'refusing to overwrite different asset: {target}')
        if source.resolve() != target:
            copies.append((source, target))
        planned_assets[target] = actual
        mapping[str(source)] = str(target)
        inventory[str(target.relative_to(out))] = actual

    def relocate(value):
        if isinstance(value, dict):
            return {key: relocate(item) for key, item in value.items()}
        if isinstance(value, list):
            return [relocate(item) for item in value]
        return mapping.get(value, value) if isinstance(value, str) else value

    writes = []
    for source, filename, content in ((args.manifest, 'input-manifest.json', manifest),
                                      (args.access_review, 'access-review.json', access)):
        original = out / ('original-' + filename)
        original_bytes = source.read_bytes()
        target = out / filename
        target_bytes = (json.dumps(relocate(content), indent=2) + '\n').encode()
        for path, data in ((original, original_bytes), (target, target_bytes)):
            if path.exists() and (not path.is_file() or path.read_bytes() != data):
                raise ValueError(f'refusing to overwrite different bundle file: {path}')
        if not original.exists():
            writes.append((original, original_bytes))
        if not target.exists():
            writes.append((target, target_bytes))
        inventory[filename] = hashlib.sha256(target_bytes).hexdigest()
        inventory[original.name] = hashlib.sha256(original_bytes).hexdigest()
    inventory_bytes = (json.dumps(inventory, indent=2, sort_keys=True) + '\n').encode()
    inventory_path = out / 'SHA256.json'
    if inventory_path.exists() and (not inventory_path.is_file() or inventory_path.read_bytes() != inventory_bytes):
        raise ValueError(f'refusing to overwrite different bundle file: {inventory_path}')

    # Validate the full destination plan before creating or changing anything.
    for source, target in copies:
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copy2(source, target)
    for path, data in writes:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    if not inventory_path.exists():
        inventory_path.parent.mkdir(parents=True, exist_ok=True)
        inventory_path.write_bytes(inventory_bytes)
    print(out / 'input-manifest.json')


if __name__ == '__main__':
    main()
