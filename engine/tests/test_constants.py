import json
from pathlib import Path

from engine.model.constants import read_constants


def test_read_constants_adds_source_urls_without_replacing_descriptive_source():
    source_path = Path(__file__).parents[2] / "app/public/data/constants.json"
    raw, values = read_constants(source_path)

    assert set(values) <= set(raw)
    assert len(raw) >= len(values)
    for key, record in raw.items():
        assert record["source"], key
        assert record["source_url"], key
    assert raw["reserve_fraction"]["source"] == "Team assumption (no official Mars figure)"
    assert raw["reserve_fraction"]["source_url"].startswith("https://")
