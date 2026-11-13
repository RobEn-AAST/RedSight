import hashlib
import json

import numpy as np
import rasterio
from rasterio.transform import from_origin

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
    assert loaded.source_sha256 == digest
