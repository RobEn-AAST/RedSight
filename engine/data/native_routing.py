"""Hash-checked primary native DEM crop and bounded Horn route graph."""

from dataclasses import dataclass
import hashlib
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.warp import transform
from scipy import ndimage

from engine.data.raster import sha256_file
from engine.model.native_grid import NativeRoutingGraph, build_native_routing_graph


NATIVE_ROUTING_MARGIN_M = 250.0


@dataclass
class NativeRoutingInputs:
    graph: NativeRoutingGraph
    habitat_cell: tuple[int, int]
    stop_cells: dict
    projected_points: dict
    asset: dict
    extent: dict


def _native_asset(manifest_path, manifest, expected_crs):
    asset = manifest.get("native_routing")
    if not isinstance(asset, dict):
        raise ValueError("input manifest must identify the hash-checked primary native routing DEM")
    value = asset.get("artifact")
    if not value:
        raise ValueError("native routing manifest must provide its local asset path")
    path = Path(value)
    if not path.is_absolute():
        path = Path(manifest_path).resolve().parent / path
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"native routing DEM is missing: {path}")
    if asset.get("bytes") is not None and path.stat().st_size != int(asset["bytes"]):
        raise ValueError("native routing DEM byte size does not match its manifest")
    digest = sha256_file(path)
    if not asset.get("sha256") or digest.lower() != str(asset["sha256"]).lower():
        raise ValueError("native routing DEM requires a matching SHA-256")
    with rasterio.open(path) as source:
        if source.count != 1:
            raise ValueError("native routing DEM must have exactly one elevation band")
        if source.crs != expected_crs or source.crs is None or not source.crs.is_projected:
            raise ValueError("native routing DEM CRS must match the primary planning DEM")
        if source.transform.b != 0 or source.transform.d != 0:
            raise ValueError("rotated native routing DEM grids are not supported")
        resolution = (abs(source.transform.a) + abs(source.transform.e)) / 2.0
        declared_resolution = float(asset.get("resolution_m", 0.0))
        if declared_resolution <= 0 or not math.isclose(resolution, declared_resolution, rel_tol=1e-4, abs_tol=1e-6):
            raise ValueError("native routing DEM resolution does not match its manifest")
    return path, digest, resolution, dict(asset)


def _project_points(points, crs):
    projected = {}
    for name, lonlat in points.items():
        x, y = transform("+proj=longlat +R=3396190 +no_defs", crs, [lonlat[0]], [lonlat[1]])
        projected[name] = (float(x[0]), float(y[0]))
    return projected


def build_bounded_native_routing_inputs(
    *,
    manifest_path,
    manifest,
    primary_dem,
    habitat_lonlat,
    stops,
    constants,
):
    """Create one bounded graph around the existing Scenario habitat and Observed stops."""
    path, digest, resolution, asset = _native_asset(manifest_path, manifest, primary_dem.crs)
    locations = {"HABITAT": habitat_lonlat}
    locations.update({stop_id: stop["lonlat"] for stop_id, stop in stops.items()})
    with rasterio.open(path) as source:
        source_transform = source.transform
        projected = _project_points(locations, source.crs)
        for name, (x, y) in projected.items():
            if not (source.bounds.left <= x < source.bounds.right and source.bounds.bottom < y <= source.bounds.top):
                raise ValueError(f"{name} is outside the primary native routing DEM window")
        xs = [point[0] for point in projected.values()]
        ys = [point[1] for point in projected.values()]
        margin = NATIVE_ROUTING_MARGIN_M
        col0 = math.floor((min(xs) - margin - source.transform.c) / source.transform.a)
        col1 = math.ceil((max(xs) + margin - source.transform.c) / source.transform.a)
        row0 = math.floor((source.transform.f - (max(ys) + margin)) / abs(source.transform.e))
        row1 = math.ceil((source.transform.f - (min(ys) - margin)) / abs(source.transform.e))
        unclipped = (row0, row1, col0, col1)
        row0, col0 = max(1, row0), max(1, col0)
        row1, col1 = min(source.height - 1, row1), min(source.width - 1, col1)
        if row1 <= row0 or col1 <= col0:
            raise ValueError("bounded native route extent is empty after source coverage clipping")
        core_height, core_width = row1 - row0, col1 - col0
        halo_window = Window(col0 - 1, row0 - 1, core_width + 2, core_height + 2)
        masked = source.read(1, window=halo_window, masked=True)
        halo_elevation = np.asarray(masked.data, dtype=np.float32).copy()
        valid = ~np.ma.getmaskarray(masked) & np.isfinite(halo_elevation)
        halo_elevation[~valid] = 0.0
        kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32) / (8.0 * resolution)
        ky = np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=np.float32) / (8.0 * resolution)
        gx = ndimage.convolve(halo_elevation, kx, mode="constant", cval=0.0)
        gy = ndimage.convolve(halo_elevation, ky, mode="constant", cval=0.0)
        horn_valid = ndimage.minimum_filter(valid.astype(np.uint8), size=3, mode="constant", cval=0).astype(bool)
        np.hypot(gx, gy, out=gx)
        np.arctan(gx, out=gx)
        gx *= np.float32(180.0 / math.pi)
        core = (slice(1, -1), slice(1, -1))
        elevation = halo_elevation[core].copy()
        slope = gx[core].copy()
        slope[~horn_valid[core]] = np.nan
        core_transform = source.window_transform(Window(col0, row0, core_width, core_height))

    graph = build_native_routing_graph(
        elevation,
        slope,
        transform=core_transform,
        crs=primary_dem.crs,
        resolution_m=resolution,
        slope_limit_deg=constants["slope_limit_foot_deg"],
        body_mass_kg=constants["body_mass_kg"],
        load_kg=constants["carried_load_kg"],
        kappa=constants["suit_factor_kappa"],
        watts_to_o2_ml_per_min=constants["watts_to_o2_ml_per_min"],
        max_speed_mps=constants["walk_speed_kmh"] / 3.6,
        source_row0=row0,
        source_col0=col0,
    )

    def local_cell(point_name):
        x, y = projected[point_name]
        row = math.floor((source_transform.f - y) / abs(source_transform.e)) - row0
        col = math.floor((x - source_transform.c) / source_transform.a) - col0
        if not (0 <= row < core_height and 0 <= col < core_width):
            raise ValueError(f"{point_name} fell outside the bounded native route extent")
        return int(row), int(col)

    habitat_cell = local_cell("HABITAT")
    stop_cells = {stop_id: local_cell(stop_id) for stop_id in stops}
    extent = {
        "requested_margin_m": margin,
        "source_bounds_clipped": unclipped != (row0, row1, col0, col1),
        "source_row_col_bounds_inclusive": [[row0, col0], [row1 - 1, col1 - 1]],
        "source_shape_hw": [core_height, core_width],
        "source_pixel_count": int(core_height * core_width),
        "walkable_source_pixels": int(graph.walkable.sum()),
        "valid_horn_source_pixels": int(np.isfinite(graph.slope_deg).sum()),
        "projected_bounds_m": [
            float(core_transform.c),
            float(core_transform.f + core_height * core_transform.e),
            float(core_transform.c + core_width * core_transform.a),
            float(core_transform.f),
        ],
        "optimization_scope": (
            "Fastest and lowest-modeled-hazard paths are minimized only inside the union of the existing Scenario habitat "
            "and Observed stop coordinates expanded by the stated source-data margin. This is a corridor-limited optimum."
        ),
    }
    source_asset = {
        "local_path": str(path),
        "sha256": digest,
        "bytes": path.stat().st_size,
        "source_resolution_m": resolution,
        "source_url": asset.get("source_url", ""),
        "license": asset.get("license", ""),
        "source_item": asset.get("source_item", ""),
    }
    return NativeRoutingInputs(graph, habitat_cell, stop_cells, projected, source_asset, extent)
