"""Run a deterministic real-DTM pilot and write only Ali-owned contract artifacts."""

from datetime import date
import hashlib
import json
from pathlib import Path
import platform

import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform, transform_geom
from scipy import __version__ as scipy_version
from scipy.sparse.csgraph import connected_components

from engine.data.raster import read_primary_dem, sha256_file
from engine.model.constants import read_constants
from engine.model.grid import build_graph
from engine.route.arrays import route_arrays
from engine.route.pnr import point_of_no_return
from engine.route.solve import shortest_path


MARS_GEOGRAPHIC_CRS = "+proj=longlat +R=3396190 +no_defs"
SUPPORTED_STOPS = ("S1", "S2", "S3", "D1", "D2")


def _json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def _write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_json_bytes(value))


def _read_manifest(manifest_path):
    path = Path(manifest_path).resolve()
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def _handoff_sources(manifest, primary_dem):
    result = {
        "manifest_sha256": primary_dem.manifest_sha256,
        "route_dem": {
            "source_url": primary_dem.source_url,
            "license": primary_dem.license,
            "local_path": primary_dem.source_path,
            "sha256": primary_dem.source_sha256,
            "resolution_m": [primary_dem.resolution_x_m, primary_dem.resolution_y_m],
            "valid_cells": int(primary_dem.valid.sum()),
            "total_cells": int(primary_dem.valid.size),
            "valid_fraction": float(primary_dem.valid.mean()),
            "role": "primary DTM only; retained native coverage mask",
        },
    }
    for item in manifest.get("inputs", []):
        if item.get("role") == "Primary HiRISE DTM":
            continue
        if item.get("role") == "Complementary HiRISE DTM filling primary nodata":
            path = Path(item["local_crop"]).resolve()
            digest = sha256_file(path)
            if item.get("local_crop_sha256") and digest != item["local_crop_sha256"]:
                raise ValueError("complementary DTM checksum does not match the handoff manifest")
            with rasterio.open(primary_dem.source_path) as pds, rasterio.open(path) as cds:
                if pds.shape != cds.shape or pds.transform != cds.transform or pds.crs != cds.crs:
                    raise ValueError("complementary DTM crop is not on the primary planning grid")
                pa = pds.read(1, masked=True)
                ca = cds.read(1, masked=True)
                overlap = ~np.ma.getmaskarray(pa) & ~np.ma.getmaskarray(ca)
                delta = ca.data[overlap].astype(np.float64) - pa.data[overlap].astype(np.float64)
            if delta.size:
                result["seam_check"] = {
                    "overlap_cells": int(delta.size),
                    "complement_minus_primary_m": {
                        "median": float(np.median(delta)),
                        "p10": float(np.percentile(delta, 10)),
                        "p90": float(np.percentile(delta, 90)),
                        "absolute_p90": float(np.percentile(np.abs(delta), 90)),
                        "absolute_max": float(np.max(np.abs(delta))),
                    },
                    "route_policy": "exclude complementary-only pixels; do not blend the detected scene offset into slope or route costs",
                    "complementary_source_url": item.get("source_url", ""),
                    "complementary_license": item.get("license", ""),
                    "complementary_crop_sha256": digest,
                }
        elif item.get("role") == "Matching ortho context for landmark check":
            path = Path(item["local_crop"]).resolve()
            digest = sha256_file(path)
            if item.get("local_crop_sha256") and digest != item["local_crop_sha256"]:
                raise ValueError("ortho crop checksum does not match the handoff manifest")
            result["ortho_context"] = {
                "source_url": item.get("source_url", ""),
                "license": item.get("license", ""),
                "local_path": str(path),
                "sha256": digest,
                "valid_pixel_percent": item.get("valid_pixel_percent"),
                "extent": item.get("extent"),
                "used_for_routing": False,
            }
    coverage = manifest.get("coverage", {})
    mosaic_path = coverage.get("mosaic")
    if mosaic_path:
        mosaic_path = Path(mosaic_path).resolve()
        mosaic_hash = sha256_file(mosaic_path)
        if coverage.get("sha256") and mosaic_hash != coverage["sha256"]:
            raise ValueError("coverage mosaic checksum does not match the handoff manifest")
        result["mosaic_reference"] = {
            "local_path": str(mosaic_path),
            "sha256": mosaic_hash,
            "shape_hw": coverage.get("shape_hw"),
            "valid_percent": coverage.get("valid_percent"),
            "used_for_routing": False,
        }
    return result


def _coords_to_cell(lon, lat, dem):
    x, y = transform(MARS_GEOGRAPHIC_CRS, dem.crs, [lon], [lat])
    return rasterio.transform.rowcol(dem.transform, x[0], y[0])


def _cell_lonlat(row, col, dem):
    x, y = rasterio.transform.xy(dem.transform, row, col, offset="center")
    lon, lat = transform(dem.crs, MARS_GEOGRAPHIC_CRS, [x], [y])
    return [float(lon[0]), float(lat[0])]


def _read_stops(stops_path, dem):
    data = json.loads(Path(stops_path).read_text())
    by_id = {}
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        stop_id = props.get("id")
        if stop_id not in SUPPORTED_STOPS:
            continue
        lon, lat = feature["geometry"]["coordinates"][:2]
        row, col = _coords_to_cell(lon, lat, dem)
        if not (0 <= row < dem.height and 0 <= col < dem.width):
            raise ValueError(f"supported stop {stop_id} lies outside the primary DTM crop")
        if not dem.valid[row, col]:
            raise ValueError(f"supported stop {stop_id} falls on primary DTM nodata")
        by_id[stop_id] = {
            "id": stop_id,
            "name": props.get("name", stop_id),
            "lonlat": [float(lon), float(lat)],
            "cell": (int(row), int(col)),
        }
    missing = sorted(set(SUPPORTED_STOPS) - set(by_id))
    if missing:
        raise ValueError(f"stops contract is missing supported stops: {', '.join(missing)}")
    return by_id


def _choose_habitat(dem, graph, stops):
    s1 = stops["S1"]["cell"]
    sr, sc = s1
    rows, cols = np.indices(graph.shape)
    resolution = dem.resolution_m
    distance = np.hypot((rows - sr) * resolution, (cols - sc) * resolution)
    north = (sr - rows) * resolution
    candidates = (
        graph.valid
        & (distance >= 150.0)
        & (distance <= 600.0)
        & (north >= 100.0)
        & (dem.elevation_m < dem.elevation_m[sr, sc])
    )
    choices = np.argwhere(candidates)
    if not len(choices):
        raise ValueError("no walkable habitat candidate lies 150–600 m north and downslope of S1")
    scores = [
        (float(graph.slope_max_deg[r, c]), float(distance[r, c]), int(r), int(c))
        for r, c in choices
    ]
    _, labels = connected_components(graph.time_csr, directed=True, connection="weak")
    stop_components = {labels[graph.node(stop["cell"])] for stop in stops.values()}
    if len(stop_components) != 1:
        raise ValueError("the five supported stops do not share a connected primary-DTM walkable component")
    shared_component = next(iter(stop_components))
    for _, _, row, col in sorted(scores):
        if labels[graph.node((row, col))] == shared_component:
            return (row, col), "Lowest neighborhood-slope candidate 150–600 m north and downslope of S1 within the component containing all five supported stops."
    raise ValueError("no habitat candidate can reach all five supported stops under the 15°/nodata hard mask")


def _hazards_geojson(dem, graph, slope_limit_deg):
    reasons = np.zeros(graph.shape, dtype=np.uint8)
    reasons[~dem.valid] = 2
    reasons[dem.valid & (graph.slope_max_deg > slope_limit_deg + 1e-10)] = 1
    labels = {
        1: ("slope", f"8-neighbor maximum slope on average-resampled ~9.88 m cells exceeds the {slope_limit_deg:g}° Scenario threshold"),
        2: ("nodata", "Primary DTM nodata; complementary-only cells excluded because overlapping scenes show substantial height offsets"),
    }
    features_out = []
    for geom, value in shapes(reasons, mask=reasons > 0, transform=dem.transform, connectivity=4):
        code = int(value)
        if code not in labels:
            continue
        reason, label = labels[code]
        geographic = transform_geom(dem.crs, MARS_GEOGRAPHIC_CRS, geom, precision=7)
        features_out.append({
            "type": "Feature",
            "properties": {"reason": reason, "label": label, "badge": "Derived" if code == 1 else "Unavailable"},
            "geometry": geographic,
        })
    features_out.sort(key=lambda item: (item["properties"]["reason"], json.dumps(item["geometry"], sort_keys=True)))
    return {"type": "FeatureCollection", "features": features_out}


def build_real_routes(
    *,
    input_manifest,
    constants_path,
    stops_path,
    output_dir,
    habitat_row_col=None,
):
    """Build fastest and lowest-hazard routes for all five supported locations."""
    manifest, manifest_hash = _read_manifest(input_manifest)
    dem = read_primary_dem(input_manifest)
    sources = _handoff_sources(manifest, dem)
    constants_raw, c = read_constants(constants_path)
    constants_raw.pop("_mock", None)
    constants_raw.pop("_note", None)
    constants_bytes = _json_bytes(constants_raw)
    constants_hash = hashlib.sha256(constants_bytes).hexdigest()
    stops = _read_stops(stops_path, dem)

    graph = build_graph(
        dem.elevation_m,
        resolution_m=dem.resolution_m,
        nodata=None,
        max_slope_deg=c["slope_limit_foot_deg"],
        body_mass_kg=c["body_mass_kg"],
        load_kg=c["carried_load_kg"],
        kappa=c["suit_factor_kappa"],
        watts_to_o2_ml_per_min=c["watts_to_o2_ml_per_min"],
        max_speed_mps=c["walk_speed_kmh"] / 3.6,
    )
    if habitat_row_col is None:
        habitat, habitat_note = _choose_habitat(dem, graph, stops)
    else:
        habitat = tuple(map(int, habitat_row_col))
        if len(habitat) != 2 or not (0 <= habitat[0] < dem.height and 0 <= habitat[1] < dem.width):
            raise ValueError("habitat row/column is outside the planning grid")
        if not graph.valid[habitat]:
            raise ValueError("habitat falls on nodata or a hard slope mask")
        habitat_note = "Explicit row/column supplied on the command line."
    if not graph.valid[habitat]:
        raise ValueError("selected habitat is hard-blocked")

    budget = c["o2_usable_primary_l"] - max(
        c["reserve_fraction"] * c["o2_usable_primary_l"],
        c["reserve_minutes"] * c["walkback_o2_lpm"],
    )
    output_dir = Path(output_dir).resolve()
    routes_dir = output_dir / "routes"
    routes_dir.mkdir(parents=True, exist_ok=True)
    route_index = {"routes": []}
    route_statuses = {}
    exported_files = []
    habitat_lonlat = _cell_lonlat(*habitat, dem)

    for stop_id in SUPPORTED_STOPS:
        stop = stops[stop_id]
        for mode, objective in (("fastest", "time"), ("safest", "hazard")):
            route_id = f"{stop_id}_{mode}_{int(c['crew_size_default'])}_{int(c['carried_load_kg'])}"
            filename = f"{route_id}.json"
            record = {
                "id": route_id,
                "stop": stop_id,
                "mode": mode,
                "crew": int(c["crew_size_default"]),
                "load_kg": c["carried_load_kg"],
                "file": f"routes/{filename}",
            }
            try:
                path = shortest_path(graph, start=habitat, goal=stop["cell"], objective=objective)
                arrays = route_arrays(
                    graph,
                    path.nodes,
                    coordinates=lambda node: _cell_lonlat(*graph.cell(node), dem),
                )
                pnr = point_of_no_return(
                    arrays["cum"]["o2_l"],
                    arrays["back"]["o2_l"],
                    capacity_l=c["o2_usable_primary_l"],
                    reserve_fraction=c["reserve_fraction"],
                    reserve_minutes=c["reserve_minutes"],
                    walkback_o2_lpm=c["walkback_o2_lpm"],
                    return_margin=c["return_cost_margin"],
                    member_factors=[1.0, 1.0][: int(c["crew_size_default"])],
                )
                route_payload = {
                    **arrays,
                    **record,
                    "stop_name": stop["name"],
                    "badge": "Scenario",
                    "budget_l": pnr.budget_l,
                    "pnr_index": pnr.pnr_index,
                    "constants_hash": constants_hash,
                    "habitat_cell_rc": list(habitat),
                    "goal_cell_rc": list(stop["cell"]),
                    "objective_cost": path.objective_cost,
                    "distance_m": float(sum(item["cost_terms"]["distance_m"] for item in arrays["seg"])),
                    "input_sha256": dem.source_sha256,
                    "model_note": "Scenario: 10 m mean-elevation slopes and thermal terrain factor 1.0; no sub-cell scarp or THEMIS sand cost is available in this route input.",
                }
                _write_json(routes_dir / filename, route_payload)
                exported_files.append(routes_dir / filename)
                record.update({"total_s": arrays["total_s"], "pnr_index": pnr.pnr_index, "status": "routed"})
                route_statuses[route_id] = {"status": "routed", "time_s": path.time_s, "objective_cost": path.objective_cost}
            except ValueError as exc:
                record.update({"file": None, "status": "unreachable", "reason": str(exc)})
                route_statuses[route_id] = {"status": "unreachable", "reason": str(exc)}
            route_index["routes"].append(record)

    origin_lonlat = transform(dem.crs, MARS_GEOGRAPHIC_CRS, [dem.transform.c], [dem.transform.f])
    meta = {
        "ops_box": {
            "west": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][0],
            "south": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][1],
            "east": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][2],
            "north": manifest["scope_box_lonlat_east_positive_planetocentric_deg"][3],
        },
        "crs": MARS_GEOGRAPHIC_CRS,
        "analysis_crs": dem.crs.to_wkt(),
        "grid": {
            "resolution_m": dem.resolution_m,
            "width": dem.width,
            "height": dem.height,
            "origin_lonlat": [float(origin_lonlat[0][0]), float(origin_lonlat[1][0])],
            "origin_projected_m": [dem.transform.c, dem.transform.f],
            "cell_value": "mean elevation from ~1.01 m HiRISE DTM average-resampled to ~9.88 m planning cells",
        },
        "nodata": dem.nodata,
        "habitat": {"lonlat": habitat_lonlat, "row_col": list(habitat), "badge": "Scenario", "note": habitat_note},
        "build_date": date.today().isoformat(),
        "constants_hash": constants_hash,
        "input_hash": manifest_hash,
    }
    # Keep this additive metadata deterministic and explicit rather than implying native 1 m routing.
    build_manifest = {
        "engine": "RedSight Python NumPy rasterio SciPy sparse Dijkstra",
        "engine_commit": _git_head(Path(__file__).resolve().parents[1]),
        "build_date": date.today().isoformat(),
        "command": "python3 -m engine build --input-manifest <manifest> --constants <constants.json> --stops <stops.json> --out <app/public/data>",
        "inputs": sources,
        "stops_sha256": sha256_file(stops_path),
        "constants_sha256": constants_hash,
        "analysis_grid": {"rows": dem.height, "columns": dem.width, "cell_size_m": dem.resolution_m, "cell_source": "average-resampled 1.01m DTM; 8-neighbor max slope derived at planning-cell scale"},
        "hard_slope_limit_deg": c["slope_limit_foot_deg"],
        "habitat": {"row_col": list(habitat), "lonlat": habitat_lonlat, "badge": "Scenario", "selection_note": habitat_note},
        "constants": constants_raw,
        "runtime": {"python": platform.python_version(), "numpy": np.__version__, "rasterio": rasterio.__version__, "scipy": scipy_version},
        "route_status": route_statuses,
        "limitations": [
            "The primary crop covers 78.2% of the 600x600 planning grid; complementary-only cells remain blocked.",
            "The overlapping companion DTM differs substantially from the primary scene; its cells are excluded instead of applying an unsupported vertical correction.",
            "Slope hard masks are 8-neighbor maxima over average-resampled approximately 9.88m elevations, not native 1m maximum slopes; smaller scarps are unresolved.",
            "No THEMIS thermal-inertia raster was supplied; the sand/terrain multiplier remains 1.0 and the lowest-hazard objective reflects slope only.",
            "Pandolf and the piecewise walking-speed function are Scenario transfers to Mars; values are estimates, not physiological measurements.",
        ],
    }

    _write_json(output_dir / "constants.json", constants_raw)
    _write_json(output_dir / "meta.json", meta)
    _write_json(routes_dir / "index.json", route_index)
    _write_json(output_dir / "engine-build-manifest.json", build_manifest)
    _write_json(output_dir / "hazards.geojson", _hazards_geojson(dem, graph, c["slope_limit_foot_deg"]))
    return {
        "output_dir": str(output_dir),
        "meta": meta,
        "route_index": route_index,
        "manifest": build_manifest,
        "exported_files": [str(p) for p in exported_files],
        "route_status": route_statuses,
    }


def _git_head(repo_root):
    import subprocess

    try:
        return subprocess.check_output(["git", "-C", str(repo_root), "rev-parse", "HEAD"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
