import hashlib
import json

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from engine.data.hazard import read_native_hard_slope
from engine.data.raster import read_primary_dem


def test_reads_and_hash_checks_primary_projected_dem_without_filling_nodata(tmp_path):
    dem_path = tmp_path / "primary.tif"
    values = np.array([[10, 11, -9999], [12, 13, 14]], dtype=np.float32)
    with rasterio.open(
        dem_path,
        "w",
        driver="GTiff",
        width=3,
        height=2,
        count=1,
        dtype="float32",
        crs="+proj=eqc +R=3396190 +units=m +no_defs",
        transform=from_origin(8_140_000, -280_000, 10, 10),
        nodata=-9999,
    ) as ds:
        ds.write(values, 1)
    digest = hashlib.sha256(dem_path.read_bytes()).hexdigest()
    manifest = tmp_path / "inputs.json"
    manifest.write_text(json.dumps({
        "inputs": [{
            "role": "Primary HiRISE DTM",
            "local_crop": str(dem_path),
            "local_crop_sha256": digest,
            "local_crop_bytes": dem_path.stat().st_size,
        }],
        "coverage": {"shape_hw": [2, 3]},
    }))

    loaded = read_primary_dem(manifest)

    assert loaded.elevation_m.shape == (2, 3)
    assert np.isnan(loaded.elevation_m[0, 2])
    assert loaded.elevation_m[1, 2] == 14
    assert loaded.valid.sum() == 5
    assert loaded.resolution_m == 10
    assert loaded.local_crop_sha256 == digest


def test_native_horn_slope_cache_is_hash_checked_and_grid_aligned(tmp_path):
    dem_path = tmp_path / "primary.tif"
    dem_values = np.array([[10, 11, 12], [13, -9999, 15], [16, 17, 18]], dtype=np.float32)
    transform = from_origin(8_140_000, -280_000, 10, 10)
    crs = "+proj=eqc +R=3396190 +units=m +no_defs"
    with rasterio.open(dem_path, "w", driver="GTiff", width=3, height=3, count=1,
                       dtype="float32", crs=crs, transform=transform, nodata=-9999) as ds:
        ds.write(dem_values, 1)
    dem_digest = hashlib.sha256(dem_path.read_bytes()).hexdigest()
    dem_manifest = tmp_path / "inputs.json"
    dem_manifest.write_text(json.dumps({
        "inputs": [{"role": "Primary HiRISE DTM", "local_crop": str(dem_path),
                    "local_crop_sha256": dem_digest, "local_crop_bytes": dem_path.stat().st_size}],
        "coverage": {"shape_hw": [3, 3]},
    }))
    dem = read_primary_dem(dem_manifest)

    slope_path = tmp_path / "horn-slope.tif"
    slopes = np.array([[1, 2, 3], [4, -9999, 18], [7, 8, 9]], dtype=np.float32)
    with rasterio.open(slope_path, "w", driver="GTiff", width=3, height=3, count=1,
                       dtype="float32", crs=crs, transform=transform, nodata=-9999) as ds:
        ds.write(slopes, 1)
    slope_digest = hashlib.sha256(slope_path.read_bytes()).hexdigest()
    slope_manifest = tmp_path / "native.json"
    slope_manifest.write_text(json.dumps({
        "native_hard_slope": {
            "local_path": str(slope_path), "sha256": slope_digest,
            "bytes": slope_path.stat().st_size, "units": "degrees",
            "algorithm": "Horn 3x3 native DEM slope", "aggregation": "maximum",
            "source_resolution_m": 1.0, "planning_resolution_m": 10.0,
            "license": "CC0-1.0", "source_url": "https://example.invalid/source",
        },
        "s1_landmark_alignment": {"status": "checked", "pixel_delta": 0},
    }))

    hard_slope = read_native_hard_slope(slope_manifest, dem)

    assert hard_slope.slope_deg[1, 2] == 18
    assert np.isnan(hard_slope.slope_deg[1, 1])
    assert hard_slope.valid.sum() == 8
    assert hard_slope.local_sha256 == slope_digest
    assert hard_slope.alignment_evidence == {"status": "checked", "pixel_delta": 0}


def test_alignment_tiepoint_and_independent_review_hashes_are_verified(tmp_path):
    crs = "+proj=eqc +R=3396190 +units=m +no_defs"
    transform = from_origin(8_140_000, -280_000, 10, 10)
    dem_path = tmp_path / "primary.tif"
    with rasterio.open(dem_path, "w", driver="GTiff", width=3, height=3, count=1,
                       dtype="float32", crs=crs, transform=transform, nodata=-9999) as ds:
        ds.write(np.zeros((3, 3), dtype=np.float32), 1)
    dem_digest = hashlib.sha256(dem_path.read_bytes()).hexdigest()
    dem_manifest = tmp_path / "inputs.json"
    dem_manifest.write_text(json.dumps({
        "inputs": [{"role": "Primary HiRISE DTM", "local_crop": str(dem_path),
                    "local_crop_sha256": dem_digest, "local_crop_bytes": dem_path.stat().st_size}],
        "coverage": {"shape_hw": [3, 3]},
    }))
    dem = read_primary_dem(dem_manifest)

    slope_path = tmp_path / "horn-slope.tif"
    with rasterio.open(slope_path, "w", driver="GTiff", width=3, height=3, count=1,
                       dtype="float32", crs=crs, transform=transform, nodata=-9999) as ds:
        ds.write(np.zeros((3, 3), dtype=np.float32), 1)
    slope_digest = hashlib.sha256(slope_path.read_bytes()).hexdigest()
    tiepoint = tmp_path / "tiepoint.json"
    tiepoint.write_text('{"g2": "bounded local tie"}\n')
    review = tmp_path / "independent-review.md"
    review.write_text("Independent local visual review.\n")
    alignment_files = [
        {"role": "tiepoint_json", "path": str(tiepoint), "sha256": hashlib.sha256(tiepoint.read_bytes()).hexdigest()},
        {"role": "independent_visual_review", "path": str(review), "sha256": hashlib.sha256(review.read_bytes()).hexdigest()},
    ]
    slope_manifest = tmp_path / "native.json"
    data = {
        "native_hard_slope": {
            "local_path": str(slope_path), "sha256": slope_digest,
            "bytes": slope_path.stat().st_size, "units": "degrees",
            "algorithm": "Horn 3x3", "aggregation": "maximum",
            "source_resolution_m": 1.0, "planning_resolution_m": 10.0,
        },
        "s1_landmark_alignment": {
            "status": "bounded_qualitative_local_pass",
            "local_path": str(tiepoint), "sha256": alignment_files[0]["sha256"],
            "verified_evidence_files": alignment_files,
        },
    }
    slope_manifest.write_text(json.dumps(data))

    hard_slope = read_native_hard_slope(slope_manifest, dem)

    verified = hard_slope.alignment_evidence["verified_files"]
    assert [item["role"] for item in verified] == ["tiepoint_json", "independent_visual_review"]
    assert verified[0]["sha256"] == alignment_files[0]["sha256"]
    assert verified[1]["sha256"] == alignment_files[1]["sha256"]

    data["s1_landmark_alignment"]["verified_evidence_files"][1]["sha256"] = "0" * 64
    slope_manifest.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="alignment evidence checksum"):
        read_native_hard_slope(slope_manifest, dem)
