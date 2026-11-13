"""Hash-checked native-slope hard-mask cache for a Mars planning grid."""

from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import rasterio

from engine.data.raster import sha256_file


@dataclass(frozen=True)
class NativeHardSlope:
    slope_deg: np.ndarray
    valid: np.ndarray
    local_path: str
    local_sha256: str
    manifest_sha256: str
    source_url: str
    license: str
    algorithm: str
    aggregation: str
    source_resolution_m: float
    planning_resolution_m: float
    alignment_evidence: object


def _asset_from_manifest(raw):
    for key in ("native_hard_slope", "native_slope", "hard_slope_grid", "slope_cache", "hard_slope", "cached_slope"):
        asset = raw.get(key)
        if isinstance(asset, dict):
            return asset
    outputs = raw.get("outputs")
    if isinstance(outputs, dict):
        for key in ("native_hard_slope", "native_slope", "hard_slope_grid", "slope_cache", "hard_slope", "cached_slope"):
            asset = outputs.get(key)
            if isinstance(asset, dict):
                return asset
    for item in raw.get("artifacts", raw.get("inputs", [])):
        role = str(item.get("role", "")).lower()
        if "horn" in role and "slope" in role:
            return item
    raise ValueError("native hazard manifest must identify its Horn slope cache artifact")


def _finite_number(obj, names, label):
    for name in names:
        value = obj.get(name)
        if isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value):
            return float(value)
    raise ValueError(f"native hazard manifest is missing finite {label}")


def read_native_hard_slope(manifest_path, dem):
    """Read max/p90 Horn slope already aggregated onto the primary DEM planning grid.

    The cache must match the mean-elevation grid exactly. Nodata is retained and becomes a hard
    block; the average-resampled DEM's coarse gradient is never substituted for missing native slope.
    """
    manifest_path = Path(manifest_path).resolve()
    manifest_bytes = manifest_path.read_bytes()
    raw = json.loads(manifest_bytes)
    asset = _asset_from_manifest(raw)
    path_value = asset.get("local_path", asset.get("path", asset.get("artifact_path", asset.get("cache_path"))))
    if not path_value:
        raise ValueError("native hazard manifest must give the slope cache path")
    path = Path(path_value)
    if not path.is_absolute():
        path = manifest_path.parent / path
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"native slope cache missing: {path}")
    size = path.stat().st_size
    expected_bytes = asset.get("bytes", asset.get("size_bytes"))
    if expected_bytes is not None and size != int(expected_bytes):
        raise ValueError("native slope cache byte size does not match its manifest")
    digest = sha256_file(path)
    expected_digest = asset.get("local_sha256", asset.get("sha256", asset.get("checksum", asset.get("sha_256"))))
    if expected_digest and str(expected_digest).lower().startswith("sha256:"):
        expected_digest = str(expected_digest).split(":", 1)[1]
    if not expected_digest or digest.lower() != str(expected_digest).lower():
        raise ValueError("native slope cache requires a matching SHA-256 in its manifest")

    process = raw.get("processing", {})
    source = raw.get("source", {}) if isinstance(raw.get("source", {}), dict) else {}
    grid = raw.get("planning_grid", raw.get("grid", {}))
    if not isinstance(grid, dict):
        grid = {}
    algorithm = str(asset.get("algorithm", process.get("algorithm", raw.get("algorithm", ""))))
    if "horn" not in algorithm.lower():
        raise ValueError("native slope cache must identify the Horn slope algorithm")
    aggregation = str(asset.get("aggregation", process.get("aggregation", raw.get("aggregation", ""))))
    normalized_aggregation = aggregation.lower().replace("_", " ").replace("-", " ").strip()
    accepted_aggregations = {"max", "maximum", "p90", "90th percentile", "percentile 90", "90 percentile"}
    if normalized_aggregation not in accepted_aggregations and not normalized_aggregation.startswith("maximum "):
        raise ValueError("native slope aggregation must be maximum or 90th percentile")
    units = str(asset.get("units", asset.get("unit", process.get("units", "")))).lower()
    if units not in {"degree", "degrees", "deg", "°"}:
        raise ValueError("native slope cache units must be degrees")
    try:
        source_resolution = _finite_number(
            asset, ("source_resolution_m", "native_resolution_m", "native_pixel_size_m"), "native source resolution"
        )
    except ValueError:
        source_resolution = _finite_number(source, ("resolution_m", "pixel_size_m"), "native source resolution")
    try:
        planning_resolution = _finite_number(
            asset, ("planning_resolution_m", "target_resolution_m", "cell_size_m"), "planning-grid resolution"
        )
    except ValueError:
        planning_resolution = _finite_number(grid, ("resolution_m", "cell_size_m"), "planning-grid resolution")
    if source_resolution <= 0 or source_resolution > dem.resolution_m * 1.01:
        raise ValueError("native slope source resolution must be positive and no coarser than the planning grid")
    if not np.isclose(planning_resolution, dem.resolution_m, rtol=1e-4, atol=1e-6):
        raise ValueError("native slope aggregation target resolution does not match the primary DEM grid")

    with rasterio.open(path) as dataset:
        if dataset.count != 1:
            raise ValueError("native slope cache must have exactly one band")
        if dataset.shape != (dem.height, dem.width):
            raise ValueError("native slope cache shape does not match the primary DEM grid")
        transform_a = np.asarray(tuple(dataset.transform)[:6], dtype=np.float64)
        transform_b = np.asarray(tuple(dem.transform)[:6], dtype=np.float64)
        if not np.allclose(transform_a, transform_b, rtol=0.0, atol=1e-6) or dataset.crs != dem.crs:
            raise ValueError("native slope cache CRS/transform does not exactly match the primary DEM grid")
        values = dataset.read(1, masked=True).astype(np.float64)
        valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data)
        slope = np.asarray(values.data, dtype=np.float64).copy()
        if np.any((slope[valid] < 0.0) | (slope[valid] > 90.0)):
            raise ValueError("native slope values must lie in [0, 90] degrees")
        valid &= dem.valid
        slope[~valid] = np.nan

    manifest_digest = hashlib.sha256(manifest_bytes).hexdigest()
    alignment = raw.get(
        "s1_landmark_alignment",
        raw.get("S1_landmark_alignment", raw.get("alignment_evidence", raw.get("landmark_alignment"))),
    )
    if not alignment:
        raise ValueError("native hazard manifest must include S1 landmark-alignment evidence")
    return NativeHardSlope(
        slope_deg=slope,
        valid=valid,
        local_path=str(path),
        local_sha256=digest,
        manifest_sha256=manifest_digest,
        source_url=str(asset.get("source_url", raw.get("source_url", ""))),
        license=str(asset.get("license", raw.get("license", ""))),
        algorithm=algorithm,
        aggregation=aggregation,
        source_resolution_m=source_resolution,
        planning_resolution_m=planning_resolution,
        alignment_evidence=alignment,
    )
