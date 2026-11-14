"""Export the no-return rings the routes screen draws (plan/limits_c{crew}_l{load}_foot.geojson).

One run builds the same bounded native graph as the routing API (primary native DTM, current constants,
stops and Scenario habitat), computes the round-trip O₂ field once, and writes one GeoJSON per on-foot
crew preset. Each file holds one ``no_return_line`` feature per budget level (every 25 L up to the full
usable budget); the app draws the ring for the O₂ slider's value, rounded down to the safer side.

Usage (from the repository root, with the hash-checked inputs installed):

    python -m engine.tools.export_limits \
      --input-manifest data/raw/engine-pilot-rebuild/input-manifest.json \
      --constants app/public/data/constants.json --stops app/public/data/stops.json \
      --out app/public/data
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from rasterio.warp import transform as warp

from engine.data.native_routing import build_bounded_native_routing_inputs
from engine.export import MARS_GEOGRAPHIC_CRS, _read_stops, read_primary_dem
from engine.model.constants import read_constants
from engine.route.native import _simplify
from engine.route.reach import budget_levels, reach_mask, ring_lines, round_trip_o2_field, touches_edge, usable_budget_l

#: Crew presets the app ships plans for on foot; both members are scored at factor 1.0, as in the routes.
CREWS = (1, 2)


def _lonlat_lines(graph, lines, *, tolerance_m, decimals=6):
    out = []
    for rc in lines:
        t = graph.transform
        xs = t.c + (rc[:, 1] + 0.5) * t.a + (rc[:, 0] + 0.5) * t.b
        ys = t.f + (rc[:, 1] + 0.5) * t.d + (rc[:, 0] + 0.5) * t.e
        keep = _simplify(np.column_stack((xs, ys)), tolerance_m)
        lon, lat = warp(graph.crs, MARS_GEOGRAPHIC_CRS, xs[keep].tolist(), ys[keep].tolist())
        coords = [[round(float(a), decimals), round(float(b), decimals)] for a, b in zip(lon, lat)]
        if len(coords) >= 2:
            out.append(coords)
    return out


def build_limits(*, input_manifest, constants_path, stops_path, meta_path, block=10, tolerance_m=4.0):
    manifest_path = Path(input_manifest).resolve()
    manifest = json.loads(manifest_path.read_text())
    dem = read_primary_dem(manifest_path)
    constants_raw, constants = read_constants(constants_path)
    stops = _read_stops(stops_path, dem)
    habitat = json.loads(Path(meta_path).read_text())["habitat"]["lonlat"]
    inputs = build_bounded_native_routing_inputs(
        manifest_path=manifest_path, manifest=manifest, primary_dem=dem,
        habitat_lonlat=habitat, stops=stops, constants=constants,
    )
    graph = inputs.graph
    home_rc = tuple(inputs.habitat_cell)
    field = round_trip_o2_field(graph, home_node=graph.node(home_rc), constants=constants)
    full = usable_budget_l(constants)
    features = []
    for level in budget_levels(full):
        mask = reach_mask(field, home_rc, level)
        lines = _lonlat_lines(graph, ring_lines(mask, block=block), tolerance_m=tolerance_m)
        if not lines:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "MultiLineString", "coordinates": lines},
            "properties": {
                "kind": "no_return_line",
                "budget_l": level,
                "badge": "Scenario",
                "clipped_by_model_edge": touches_edge(mask),
            },
        })
    constants_hash = hashlib.sha256(
        (json.dumps(constants_raw, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()
    ).hexdigest()
    return {
        "features": features,
        "full_budget_l": full,
        "load_kg": constants["carried_load_kg"],
        "constants_hash": constants_hash,
        "resolution_m": graph.resolution_m,
        "block_m": block * graph.resolution_m,
    }


def collection(result, crew):
    return {
        "type": "FeatureCollection",
        "badge": "Scenario",
        "crew": crew,
        "load_kg": result["load_kg"],
        "full_budget_l": result["full_budget_l"],
        "constants_hash": result["constants_hash"],
        "note": (
            "Scenario: no-return rings from the engine's round-trip O2 field on the primary native DTM "
            f"({result['resolution_m']:.2f} m cells, outlines smoothed to about {result['block_m']:.0f} m). "
            "Each ring is the outer edge of the ground where walking out on the fastest path and back the same "
            "way fits the budget, scored as factor * (out + return_margin * back), the engine's turn-back rule. "
            "A ring marked clipped_by_model_edge runs into the edge of the terrain model there."
        ),
        "features": result["features"],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input-manifest", required=True)
    parser.add_argument("--constants", required=True)
    parser.add_argument("--stops", required=True)
    parser.add_argument("--meta", help="meta.json with the Scenario habitat (defaults to <out>/meta.json)")
    parser.add_argument("--out", required=True, help="app data folder, normally app/public/data")
    args = parser.parse_args(argv)
    out = Path(args.out)
    result = build_limits(
        input_manifest=args.input_manifest, constants_path=args.constants,
        stops_path=args.stops, meta_path=args.meta or out / "meta.json",
    )
    for crew in CREWS:
        path = out / "plan" / f"limits_c{crew}_l{int(result['load_kg'])}_foot.geojson"
        path.write_text(json.dumps(collection(result, crew), separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(result['features'])} rings)")


if __name__ == "__main__":
    main()
