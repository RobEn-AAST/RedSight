"""Build Ayman's must-ship data files: stops.json, cards/rad.json, and cards/rems.json.

Fetches live NASA MMGIS Curiosity waypoints and Curiosity Raw Images API items
(one sol and instrument at a time to ensure instrument and sol diversity),
verifies every historical waypoint by exact (sol, drive) and Mars haversine
cross-check (< 1 m), builds S3 dynamically from MSL_waypoints_current.json, and
writes the §15 contract files into app/public/data/.

Run from repo root:
    python engine/content/build_stops_and_cards.py
"""

from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "app" / "public" / "data"
CARDS_DIR = DATA_DIR / "cards"

USER_AGENT = "RedSight-NASA-SpaceApps/1.0"
MMGIS_WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
MMGIS_CURRENT_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json"
RAW_IMAGES_API = "https://mars.nasa.gov/api/v1/raw_image_items/"

MARS_RADIUS_M = 3_396_190.0
MAX_WAYPOINT_DRIFT_M = 1.0
OPS_BOX = {"west": 137.335, "east": 137.435, "south": -4.85, "north": -4.75}

PREFERRED_INSTRUMENTS: tuple[str, ...] = (
    "MAHLI",
    "MAST_LEFT",
    "MAST_RIGHT",
    "CHEMCAM_RMI",
    "NAV_LEFT_B",
    "NAV_RIGHT_B",
    "FHAZ_LEFT_B",
    "FHAZ_RIGHT_B",
    "RHAZ_LEFT_B",
    "RHAZ_RIGHT_B",
)

# Historical stop specifications (S3 is built dynamically from MSL_waypoints_current.json).
HISTORICAL_STOPS: list[dict[str, Any]] = [
    {
        "id": "S1",
        "name": "First boxwork 360",
        "kind": "panorama",
        "waypoint_key": (4539, 408),
        "extra_waypoints": [(4541, 414)],
        "expected_lonlat": (137.3859207, -4.797816),
        "sols": [4539, 4540, 4541],
        "priority_sols": [4539, 4540, 4541],
        "preferred_first": None,
        "approx": False,
        "evidence": "PIA26559 (Mastcam, 2025-05-15…18, site 116, RMC 116_408)",
        "panorama": "PIA26559",
        "panorama_meta": {
            "id": "PIA26559",
            "title": "Curiosity's First 360-Degree View of Boxwork Patterns",
            "page_url": "https://photojournal.jpl.nasa.gov/catalog/PIA26559",
            "image_url": "https://images-assets.nasa.gov/image/PIA26559/PIA26559~large.jpg",
            "full_jpeg_url": "https://photojournal.jpl.nasa.gov/jpeg/PIA26559.jpg",
            "date_taken": "2025-05-15 to 2025-05-18",
            "sol_range": "4539–4541",
            "stitched_frames": 291,
            "instrument": "Mastcam",
            "credit": "NASA/JPL-Caltech/MSSS",
            "badge": "Observed",
        },
        "science": (
            "Curiosity's first 360-degree Mastcam mosaic inside the Mount Sharp boxwork patterns "
            "(291 stitched frames across sols 4539–4541, May 15–18, 2025). The low crisscrossing ridges "
            "and intervening hollows are interpreted by the science team as ancient bedrock fractures "
            "cemented by minerals deposited from subterranean water that later resisted wind erosion."
        ),
        "card_static": {
            "target_name": "Boxwork Ridge Network (Site 116)",
            "target_type": "360° Mastcam Panorama & Mineralized Ridge Outcrop",
            "sol": "Sols 4539–4541 (May 15–18, 2025)",
            "geologic_context": (
                "Sulfate-bearing Mount Sharp bedrock with erosion-resistant fracture ridges and "
                "inter-ridge hollows resolved at Curiosity surface scale."
            ),
            "context_badge": "Derived",
            "source_url": "https://photojournal.jpl.nasa.gov/catalog/PIA26559",
        },
    },
    {
        "id": "S2",
        "name": "Nevado Sajama 360",
        "kind": "panorama",
        "waypoint_key": (4711, 82),
        "extra_waypoints": [(4741, 232)],
        "expected_lonlat": (137.3810041, -4.80800755),
        "sols": [4711, 4741],
        "priority_sols": [4711, 4741],
        "preferred_first": None,
        "approx": False,
        "evidence": "PIA26696 (Mastcam, 2025-11-09…12-07, site 120, RMC 120_82)",
        "panorama": "PIA26696",
        "panorama_meta": {
            "id": "PIA26696",
            "title": "Curiosity Captures a 360-Degree View at Nevado Sajama",
            "page_url": "https://photojournal.jpl.nasa.gov/catalog/PIA26696",
            "image_url": "https://photojournal.jpl.nasa.gov/jpegMod/PIA26696_modest.jpg",
            "full_jpeg_url": "https://photojournal.jpl.nasa.gov/jpeg/PIA26696.jpg",
            "date_taken": "2025-11-09 to 2025-12-07",
            "sol_range": "4714–4741 (waypoint bracket: sols 4711 and 4741)",
            "stitched_frames": 1031,
            "instrument": "Mastcam Right (100 mm)",
            "credit": "NASA/JPL-Caltech/MSSS",
            "badge": "Observed",
        },
        "science": (
            "Ridgetop panorama station at 'Nevado Sajama' within the boxwork terrain (site 120; "
            "bracketing MMGIS waypoints at sols 4711 and 4741). The 1.5-gigapixel PIA26696 mosaic "
            "was stitched from 1,031 Mastcam right-eye (100 mm) frames captured across sols 4714–4741, "
            "showing polygonal fracture ridges and hollows across lower Mount Sharp."
        ),
        "card_static": {
            "target_name": "Nevado Sajama Ridgetop",
            "target_type": "360° Telephoto Mastcam Panorama (1.5 Gigapixels)",
            "sol": "Sols 4711 & 4741 (MMGIS waypoints); mosaic sols 4714–4741",
            "geologic_context": (
                "Boxwork ridgetop exposure displaying intersecting mineral-cemented fracture ridges "
                "and adjacent weathered hollows on lower Mount Sharp."
            ),
            "context_badge": "Derived",
            "source_url": "https://photojournal.jpl.nasa.gov/catalog/PIA26696",
        },
    },
    {
        "id": "D1",
        "name": "Altadena drill site",
        "kind": "drill",
        "waypoint_key": (4560, 1944),
        "extra_waypoints": [],
        "expected_lonlat": (137.3835414, -4.79984723),
        "sols": [4560, 4561, 4562, 4563, 4564, 4565, 4566],
        "priority_sols": [4564, 4561, 4566, 4565, 4560, 4562, 4563],
        "preferred_first": (4564, "MAST_LEFT"),
        "approx": True,
        "evidence": "JPL news 2025-06-23 (drilled sol 4564 while parked at MMGIS waypoint sol 4560, RMC 116_1944)",
        "panorama": None,
        "panorama_meta": None,
        "science": (
            "First rotary-percussive drill sample collected inside the Mount Sharp boxwork terrain "
            "(drilled June 8, 2025 on sol 4564 while Curiosity was parked at site 116 drive 1944; "
            "JPL release June 23, 2025). Powdered rock from 'Altadena' was delivered to Curiosity's "
            "internal CheMin and SAM laboratories to investigate mineral cements and ancient groundwater."
        ),
        "card_static": {
            "target_name": "Altadena",
            "target_type": "Rotary-Percussive Drill Target (Boxwork Terrain)",
            "sol": "Drilled sol 4564 (2025-06-08); parked at waypoint sol 4560 (RMC 116_1944)",
            "geologic_context": (
                "Bedrock target in the boxwork terrain sampled by Curiosity's drill and analyzed by "
                "CheMin and SAM to trace groundwater mineralization history."
            ),
            "context_badge": "Derived",
            "source_url": "https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/",
        },
    },
    {
        "id": "D2",
        "name": "Valle de la Luna drill site",
        "kind": "drill",
        "waypoint_key": (4687, 1722),
        "extra_waypoints": [],
        "expected_lonlat": (137.3810353, -4.80783916),
        "sols": [4687, 4689, 4690, 4693, 4694],
        "priority_sols": [4690, 4693, 4694, 4689, 4687],
        "preferred_first": None,
        "approx": True,
        "evidence": "NASA Curiosity blog sols 4689–4694 (Monte Grande hollow, waypoint sol 4687, RMC 119_1722)",
        "panorama": None,
        "panorama_meta": None,
        "science": (
            "Drill target sampled inside the 'Monte Grande' hollow between hardened boxwork ridges "
            "(sols 4689–4694, October 2025; rover arrival waypoint sol 4687 at site 119 drive 1722). "
            "Powdered tailings were delivered to SAM and CheMin while Mastcam and ChemCam imaged the "
            "hollow bedrock to compare less-resistant hollows against adjacent mineralized ridges."
        ),
        "card_static": {
            "target_name": "Valle de la Luna ('Monte Grande' Hollow)",
            "target_type": "Rotary-Percussive Drill Target (Boxwork Hollow)",
            "sol": "Waypoint sol 4687; drill campaign sols 4689–4694 (Oct 2025)",
            "geologic_context": (
                "Recessed hollow floor bedrock bounded by hardened boxwork ridges, sampled to compare "
                "composition against nearby ridge targets."
            ),
            "context_badge": "Derived",
            "source_url": "https://science.nasa.gov/blog/curiosity-blog-sols-4689-4694-drill-in-the-boxwork-unit-is-go/",
        },
    },
]


def mars_distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in meters on the IAU Mars sphere (R = 3,396,190 m)."""
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2
    return 2.0 * MARS_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def fetch_json(url: str, timeout: int = 30, retries: int = 3) -> Any:
    """Fetch and parse JSON from a public NASA endpoint with retries."""
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    assert last_err is not None
    raise last_err


def assert_url_ok(url: str, timeout: int = 15, retries: int = 3) -> None:
    """Verify an asset URL returns HTTP 200; raise RuntimeError on persistent failure."""
    last_err: Exception | str | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    return
                last_err = f"HTTP {resp.status}"
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
        if attempt + 1 < retries:
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"Asset URL failed verification ({last_err}): {url}")


def _parse_waypoint_feature(feat: dict[str, Any]) -> dict[str, Any] | None:
    geom = feat.get("geometry") or {}
    coords = geom.get("coordinates")
    props = feat.get("properties") or {}
    sol = props.get("sol")
    drive = props.get("drive")
    if (
        geom.get("type") != "Point"
        or not isinstance(coords, list)
        or len(coords) < 2
        or not isinstance(sol, int)
        or not isinstance(drive, int)
    ):
        return None
    lon = round(float(coords[0]), 7)
    lat = round(float(coords[1]), 7)
    site = int(props["site"])
    rmc = str(props.get("RMC") or f"{site}_{drive}")
    elev_m = round(float(props["elev_geoid"]), 2)
    dist_km = round(float(props["dist_km"]), 2)
    tilt = round(float(props["tilt"]), 2) if props.get("tilt") is not None else None
    return {
        "sol": sol,
        "site": site,
        "drive": drive,
        "rmc": rmc,
        "lon": lon,
        "lat": lat,
        "elev_m": elev_m,
        "dist_km": dist_km,
        "tilt": tilt,
    }


def load_mmgis_waypoints() -> tuple[
    dict[tuple[int, int], dict[str, Any]],
    dict[int, list[dict[str, Any]]],
    dict[str, Any],
]:
    """Load full MMGIS waypoints keyed by (sol, drive) plus the latest current waypoint."""
    hist_raw = fetch_json(MMGIS_WAYPOINTS_URL)
    by_sol_drive: dict[tuple[int, int], dict[str, Any]] = {}
    by_sol: dict[int, list[dict[str, Any]]] = {}

    for feat in hist_raw.get("features", []):
        wp = _parse_waypoint_feature(feat)
        if wp is None:
            continue
        by_sol_drive[(wp["sol"], wp["drive"])] = wp
        by_sol.setdefault(wp["sol"], []).append(wp)

    for sol_list in by_sol.values():
        sol_list.sort(key=lambda w: w["drive"])

    curr_raw = fetch_json(MMGIS_CURRENT_URL)
    current_candidates = [
        wp
        for feat in curr_raw.get("features", [])
        if (wp := _parse_waypoint_feature(feat)) is not None
    ]
    if not current_candidates:
        raise RuntimeError("MSL_waypoints_current.json returned no valid waypoint features.")
    current_wp = max(current_candidates, key=lambda w: (w["sol"], w["drive"]))

    return by_sol_drive, by_sol, current_wp


def query_sol_instrument(sol: int, instrument: str) -> list[dict[str, Any]]:
    """Query NASA Curiosity Raw Images API for non-thumbnail images of one (sol, instrument)."""
    url = (
        f"{RAW_IMAGES_API}?per_page=25"
        f"&condition_1=msl:mission"
        f"&condition_2={sol}:sol:in"
        f"&condition_3={instrument}:instrument:in"
    )
    payload = fetch_json(url)
    items = [
        item
        for item in payload.get("items", [])
        if not item.get("is_thumbnail")
        and isinstance(item.get("https_url"), str)
        and item["https_url"].startswith("https://mars.nasa.gov/")
    ]
    items.sort(key=lambda x: (str(x.get("date_taken") or ""), str(x.get("imageid") or "")))
    return items


def _to_photo_record(item: dict[str, Any]) -> dict[str, Any]:
    url = item["https_url"]
    assert_url_ok(url)
    rec: dict[str, Any] = {
        "id": item.get("imageid"),
        "sol": int(item["sol"]),
        "instrument": item.get("instrument"),
        "title": item.get("title"),
        "date_taken": item.get("date_taken"),
        "url": url,
        "credit": item.get("image_credit") or "NASA/JPL-Caltech/MSSS",
        "badge": "Observed",
    }
    return rec


def fetch_stop_photos(
    priority_sols: list[int],
    limit: int = 4,
    preferred_first: tuple[int, str] | None = None,
) -> list[dict[str, Any]]:
    """Select `limit` photos across distinct instruments and as many distinct sols as available."""
    selected: list[dict[str, Any]] = []
    used_instruments: set[str] = set()
    covered_sols: set[int] = set()
    cache: dict[tuple[int, str], list[dict[str, Any]]] = {}

    def get_candidates(sol: int, inst: str) -> list[dict[str, Any]]:
        key = (sol, inst)
        if key not in cache:
            cache[key] = query_sol_instrument(sol, inst)
        return cache[key]

    # Honor an explicit milestone (sol, instrument) anchor first (e.g. D1 drill-sol Mastcam).
    if preferred_first is not None:
        anchor_sol, anchor_inst = preferred_first
        cands = get_candidates(anchor_sol, anchor_inst)
        if not cands:
            raise RuntimeError(f"Required anchor image missing for sol={anchor_sol}, inst={anchor_inst}")
        selected.append(_to_photo_record(cands[0]))
        used_instruments.add(anchor_inst)
        covered_sols.add(anchor_sol)

    # Pass 1: maximize distinct sols first, taking at most one photo per instrument and per sol.
    for sol in priority_sols:
        if len(selected) >= limit:
            break
        if sol in covered_sols:
            continue
        for inst in PREFERRED_INSTRUMENTS:
            if inst in used_instruments:
                continue
            cands = get_candidates(sol, inst)
            if cands:
                selected.append(_to_photo_record(cands[0]))
                used_instruments.add(inst)
                covered_sols.add(sol)
                break

    # Pass 2: fill remaining slots (up to `limit`) with unused instruments across priority sols.
    if len(selected) < limit:
        for inst in PREFERRED_INSTRUMENTS:
            if len(selected) >= limit:
                break
            if inst in used_instruments:
                continue
            for sol in priority_sols:
                cands = get_candidates(sol, inst)
                if cands:
                    selected.append(_to_photo_record(cands[0]))
                    used_instruments.add(inst)
                    covered_sols.add(sol)
                    break

    return selected


def _in_ops_box(lon: float, lat: float) -> bool:
    return (
        OPS_BOX["west"] <= lon <= OPS_BOX["east"]
        and OPS_BOX["south"] <= lat <= OPS_BOX["north"]
    )


def _format_location(wp: dict[str, Any], approx: bool) -> str:
    prefix = "approx. rover waypoint: " if approx else ""
    return (
        f"{prefix}{wp['lon']:.6f}°E, {wp['lat']:.6f}° "
        f"(Site {wp['site']}, Drive {wp['drive']}, elev {wp['elev_m']:.1f} m, "
        f"odometry {wp['dist_km']:.2f} km)"
    )


def build_s3_spec(
    current_wp: dict[str, Any],
    by_sol: dict[int, list[dict[str, Any]]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build dynamic S3 stop specification from MSL_waypoints_current.json."""
    sol = current_wp["sol"]
    sols = [sol]

    # Check if the current sol alone already provides 4 distinct camera instruments.
    insts_on_curr = [inst for inst in PREFERRED_INSTRUMENTS if query_sol_instrument(sol, inst)]
    if len(insts_on_curr) < 4:
        earlier_sols = sorted((s for s in by_sol if s < sol), reverse=True)
        for prev_sol in earlier_sols:
            if by_sol[prev_sol][0]["site"] != current_wp["site"] and len(sols) >= 3:
                break
            sols.append(prev_sol)
            combined_insts = {
                inst
                for s in sols
                for inst in PREFERRED_INSTRUMENTS
                if query_sol_instrument(s, inst)
            }
            if len(combined_insts) >= 4:
                break
        sols.sort()

    priority_sols = sorted(sols, reverse=True)
    tilt_note = f"; {current_wp['tilt']:.2f}° local tilt" if current_wp["tilt"] is not None else ""
    spec = {
        "id": "S3",
        "name": f"Curiosity current position (sol {sol})",
        "kind": "rover",
        "sols": sols,
        "priority_sols": priority_sols,
        "preferred_first": None,
        "approx": False,
        "evidence": (
            f"MSL_waypoints_current.json (RMC {current_wp['rmc']}, "
            f"site {current_wp['site']} drive {current_wp['drive']}, sol {sol})"
        ),
        "panorama": None,
        "panorama_meta": None,
        "science": (
            f"Curiosity's latest published MMGIS rover waypoint on lower Mount Sharp "
            f"(sol {sol}, site {current_wp['site']}, drive {current_wp['drive']}, RMC {current_wp['rmc']}, "
            f"elevation {current_wp['elev_m']:.2f} m after {current_wp['dist_km']:.2f} km of total drive "
            f"odometry{tilt_note}). Used as the active rover benchmark for human Marswalk comparisons."
        ),
        "card_static": {
            "target_name": f"Curiosity Active Station (RMC {current_wp['rmc']})",
            "target_type": "Active Rover Reference Waypoint",
            "sol": f"Sol {sol}",
            "geologic_context": "Lower Mount Sharp traverse terrain along the active Curiosity route.",
            "context_badge": "Derived",
            "source_url": MMGIS_CURRENT_URL,
        },
    }
    return spec, current_wp


def build_stops() -> dict[str, Any]:
    """Build the GeoJSON FeatureCollection for all 5 stops from live NASA endpoints."""
    by_sol_drive, by_sol, current_wp = load_mmgis_waypoints()
    print(
        f"Loaded {len(by_sol_drive)} MMGIS waypoints ({len(by_sol)} sols); "
        f"current rover position: sol {current_wp['sol']} (RMC {current_wp['rmc']})."
    )

    resolved_stops: list[tuple[dict[str, Any], dict[str, Any]]] = []

    for spec in HISTORICAL_STOPS:
        key = spec["waypoint_key"]
        if key not in by_sol_drive:
            raise RuntimeError(f"Required MMGIS waypoint {key} for stop {spec['id']} not found.")
        for extra_key in spec["extra_waypoints"]:
            if extra_key not in by_sol_drive:
                raise RuntimeError(f"Required bracket MMGIS waypoint {extra_key} for stop {spec['id']} not found.")

        wp = by_sol_drive[key]
        exp_lon, exp_lat = spec["expected_lonlat"]
        drift_m = mars_distance_m(wp["lon"], wp["lat"], exp_lon, exp_lat)
        if drift_m >= MAX_WAYPOINT_DRIFT_M:
            raise RuntimeError(
                f"Stop {spec['id']} waypoint {key} drifted {drift_m:.2f} m from expected reference coordinates."
            )
        if not _in_ops_box(wp["lon"], wp["lat"]):
            raise RuntimeError(f"Stop {spec['id']} coordinates ({wp['lon']}, {wp['lat']}) lie outside ops box.")

        resolved_stops.append((spec, wp))

    s3_spec, s3_wp = build_s3_spec(current_wp, by_sol)
    if not _in_ops_box(s3_wp["lon"], s3_wp["lat"]):
        raise RuntimeError(f"Dynamic S3 coordinates ({s3_wp['lon']}, {s3_wp['lat']}) lie outside ops box.")

    # Canonical order: S1, S2, S3, D1, D2
    by_id = {s["id"]: (s, wp) for s, wp in resolved_stops}
    by_id["S3"] = (s3_spec, s3_wp)
    ordered = [by_id[sid] for sid in ("S1", "S2", "S3", "D1", "D2")]

    features: list[dict[str, Any]] = []
    for spec, wp in ordered:
        photos = fetch_stop_photos(
            spec["priority_sols"],
            limit=4,
            preferred_first=spec.get("preferred_first"),
        )
        if len(photos) != 4:
            raise RuntimeError(f"Stop {spec['id']} returned {len(photos)} photos (expected 4).")
        if len({p["instrument"] for p in photos}) != 4:
            raise RuntimeError(f"Stop {spec['id']} does not have 4 distinct instruments.")
        if spec["panorama_meta"]:
            assert_url_ok(spec["panorama_meta"]["image_url"])

        card = {
            **spec["card_static"],
            "rmc": wp["rmc"],
            "site": wp["site"],
            "drive": wp["drive"],
            "elev_m": wp["elev_m"],
            "dist_km": wp["dist_km"],
            "location": _format_location(wp, spec["approx"]),
            "waypoint_badge": "Observed",
        }

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [wp["lon"], wp["lat"]]},
                "properties": {
                    "id": spec["id"],
                    "name": spec["name"],
                    "kind": spec["kind"],
                    "sols": spec["sols"],
                    "evidence": spec["evidence"],
                    "approx": spec["approx"],
                    "photos": photos,
                    "panorama": spec["panorama"],
                    "panorama_meta": spec["panorama_meta"],
                    "science": spec["science"],
                    "card": card,
                    "badge": "Observed",
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def build_rad_card() -> dict[str, Any]:
    """Build the verified Gale RAD radiation context card."""
    return {
        "title": "Radiation at Gale (RAD)",
        "badge": "Observed",
        "values": [
            {
                "label": "Surface GCR dose equivalent rate (average)",
                "value": 0.64,
                "unit": "mSv/day",
                "pm": 0.12,
                "badge": "Observed",
                "note": "Measured on the Gale Crater traverse during sols 13–300 near solar maximum (Hassler et al. 2014).",
            },
            {
                "label": "Surface GCR absorbed dose rate (tissue-like plastic)",
                "value": 210,
                "unit": "µGy/day",
                "pm": 40,
                "badge": "Observed",
                "note": "Detector B tissue-equivalent plastic scintillator average over sols 13–300 (Hassler et al. 2014, Table 1).",
            },
            {
                "label": "Sept 2017 surface SEP event (absorbed dose in silicon)",
                "value": 418,
                "unit": "µGy (Si)",
                "badge": "Observed",
                "note": (
                    "Largest solar energetic particle event recorded at Mars surface by RAD silicon "
                    "detector E during 10–13 Sept 2017 (Zeitlin et al. 2018; Berger et al. 2018)."
                ),
            },
            {
                "label": "Modeled 4-hour Marswalk GCR dose (unshielded)",
                "value": 0.11,
                "unit": "mSv",
                "badge": "Scenario",
                "note": "Scenario estimate scaling the 0.64 mSv/day GCR baseline to a 4-hour excursion; suit and terrain sky-view shielding not modeled.",
            },
        ],
        "limits": [
            {
                "label": "NASA career effective dose limit",
                "value": 600,
                "unit": "mSv",
                "source": "NASA-STD-3001 Vol 1 (career limit for all astronauts)",
            },
            {
                "label": "Spatial radiation map at walk scale",
                "value": "Unavailable",
                "unit": "—",
                "source": "RAD is a single rover-local point dosimeter (the only surface dosimeter on Mars); no walk-scale spatial map exists",
                "badge": "Unavailable",
            },
        ],
        "note": (
            "Curiosity RAD is a rover-local dosimeter, not a spatial map across the ops box. "
            "SEP peak value (418 µGy) is absorbed dose in silicon, not directly equivalent to mSv effective dose."
        ),
        "claim_boundary": (
            "Context card only — never rendered as a spatial hazard heatmap. Modeled walk dose scales the "
            "Observed GCR baseline by excursion duration (Scenario)."
        ),
        "source": (
            "Hassler et al. 2014, Science 343:1244797, doi:10.1126/science.1244797; "
            "Zeitlin et al. 2018, GRL 45:5860, doi:10.1029/2018GL077760; "
            "Berger et al. 2018, Space Weather 16:1714, doi:10.1029/2018SW002006; "
            "PDS PPI MSL-M-RAD-2-EDR-V1.0; NASA-STD-3001 Vol 1"
        ),
        "source_urls": [
            "https://doi.org/10.1126/science.1244797",
            "https://doi.org/10.1029/2018GL077760",
            "https://doi.org/10.1029/2018SW002006",
            "https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-2-EDR-V1.0",
            "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf",
        ],
        "date_range": "2012-08 → 2013-06 (sols 13–300 GCR baseline, Hassler et al. 2014); 2017-09-10 → 2017-09-13 (Sept 2017 SEP event, Zeitlin et al. 2018)",
    }


def build_rems_card() -> dict[str, Any]:
    """Build the verified Gale REMS weather context card."""
    return {
        "title": "Weather at Gale (REMS)",
        "badge": "Observed",
        "values": [
            {
                "label": "Surface pressure (annual range)",
                "value": "700–920",
                "unit": "Pa",
                "badge": "Observed",
                "note": "Seasonal CO₂ cycle and diurnal thermal tides at Gale Crater (Gómez-Elvira et al. 2014; Haberle et al. 2014).",
            },
            {
                "label": "Air temperature (sols 1–100 range, 1.6 m boom)",
                "value": "−83 to −3",
                "unit": "°C",
                "badge": "Observed",
                "note": "190 K nighttime low to 270 K daytime high during sols 1–100 (Gómez-Elvira et al. 2014); multi-year Gale range 180–278 K / −93 to +5 °C (Martínez et al. 2017).",
            },
            {
                "label": "Ground brightness temperature (multi-year range)",
                "value": "−100 to +16",
                "unit": "°C",
                "badge": "Observed",
                "note": "173 K pre-dawn minimum to 289 K midday maximum across Gale seasons (Martínez et al. 2017; up to ~280 K / +7 °C in sols 1–100, Gómez-Elvira et al. 2014).",
            },
        ],
        "limits": [
            {
                "label": "Armstrong limit (human physiological threshold)",
                "value": 6300,
                "unit": "Pa",
                "source": (
                    "Water boils at human body temperature (37 °C) below ~6.3 kPa; Gale pressure (700–920 Pa, "
                    "above water's 611.65 Pa triple point) is ~7–9× below the Armstrong limit, requiring a full pressure suit (NASA-STD-3001 Vol 1)"
                ),
            },
            {
                "label": "Walk-scale spatial weather map",
                "value": "Unavailable",
                "unit": "—",
                "source": "REMS is a single rover-local weather station on Curiosity's mast; no walk-scale spatial weather map exists",
                "badge": "Unavailable",
            },
        ],
        "note": (
            "REMS is a rover-local meteorological station on Curiosity; no walk-scale spatial weather map "
            "or operational forecast exists for Gale Crater. Values represent observed Gale climatology."
        ),
        "claim_boundary": (
            "Context card only — never interpolated into per-cell route weather maps. "
            "Excursion thermal/dust windows derived from climatology are Scenario assumptions."
        ),
        "source": (
            "Gómez-Elvira et al. 2012, Space Sci Rev 170:583, doi:10.1007/s11214-012-9921-1; "
            "Gómez-Elvira et al. 2014, JGR-Planets 119:1680, doi:10.1002/2013JE004576; "
            "Haberle et al. 2014, JGR-Planets 119:1544, doi:10.1002/2013JE004488; "
            "Martínez et al. 2017, Space Sci Rev 212:295, doi:10.1007/s11214-017-0360-x; "
            "NASA PDS Atmospheres Node urn:nasa:pds:msl_rems_bundle"
        ),
        "source_urls": [
            "https://atmos.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/rems.html",
            "https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Amsl_rems_bundle",
        ],
        "date_range": "2012-08 → 2012-11 (sols 1–100 baseline, Gómez-Elvira et al. 2014); 2012-08 → 2017 (multi-year review, Martínez et al. 2017)",
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    print("Fetching NASA MMGIS Curiosity waypoints and raw photos...")
    stops_fc = build_stops()

    write_json(DATA_DIR / "stops.json", stops_fc)
    write_json(CARDS_DIR / "rad.json", build_rad_card())
    write_json(CARDS_DIR / "rems.json", build_rems_card())

    size_kb = (DATA_DIR / "stops.json").stat().st_size / 1024.0
    print(f"Wrote app/public/data/stops.json ({size_kb:.1f} KB), cards/rad.json, cards/rems.json:")
    for f in stops_fc["features"]:
        p = f["properties"]
        c = p["card"]
        sol_set = sorted({ph["sol"] for ph in p["photos"]})
        inst_set = [ph["instrument"] for ph in p["photos"]]
        print(
            f"  {p['id']}: {p['name']} — rmc={c['rmc']}, elev={c['elev_m']} m, "
            f"photos={len(p['photos'])} sols={sol_set} insts={inst_set}"
        )


if __name__ == "__main__":
    main()
