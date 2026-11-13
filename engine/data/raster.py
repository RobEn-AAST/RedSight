"""Hash-checked ingest of the team handoff's projected Mars DEM crops."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio


@dataclass(frozen=True)
class RasterDem:
    elevation_m: np.ndarray
    valid: np.ndarray
    crs: rasterio.crs.CRS
    transform: rasterio.Affine
    width: int
    height: int
    nodata: float | None
    resolution_x_m: float
    resolution_y_m: float
    source_path: str
    source_url: str
    license: str
    local_crop_sha256: str
    manifest_sha256: str

    @property
    def resolution_m(self):
        if not np.isclose(self.resolution_x_m, self.resolution_y_m, rtol=1e-4):
            raise ValueError("non-square planning cells are not supported")
        return (self.resolution_x_m + self.resolution_y_m) / 2


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _find_role(manifest, role):
    matches = [item for item in manifest.get("inputs", []) if item.get("role") == role]
    if len(matches) != 1:
        raise ValueError(f"manifest must contain exactly one input with role {role!r}")
    return matches[0]


def read_primary_dem(manifest_path: str | Path) -> RasterDem:
    """Open the average-resampled primary DEM, preserving its nodata as a hard mask.

    The complementary acquisition is intentionally not silently merged here. The handoff manifest
    reports substantial scene-to-scene height differences on overlap; callers can inspect the
    complement but route construction uses a source-consistent mask until those offsets are resolved.
    """
    manifest_path = Path(manifest_path).resolve()
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    item = _find_role(manifest, "Primary HiRISE DTM")
    source_path = Path(item["local_crop"]).resolve()
    if not source_path.is_file():
        raise FileNotFoundError(f"primary DTM crop missing: {source_path}")
    actual_size = source_path.stat().st_size
    if item.get("local_crop_bytes") is not None and actual_size != int(item["local_crop_bytes"]):
        raise ValueError("primary DTM crop byte size does not match its manifest")
    digest = sha256_file(source_path)
    expected_digest = item.get("local_crop_sha256")
    if expected_digest and digest.lower() != expected_digest.lower():
        raise ValueError("primary DTM crop checksum does not match its manifest")

    with rasterio.open(source_path) as dataset:
        if dataset.count != 1:
            raise ValueError("primary DTM must have exactly one elevation band")
        crs_wkt = "" if dataset.crs is None else dataset.crs.to_wkt()
        mars_sphere = "3396190" in crs_wkt and dataset.crs.linear_units == "metre"
        named_mars_crs = "Mars" in crs_wkt and dataset.crs.linear_units == "metre"
        if dataset.crs is None or not dataset.crs.is_projected or not (mars_sphere or named_mars_crs):
            raise ValueError("primary DTM must declare a Mars projected CRS")
        if dataset.width < 2 or dataset.height < 2:
            raise ValueError("primary DTM must contain at least 2 by 2 cells")
        if dataset.transform.b != 0 or dataset.transform.d != 0:
            raise ValueError("rotated planning rasters are not supported")
        values = dataset.read(1, masked=True).astype(np.float64)
        valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data)
        elevation = np.asarray(values.data, dtype=np.float64).copy()
        elevation[~valid] = np.nan
        shape = (dataset.height, dataset.width)
        expected_shape = manifest.get("coverage", {}).get("shape_hw")
        if expected_shape is not None and list(shape) != list(expected_shape):
            raise ValueError("primary DTM crop shape does not match the manifest coverage grid")
        return RasterDem(
            elevation_m=elevation,
            valid=valid,
            crs=dataset.crs,
            transform=dataset.transform,
            width=dataset.width,
            height=dataset.height,
            nodata=dataset.nodata,
            resolution_x_m=abs(dataset.transform.a),
            resolution_y_m=abs(dataset.transform.e),
            source_path=str(source_path),
            source_url=item.get("source_url", ""),
            license=item.get("license", ""),
            local_crop_sha256=digest,
            manifest_sha256=hashlib.sha256(manifest_bytes).hexdigest(),
        )
