"""Verification suite for Ayman's must-ship stops and context cards.

Run from repo root:
    python engine/content/test_stops_and_cards.py
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "app" / "public" / "data"
CARDS_DIR = DATA_DIR / "cards"

EXPECTED_STOPS = ("S1", "S2", "S3", "D1", "D2")
OPS_BOX = {"west": 137.335, "east": 137.435, "south": -4.85, "north": -4.75}
VALID_BADGES = {"Observed", "Derived", "Scenario", "Unavailable"}
BANNED_PHRASES = (
    "safe route",
    "safe time remaining",
    "certified",
    "flight-safe",
    "real-time",
    "validated",
)
ALLOWED_OWNED_PREFIXES = (
    "app/public/data/stops.json",
    "app/public/data/cards/",
    "engine/content/",
)


def load_json(path: Path) -> Any:
    assert path.exists(), f"Missing required file: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def walk_strings_and_keys(obj: Any) -> tuple[list[str], list[str]]:
    keys: list[str] = []
    strings: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.append(str(k))
            sub_k, sub_s = walk_strings_and_keys(v)
            keys.extend(sub_k)
            strings.extend(sub_s)
    elif isinstance(obj, list):
        for item in obj:
            sub_k, sub_s = walk_strings_and_keys(item)
            keys.extend(sub_k)
            strings.extend(sub_s)
    elif isinstance(obj, str):
        strings.append(obj)
    return keys, strings


def assert_clean_content(label: str, data: Any) -> None:
    keys, strings = walk_strings_and_keys(data)
    assert "_mock" not in keys, f"{label} still contains _mock key"
    for s in strings:
        assert "TODO" not in s, f"{label} contains TODO placeholder: {s!r}"
        lower = s.lower()
        for phrase in BANNED_PHRASES:
            pattern = rf"\b{re.escape(phrase)}\b"
            assert not re.search(pattern, lower), f"{label} contains banned phrase {phrase!r}: {s!r}"


def main() -> None:
    stops_fc = load_json(DATA_DIR / "stops.json")
    stop_cards_doc = load_json(CARDS_DIR / "stops.json")
    rad_card = load_json(CARDS_DIR / "rad.json")
    rems_card = load_json(CARDS_DIR / "rems.json")
    routes_index = load_json(DATA_DIR / "routes" / "index.json")

    for label, doc in (
        ("stops.json", stops_fc),
        ("cards/stops.json", stop_cards_doc),
        ("cards/rad.json", rad_card),
        ("cards/rems.json", rems_card),
    ):
        assert_clean_content(label, doc)

    # 1. Verify stops.json GeoJSON structure & ops-box bounds.
    assert stops_fc.get("type") == "FeatureCollection", "stops.json must be a GeoJSON FeatureCollection"
    features = stops_fc.get("features", [])
    stop_ids = [f.get("properties", {}).get("id") for f in features]
    assert tuple(stop_ids) == EXPECTED_STOPS, f"Expected stop IDs {EXPECTED_STOPS}, got {stop_ids}"

    route_stops = {r["stop"] for r in routes_index.get("routes", [])}
    assert set(stop_ids) == route_stops, f"stops.json IDs {set(stop_ids)} != routes/index.json {route_stops}"

    required_card_keys = ("target_name", "target_type", "sol", "rock_type", "size", "location", "source_url", "badge")
    for feat in features:
        geom = feat.get("geometry", {})
        assert geom.get("type") == "Point", f"Expected Point geometry for {feat}"
        lon, lat = geom.get("coordinates", [None, None])
        assert isinstance(lon, (int, float)) and isinstance(lat, (int, float))
        assert OPS_BOX["west"] <= lon <= OPS_BOX["east"], f"Lon {lon} outside ops box"
        assert OPS_BOX["south"] <= lat <= OPS_BOX["north"], f"Lat {lat} outside ops box"

        props = feat["properties"]
        sid = props["id"]
        assert props.get("badge") in VALID_BADGES, f"{sid}: invalid badge {props.get('badge')}"
        assert isinstance(props.get("science"), str) and len(props["science"]) > 30, f"{sid}: empty/short science text"
        photos = props.get("photos", [])
        assert isinstance(photos, list) and len(photos) >= 3, f"{sid}: expected >=3 photos, got {len(photos)}"
        for p in photos:
            assert p.get("url", "").startswith("https://"), f"{sid}: invalid photo URL {p}"
            assert p.get("badge") in VALID_BADGES, f"{sid}: invalid photo badge {p}"

        card = props.get("card", {})
        for k in required_card_keys:
            assert card.get(k), f"{sid}: missing card.{k}"
        assert card["badge"] in VALID_BADGES, f"{sid}: invalid card badge"

    # 2. Verify cards/stops.json matches stops.json.
    cards_list = stop_cards_doc.get("cards", [])
    assert [c.get("id") for c in cards_list] == list(EXPECTED_STOPS), "cards/stops.json IDs mismatch"

    # 3. Verify RAD and REMS cards have real values and valid badges.
    for name, card in (("cards/rad.json", rad_card), ("cards/rems.json", rems_card)):
        assert card.get("badge") in VALID_BADGES, f"{name}: invalid card badge"
        assert len(card.get("values", [])) >= 3, f"{name}: expected >=3 values"
        assert len(card.get("limits", [])) >= 1, f"{name}: expected >=1 limit/boundary"
        assert card.get("source") and card.get("date_range"), f"{name}: missing source or date_range"

    # 4. Verify git working-tree changes stay strictly inside Ayman's owned paths.
    git_out = subprocess.check_output(
        ["git", "status", "--porcelain", "-uall"],
        cwd=REPO_ROOT,
        text=True,
    )
    for line in git_out.splitlines():
        if not line.strip():
            continue
        rel_path = line[3:].strip().strip('"').replace("\\", "/")
        assert rel_path.startswith(ALLOWED_OWNED_PREFIXES), (
            f"Modified path outside Ayman's owned folders: {rel_path}"
        )

    print("ALL CHECKS PASSED:")
    print(f"  - Verified {len(features)} stops ({', '.join(stop_ids)}) inside ops box")
    print(f"  - Verified photos (>=3 each), sample-page cards, RAD card, REMS card")
    print("  - Verified zero _mock flags, zero TODOs, zero banned words, and strict folder ownership")


if __name__ == "__main__":
    main()
