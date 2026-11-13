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
    for source, expected in assets:
        target = out / 'assets' / source.name
        actual = digest(source)
        if target.exists() and digest(target) != actual:
            raise ValueError(f'refusing to overwrite different asset: {target}')
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.resolve() != target:
            shutil.copy2(source, target)
        mapping[str(source)] = str(target)
        inventory[str(target.relative_to(out))] = actual

    def relocate(value):
        if isinstance(value, dict):
            return {key: relocate(item) for key, item in value.items()}
        if isinstance(value, list):
            return [relocate(item) for item in value]
        return mapping.get(value, value) if isinstance(value, str) else value

    for source, filename, content in ((args.manifest, 'input-manifest.json', manifest),
                                      (args.access_review, 'access-review.json', access)):
        original = out / ('original-' + filename)
        if not original.exists():
            shutil.copy2(source, original)
        target = out / filename
        target.write_text(json.dumps(relocate(content), indent=2) + '\n')
        inventory[filename] = digest(target)
        inventory[original.name] = digest(original)
    (out / 'SHA256.json').write_text(json.dumps(inventory, indent=2, sort_keys=True) + '\n')
    print(out / 'input-manifest.json')


if __name__ == '__main__':
    main()
