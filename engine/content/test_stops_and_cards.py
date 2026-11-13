"""Verification suite for Ayman's must-ship stops and context cards.

Run with pytest or directly from repo root:
    python -m pytest engine/content/test_stops_and_cards.py
    python engine/content/test_stops_and_cards.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_stops_and_cards as builder  # noqa: E402

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
FORBIDDEN_STOP_PROP_KEYS = {
    "lon",
    "lat",
    "sol",
    "scienceText",
    "detail",
    "photo_urls",
    "sample_mass_scenario_kg",
}
INVENTED_TERMS = (
    "altadena member",
    "boxwork member",
    "hollow facies",
    "sim 3292",
    "htu",
    "mcd v6.2",
    "sols 1–4843",
    "sols 1-4843",
)
USER_AGENT = "RedSight-NASA-SpaceApps/1.0"


def _load_json(path: Path) -> Any:
    assert path.exists(), f"Missing required file: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def _walk_strings_and_keys(obj: Any) -> tuple[list[str], list[str]]:
    keys: list[str] = []
    strings: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.append(str(k))
            sub_k, sub_s = _walk_strings_and_keys(v)
            keys.extend(sub_k)
            strings.extend(sub_s)
    elif isinstance(obj, list):
        for item in obj:
            sub_k, sub_s = _walk_strings_and_keys(item)
            keys.extend(sub_k)
            strings.extend(sub_s)
    elif isinstance(obj, str):
        strings.append(obj)
    return keys, strings


def _assert_clean_content(label: str, data: Any) -> None:
    keys, strings = _walk_strings_and_keys(data)
    assert "_mock" not in keys, f"{label} still contains _mock key"
    for s in strings:
        assert "TODO" not in s, f"{label} contains TODO placeholder: {s!r}"
        lower = s.lower()
        for phrase in BANNED_PHRASES:
            pattern = rf"\b{re.escape(phrase)}\b"
            assert not re.search(pattern, lower), f"{label} contains banned phrase {phrase!r}: {s!r}"
        for term in INVENTED_TERMS:
            assert term not in lower, f"{label} contains unverified/invented term {term!r}: {s!r}"


def _skip_if_offline(exc: BaseException | None = None) -> None:
    if os.environ.get("REDSIGHT_OFFLINE") == "1":
        pytest.skip("REDSIGHT_OFFLINE=1 set; skipping live network check")
    if exc is not None:
        if isinstance(exc, urllib.error.HTTPError):
            raise exc
        if isinstance(exc, (urllib.error.URLError, TimeoutError, OSError)):
            pytest.skip(f"Offline or network unreachable ({exc}); skipping live network check")


def _head_or_get_status(url: str, timeout: int = 15) -> int:
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(
            url,
            method=method,
            headers={"User-Agent": USER_AGENT, "Range": "bytes=0-1024"} if method == "GET" else {"User-Agent": USER_AGENT},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return int(resp.status)
        except urllib.error.HTTPError as exc:
            if method == "HEAD" and exc.code in (405, 501):
                continue
            return int(exc.code)
    return 0


def test_stops_schema_and_size() -> None:
    """Verify RFC 7946 GeoJSON schema, compact file size, no duplicate fields, and removed cards/stops.json."""
    assert not (CARDS_DIR / "stops.json").exists(), "Uncontracted duplicate cards/stops.json must be removed"

    stops_path = DATA_DIR / "stops.json"
    stops_fc = _load_json(stops_path)
    routes_index = _load_json(DATA_DIR / "routes" / "index.json")

    assert stops_path.stat().st_size < 20_480, (
        f"stops.json should be compact (< 20 KB), got {stops_path.stat().st_size} bytes"
    )
    _assert_clean_content("stops.json", stops_fc)

    assert stops_fc.get("type") == "FeatureCollection", "stops.json must be a GeoJSON FeatureCollection"
    assert "crs" not in stops_fc, "RFC 7946 GeoJSON must not emit top-level 'crs'"
    assert "updated" not in stops_fc, "Non-reproducible build timestamp must not be emitted in stops.json"

    features = stops_fc.get("features", [])
    stop_ids = [f.get("properties", {}).get("id") for f in features]
    assert tuple(stop_ids) == EXPECTED_STOPS, f"Expected stop IDs {EXPECTED_STOPS}, got {stop_ids}"

    route_stops = {r["stop"] for r in routes_index.get("routes", [])}
    assert set(stop_ids) == route_stops, f"stops.json IDs {set(stop_ids)} != routes/index.json {route_stops}"

    required_card_keys = (
        "rmc",
        "site",
        "drive",
        "elev_m",
        "dist_km",
        "location",
        "waypoint_badge",
        "target_name",
        "target_type",
        "sol",
        "geologic_context",
        "context_badge",
        "source_url",
    )
    for feat in features:
        geom = feat.get("geometry", {})
        assert geom.get("type") == "Point", f"Expected Point geometry for {feat}"
        lon, lat = geom.get("coordinates", [None, None])
        assert isinstance(lon, (int, float)) and isinstance(lat, (int, float))
        assert OPS_BOX["west"] <= lon <= OPS_BOX["east"], f"Lon {lon} outside ops box"
        assert OPS_BOX["south"] <= lat <= OPS_BOX["north"], f"Lat {lat} outside ops box"

        props = feat["properties"]
        sid = props["id"]
        bad_prop_keys = set(props.keys()) & FORBIDDEN_STOP_PROP_KEYS
        assert not bad_prop_keys, f"{sid}: unexpected bloated/duplicate property keys {bad_prop_keys}"
        assert props.get("badge") == "Observed", f"{sid}: stop badge must be Observed, got {props.get('badge')}"
        assert isinstance(props.get("science"), str) and len(props["science"]) > 30, f"{sid}: short science text"
        assert "interpreted" not in props["science"].lower(), (
            f"{sid}: interpretive prose belongs in card.geologic_context (Derived), not properties.science (Observed)"
        )

        card = props.get("card", {})
        bad_card_keys = (set(card.keys()) & {"photos", "sample_mass_scenario_kg", "badge"})
        assert not bad_card_keys, f"{sid}: card contains disallowed keys {bad_card_keys}"
        for k in required_card_keys:
            assert card.get(k) is not None and card.get(k) != "", f"{sid}: missing card.{k}"
        assert card["waypoint_badge"] == "Observed", f"{sid}: card.waypoint_badge must be Observed"
        assert card["context_badge"] == "Derived", f"{sid}: card.context_badge must be Derived"

    s1 = next(f for f in features if f["properties"]["id"] == "S1")
    assert s1["properties"]["sols"] == [4541, 4542, 4543, 4544], "S1 sols must match PIA26559 dates (sols 4541-4544)"
    assert s1["properties"]["panorama_meta"]["sol_range"] == "4541–4544"
    assert "RMC 116_414" in s1["properties"]["evidence"]

    s2 = next(f for f in features if f["properties"]["id"] == "S2")
    assert s2["properties"]["sols"] == [4714, 4715, 4740, 4741], "S2 sols must fall inside PIA26696 mosaic window"
    s2_meta = s2["properties"]["panorama_meta"]
    assert s2_meta["sol_range"] == "4714–4741"
    assert "jpegMod/PIA26696_modest.jpg" in s2_meta["image_url"], "S2 preview must use modest-resolution JPEG"


@pytest.mark.network
def test_coordinates_match_live_mmgis() -> None:
    """Verify every stop (including S3) matches its own recorded RMC in NASA MMGIS within 1.0 m."""
    _skip_if_offline()
    stops_fc = _load_json(DATA_DIR / "stops.json")
    try:
        by_sol_drive, _, current_wp = builder.load_mmgis_waypoints()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _skip_if_offline(exc)
        raise

    expected_keys = {
        "S1": (4541, 414),
        "S2": (4711, 82),
        "D1": (4560, 1944),
        "D2": (4687, 1722),
    }

    for feat in stops_fc["features"]:
        props = feat["properties"]
        sid = props["id"]
        lon, lat = feat["geometry"]["coordinates"]
        card = props["card"]

        if sid == "S3":
            sol_match = re.search(r"(\d+)", str(card["sol"]))
            assert sol_match, f"S3 card.sol missing sol number: {card['sol']!r}"
            s3_key = (int(sol_match.group(1)), int(card["drive"]))
            wp = by_sol_drive.get(s3_key)
            if wp is None and (current_wp["sol"], current_wp["drive"]) == s3_key:
                wp = current_wp
            assert wp is not None, f"S3 recorded waypoint {s3_key} ({card['rmc']}) not found in MMGIS"
        else:
            wp = by_sol_drive[expected_keys[sid]]

        dist_m = builder.mars_distance_m(lon, lat, wp["lon"], wp["lat"])
        assert dist_m < 1.0, f"{sid}: coordinate differs by {dist_m:.2f} m from MMGIS waypoint {wp['rmc']}"
        assert card["rmc"] == wp["rmc"], f"{sid}: card.rmc {card['rmc']} != {wp['rmc']}"
        assert card["site"] == wp["site"], f"{sid}: card.site {card['site']} != {wp['site']}"
        assert card["drive"] == wp["drive"], f"{sid}: card.drive {card['drive']} != {wp['drive']}"
        assert abs(card["elev_m"] - wp["elev_m"]) < 0.05, f"{sid}: elev_m mismatch"
        assert abs(card["dist_km"] - wp["dist_km"]) < 0.05, f"{sid}: dist_km mismatch"
        if sid == "S3":
            assert wp["sol"] in props["sols"], f"S3 recorded sol {wp['sol']} missing from S3.sols {props['sols']}"
            assert f"sol {wp['sol']}" in props["name"], f"S3 name {props['name']!r} missing recorded sol {wp['sol']}"


def test_photos_sols_and_instrument_diversity() -> None:
    """Verify 4 photos/stop, photo sol ∈ stop.sols, 4 distinct instruments, multi-sol spread, and D1 sol 4564."""
    stops_fc = _load_json(DATA_DIR / "stops.json")
    for feat in stops_fc["features"]:
        props = feat["properties"]
        sid = props["id"]
        stop_sols = set(props["sols"])
        photos = props["photos"]

        assert len(photos) == 4, f"{sid}: expected 4 photos, got {len(photos)}"
        photo_sols = [p["sol"] for p in photos]
        instruments = [p["instrument"] for p in photos]

        assert all(s in stop_sols for s in photo_sols), f"{sid}: photo sols {photo_sols} not subset of {stop_sols}"
        assert len(set(instruments)) == 4, f"{sid}: instruments {instruments} must all be distinct"
        if len(stop_sols) > 1:
            assert len(set(photo_sols)) >= 2, f"{sid}: multi-sol stop only returned photos from {set(photo_sols)}"
        assert all(p.get("badge") == "Observed" for p in photos), f"{sid}: invalid photo badge"

        if sid == "D1":
            d1_4564 = [p for p in photos if p["sol"] == 4564 and p["instrument"].startswith("MAST_")]
            assert d1_4564, f"D1 must include a Mastcam photo from drill sol 4564; got {[(p['sol'], p['instrument']) for p in photos]}"


def test_cards_rad_and_rems() -> None:
    """Verify RAD and REMS accuracy, source fields, units, and evidence badges."""
    rad = _load_json(CARDS_DIR / "rad.json")
    rems = _load_json(CARDS_DIR / "rems.json")
    _assert_clean_content("cards/rad.json", rad)
    _assert_clean_content("cards/rems.json", rems)

    # RAD checks
    assert rad["badge"] == "Observed"
    assert rad["date_range"].startswith("2012-08 → 2013-06"), f"Unexpected RAD baseline range: {rad['date_range']}"
    rad_labels = [v["label"] for v in rad["values"]]
    assert not any("across mission" in lbl.lower() for lbl in rad_labels), "Unsupported mission-wide GCR range must be removed"

    sep_rows = [v for v in rad["values"] if "SEP" in v["label"]]
    assert len(sep_rows) == 1 and sep_rows[0]["value"] == 418 and "Si" in sep_rows[0]["unit"], (
        f"Unexpected SEP row: {sep_rows}"
    )
    assert "detector B" in sep_rows[0]["note"], "Sept 2017 Si SEP measurement must cite silicon detector B"

    plastic_rows = [v for v in rad["values"] if "plastic" in v["label"].lower()]
    assert len(plastic_rows) == 1 and "Detector E" in plastic_rows[0]["note"], (
        "Tissue-equivalent plastic scintillator must cite Detector E"
    )
    assert "Berger" not in json.dumps(rad), "Misattributed Berger 2018 citation must not be present"
    assert "Cohen & Mewaldt 2018" in rad["source"] and "16:1616" in rad["source"]
    assert "45:5845" in rad["source"] and "45:5860" not in rad["source"]

    walk_rows = [v for v in rad["values"] if "4-hour" in v["label"]]
    assert len(walk_rows) == 1 and walk_rows[0]["badge"] == "Scenario"
    assert "derived arithmetic" not in walk_rows[0]["note"].lower()

    career_limits = [lim for lim in rad["limits"] if "career" in lim["label"].lower()]
    assert career_limits and "badge" not in career_limits[0], "Policy limit must not carry badge='Observed'"

    # REMS checks
    assert rems["badge"] == "Observed"
    rems_labels = [v["label"].lower() for v in rems["values"]]
    assert not any("cadence" in lbl for lbl in rems_labels), "Sensor cadence must not be mislabeled as Observed measurement"
    armstrong_limits = [lim for lim in rems["limits"] if "armstrong" in lim["label"].lower()]
    assert len(armstrong_limits) == 1 and armstrong_limits[0]["value"] == 6300 and armstrong_limits[0]["unit"] == "Pa"
    assert "badge" not in armstrong_limits[0], "Physiological constant must not carry badge='Observed'"
    rems_dump = json.dumps(rems)
    assert "straddles" not in rems_dump.lower()
    assert "180–278 K" not in rems_dump and "190 K nighttime" not in rems_dump
    assert "119:440" in rems["source"] and "119:1544" not in rems["source"]
    assert builder.REMS_WEATHER_URL in rems["source_urls"]
    assert not any(
        u.endswith("rems.htm") or "pds-geosciences.wustl.edu" in u for u in rems["source_urls"]
    ), "Broken 404 WUSTL rems.htm link must not be present"
    assert len(rems["source_urls"]) >= 2


def test_curiosity_path_geojson() -> None:
    """Verify curiosity_path.geojson schema, Observed badge, ops-box bounds, and chronological waypoints."""
    path_file = DATA_DIR / "curiosity_path.geojson"
    path_fc = _load_json(path_file)
    _assert_clean_content("curiosity_path.geojson", path_fc)

    assert path_fc.get("type") == "FeatureCollection"
    assert "crs" not in path_fc, "RFC 7946 GeoJSON must not emit top-level 'crs'"
    features = path_fc.get("features", [])
    assert len(features) >= 1, "Expected at least one traverse LineString segment"

    prev_sol_end = -1
    total_waypoints = 0
    for feat in features:
        geom = feat.get("geometry", {})
        props = feat.get("properties", {})
        assert geom.get("type") == "LineString"
        coords = geom.get("coordinates", [])
        n = len(coords)
        assert n >= 2
        total_waypoints += n
        assert props.get("kind") == "traverse"
        assert props.get("badge") == "Observed"
        assert props.get("waypoint_count") == n
        assert props.get("sol_start") >= prev_sol_end
        assert props.get("sol_end") >= props.get("sol_start")
        prev_sol_end = props["sol_end"]

        for key in ("sols", "rmcs", "elev_m", "dist_km"):
            arr = props.get(key)
            assert isinstance(arr, list) and len(arr) == n, f"{key} length mismatch"

        sols = props["sols"]
        assert all(sols[i] <= sols[i + 1] for i in range(n - 1)), "sols must be non-decreasing"
        for lon, lat in coords:
            assert OPS_BOX["west"] <= lon <= OPS_BOX["east"], f"Lon {lon} outside ops box"
            assert OPS_BOX["south"] <= lat <= OPS_BOX["north"], f"Lat {lat} outside ops box"

    assert total_waypoints > 400, f"Expected >400 waypoints inside ops box, got {total_waypoints}"


@pytest.mark.network
def test_all_urls_reachable() -> None:
    """Verify photo, panorama, and card URLs load (HTTP 200; DOIs verified via doi.org handle API)."""
    _skip_if_offline()
    stops_fc = _load_json(DATA_DIR / "stops.json")
    rad = _load_json(CARDS_DIR / "rad.json")
    rems = _load_json(CARDS_DIR / "rems.json")

    strict_200_urls: list[str] = []
    source_page_urls: list[str] = []

    for feat in stops_fc["features"]:
        props = feat["properties"]
        for p in props["photos"]:
            strict_200_urls.append(p["url"])
        if props.get("panorama_meta"):
            strict_200_urls.append(props["panorama_meta"]["image_url"])
            strict_200_urls.append(props["panorama_meta"]["full_jpeg_url"])
            source_page_urls.append(props["panorama_meta"]["page_url"])
        source_page_urls.append(props["card"]["source_url"])

    for card in (rad, rems):
        for url in card.get("source_urls", []):
            source_page_urls.append(url)

    try:
        for url in dict.fromkeys(strict_200_urls):
            status = _head_or_get_status(url)
            assert status == 200, f"Media URL returned HTTP {status} (expected 200): {url}"

        for url in dict.fromkeys(source_page_urls):
            parsed = urllib.parse.urlparse(url)
            if parsed.netloc == "doi.org":
                doi_path = parsed.path.lstrip("/")
                handle_data = builder.fetch_json(f"https://doi.org/api/handles/{doi_path}")
                assert handle_data.get("responseCode") == 1, f"DOI handle failed resolution: {url}"
                continue
            status = _head_or_get_status(url)
            # www.jpl.nasa.gov returns HTTP 403 Cloudflare bot challenge to non-browser clients; 404/5xx must still fail.
            if parsed.netloc == "www.jpl.nasa.gov" and status == 403:
                continue
            assert status == 200, f"Source URL returned HTTP {status} (expected 200): {url}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _skip_if_offline(exc)
        raise


def main() -> None:
    tests = (
        test_stops_schema_and_size,
        test_curiosity_path_geojson,
        test_coordinates_match_live_mmgis,
        test_photos_sols_and_instrument_diversity,
        test_cards_rad_and_rems,
        test_all_urls_reachable,
    )
    passed = 0
    skipped = 0
    for fn in tests:
        try:
            fn()
            passed += 1
            print(f"PASS {fn.__name__}")
        except pytest.skip.Exception as exc:
            skipped += 1
            print(f"SKIP {fn.__name__}: {exc}")
    print(f"COMPLETED {len(tests)} CHECKS ({passed} passed, {skipped} skipped).")


if __name__ == "__main__":
    main()
