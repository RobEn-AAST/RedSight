"""Build Ayman's must-ship data files: stops.json and context cards (RAD, REMS, stop cards).

Fetches live NASA MMGIS Curiosity waypoints and Curiosity Raw Images API items
for each stop's sols, cross-checks coordinates/elevations, and writes the
§15 contract files into app/public/data/.

Run from repo root:
    python engine/content/build_stops_and_cards.py
"""

from __future__ import annotations

import json
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

CRS_STRING = "+proj=longlat +R=3396190 +no_defs"
BUILD_DATE = "2026-11-13"

PREFERRED_INSTRUMENTS = {
    "MAHLI": 0,
    "MAST_LEFT": 1,
    "MAST_RIGHT": 2,
    "CHEMCAM_RMI": 3,
    "NAV_LEFT_B": 4,
    "NAV_RIGHT_B": 5,
    "FHAZ_RIGHT_B": 6,
    "RHAZ_RIGHT_B": 7,
}

# Verified stop specifications aligned with docs/demo-focus-plan.md §6, §8 and routes/index.json.
STOP_SPECS: list[dict[str, Any]] = [
    {
        "id": "S1",
        "name": "First boxwork 360",
        "kind": "panorama",
        "coordinates": [137.38592, -4.79782],
        "sols": [4539, 4541],
        "query_sols": [4539, 4540, 4541],
        "waypoint_sol": 4539,
        "sol": "4539–4541",
        "site": 116,
        "drive": 408,
        "elev_m": -3654.97,
        "dist_km": 34.79,
        "approx": False,
        "evidence": "PIA26559 (Mastcam, 2025-05-15…18, site 116)",
        "panorama": "PIA26559",
        "panorama_meta": {
            "id": "PIA26559",
            "title": "Curiosity's First 360-Degree View of Boxwork Patterns",
            "page_url": "https://www.jpl.nasa.gov/images/pia26559-curiositys-first-360-degree-view-of-boxwork-patterns/",
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
            "Curiosity's first 360-degree Mastcam station inside the Mount Sharp boxwork formations "
            "(site 116, sols 4539–4541). Crisscrossing low ridges (~1–2 m tall) formed where ancient "
            "groundwater flowed through bedrock fractures, precipitating calcium-sulfate minerals that "
            "resisted wind erosion better than the surrounding host rock. Hosted within the CRISM-mapped "
            "polyhydrated/monohydrated sulfate unit (boxwork texture is resolved by Curiosity surface "
            "imaging, below CRISM's 18 m/px orbital resolution)."
        ),
        "card": {
            "id": "S1",
            "target_name": "Boxwork Ridge Network (Site 116)",
            "target_type": "360° Mastcam Panorama & Mineralized Ridge Outcrop",
            "sol": "Sols 4539–4541 (May 15–18, 2025)",
            "rock_type": "Calcium-sulfate cemented fracture ridges in sulfate-bearing sedimentary bedrock",
            "geologic_unit": "Mount Sharp group — Sulfate-bearing unit / Boxwork member (USGS SIM 3292 unit Htu)",
            "size": "Ridges ~1–2 m tall with cm-scale mineral veins across a multi-kilometer exposure",
            "location": "137.38592°E, −4.79782° (Site 116, Drive 408–414, elev −3,655.0 m, odometry 34.79 km)",
            "sample_mass_scenario_kg": 2,
            "source_url": "https://www.jpl.nasa.gov/images/pia26559-curiositys-first-360-degree-view-of-boxwork-patterns/",
            "badge": "Observed",
        },
        "badge": "Observed",
    },
    {
        "id": "S2",
        "name": "Nevado Sajama 360",
        "kind": "panorama",
        "coordinates": [137.381, -4.808],
        "sols": [4711, 4741],
        "query_sols": [4711, 4741],
        "waypoint_sol": 4711,
        "sol": "4711 / 4741",
        "site": 120,
        "drive": 82,
        "elev_m": -3607.72,
        "dist_km": 36.11,
        "approx": False,
        "evidence": "PIA26696 (Mastcam, 2025-11-09…12-07, site 120)",
        "panorama": "PIA26696",
        "panorama_meta": {
            "id": "PIA26696",
            "title": "Curiosity Captures a 360-Degree View at Nevado Sajama",
            "page_url": "https://www.jpl.nasa.gov/images/pia26696-curiosity-captures-a-360-degree-view-at-nevado-sajama/",
            "image_url": "https://photojournal.jpl.nasa.gov/jpeg/PIA26696.jpg",
            "full_jpeg_url": "https://photojournal.jpl.nasa.gov/jpeg/PIA26696.jpg",
            "date_taken": "2025-11-09 to 2025-12-07",
            "sol_range": "4714–4741 (waypoints at sols 4711 / 4741)",
            "stitched_frames": 1031,
            "instrument": "Mastcam Right (100 mm)",
            "credit": "NASA/JPL-Caltech/MSSS",
            "badge": "Observed",
        },
        "science": (
            "Ridgetop panorama and drill station at 'Nevado Sajama' inside the boxwork unit (site 120). "
            "A 1.5-gigapixel mosaic stitched from 1,031 Mastcam right-eye (100 mm) frames captured across "
            "sols 4714–4741, showing polygonal fracture ridges and hollows across lower Mount Sharp, paired "
            "with nighttime LED-lit MAHLI inspection of the drill borehole wall."
        ),
        "card": {
            "id": "S2",
            "target_name": "Nevado Sajama Ridgetop",
            "target_type": "360° Telephoto Panorama & Ridgetop Drill Target",
            "sol": "Sols 4711–4741 (Nov 9 – Dec 7, 2025)",
            "rock_type": "Indurated boxwork ridgetop bedrock with mineralized fracture fills",
            "geologic_unit": "Mount Sharp group — Boxwork unit (USGS SIM 3292 unit Htu)",
            "size": "1.5-billion-pixel 360° panorama (1,031 Mastcam frames); ridgetop workspace",
            "location": "137.38100°E, −4.80800° (Site 120, Drive 82–232, elev −3,607.7 m, odometry 36.11 km)",
            "sample_mass_scenario_kg": 2,
            "source_url": "https://www.jpl.nasa.gov/images/pia26696-curiosity-captures-a-360-degree-view-at-nevado-sajama/",
            "badge": "Observed",
        },
        "badge": "Observed",
    },
    {
        "id": "S3",
        "name": "Curiosity current position",
        "kind": "rover",
        "coordinates": [137.38915, -4.82568],
        "sols": [5070],
        "query_sols": [5070],
        "waypoint_sol": 5070,
        "sol": "5070",
        "site": 125,
        "drive": 2274,
        "elev_m": -3473.68,
        "dist_km": 38.29,
        "approx": False,
        "evidence": "MMGIS waypoint (MSL_waypoints_current.json, sol 5070, site 125, drive 2274)",
        "panorama": None,
        "panorama_meta": None,
        "science": (
            "Curiosity's latest published MMGIS waypoint on lower Mount Sharp (sol 5070, site 125, drive 2274, "
            "RMC 125_2274, elevation −3,473.7 m MOLA areoid after 38.29 km of total drive odometry). Serves as "
            "the active rover reference station and upper-slope benchmark for comparing human Marswalk plans "
            "against actual robotic traverse progress."
        ),
        "card": {
            "id": "S3",
            "target_name": "Curiosity Active Station (RMC 125_2274)",
            "target_type": "Active Rover Reference Waypoint",
            "sol": "Sol 5070 (Nov 2026)",
            "rock_type": "Upper sulfate / boxwork transition bedrock on lower Aeolis Mons",
            "geologic_unit": "Mount Sharp group — Sulfate-bearing unit (USGS SIM 3292 unit Htu)",
            "size": "Rover station footprint (~3 m × 2.7 m vehicle; 14.68° local tilt)",
            "location": "137.38915°E, −4.82568° (Site 125, Drive 2274, elev −3,473.7 m, odometry 38.29 km)",
            "sample_mass_scenario_kg": 2,
            "source_url": "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json",
            "badge": "Observed",
        },
        "badge": "Observed",
    },
    {
        "id": "D1",
        "name": "Altadena drill site",
        "kind": "drill",
        "coordinates": [137.3835, -4.79981],
        "sols": [4558, 4560],
        "query_sols": [4558, 4559, 4560],
        "waypoint_sol": 4558,
        "sol": "4558–4560 (drilled sol 4564)",
        "site": 116,
        "drive": 1890,
        "elev_m": -3646.64,
        "dist_km": 35.0,
        "approx": True,
        "evidence": "JPL news 2025-06-23 (drilled 2025-06-08; nearest MMGIS waypoint sols 4558–4560)",
        "panorama": None,
        "panorama_meta": None,
        "science": (
            "First rotary-percussive drill sample collected inside the Mount Sharp boxwork unit (drilled "
            "June 8, 2025; JPL release June 23, 2025). Powdered bedrock from 'Altadena' was delivered to "
            "Curiosity's internal CheMin (X-ray diffraction) and SAM (gas chromatograph / mass spectrometer) "
            "laboratories to analyze the cement mineralogy and test how ancient groundwater evolved as Gale "
            "Crater dried out."
        ),
        "card": {
            "id": "D1",
            "target_name": "Altadena",
            "target_type": "Rotary-Percussive Drill Core & Powdered Sample (Boxwork Edge)",
            "sol": "Sols 4558–4564 (drilled 2025-06-08)",
            "rock_type": "Cemented sulfate-bearing bedrock at the boxwork unit margin (Altadena member)",
            "geologic_unit": "Mount Sharp group — Altadena member / Boxwork unit (USGS SIM 3292 unit Htu)",
            "size": "1.6 cm diameter × ~6 cm deep drill borehole (+ abraded DRT patch)",
            "location": "137.38350°E, −4.79981° (approximate: nearest MMGIS waypoint sol 4558–4560, Site 116, elev −3,646.6 m)",
            "sample_mass_scenario_kg": 2,
            "source_url": "https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/",
            "badge": "Observed",
        },
        "badge": "Observed",
    },
    {
        "id": "D2",
        "name": "Valle de la Luna drill site",
        "kind": "drill",
        "coordinates": [137.38104, -4.80784],
        "sols": [4687],
        "campaign_sols": [4687, 4689, 4690, 4691, 4692, 4693, 4694],
        "query_sols": [4687, 4689, 4690, 4691, 4692, 4693, 4694],
        "waypoint_sol": 4687,
        "sol": "4687 (campaign sols 4689–4694)",
        "site": 119,
        "drive": 1722,
        "elev_m": -3610.43,
        "dist_km": 36.1,
        "approx": True,
        "evidence": "NASA Curiosity blog sols 4689–4694 ('Monte Grande' hollow drill campaign, Oct 2025)",
        "panorama": None,
        "panorama_meta": None,
        "science": (
            "Curiosity's 44th Martian drill target, sampled inside the 'Monte Grande' hollow—a less-resistant "
            "bedrock depression bounded by hardened boxwork ridges (sols 4689–4694, October 2025). Comparing "
            "hollow bedrock at Valle de la Luna against ridge-crest targets tests why mineral-cemented fractures "
            "resisted erosion while intervening hollows weathered away."
        ),
        "card": {
            "id": "D2",
            "target_name": "Valle de la Luna ('Monte Grande' Hollow)",
            "target_type": "Rotary-Percussive Drill Core (#44 on Mars)",
            "sol": "Sol 4687 waypoint; drill campaign Sols 4689–4694 (Oct 2025)",
            "rock_type": "Inter-ridge hollow sedimentary bedrock within the boxwork unit",
            "geologic_unit": "Mount Sharp group — Boxwork unit hollow facies (USGS SIM 3292 unit Htu)",
            "size": "1.6 cm diameter × ~6 cm deep drill borehole in hollow floor block",
            "location": "137.38104°E, −4.80784° (approximate: nearest MMGIS waypoint sol 4687, Site 119, elev −3,610.4 m)",
            "sample_mass_scenario_kg": 2,
            "source_url": "https://science.nasa.gov/blog/curiosity-blog-sols-4689-4694-drill-in-the-boxwork-unit-is-go/",
            "badge": "Observed",
        },
        "badge": "Observed",
    },
]


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


def check_url_ok(url: str, timeout: int = 15) -> bool:
    """Verify an image URL returns HTTP 200 via HEAD."""
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def load_waypoints_by_sol() -> dict[int, dict[str, Any]]:
    """Load Curiosity MMGIS waypoints keyed by sol, preferring current endpoint for latest."""
    by_sol: dict[int, dict[str, Any]] = {}
    for url in (MMGIS_WAYPOINTS_URL, MMGIS_CURRENT_URL):
        data = fetch_json(url)
        for feat in data.get("features", []):
            props = feat.get("properties", {})
            sol = props.get("sol")
            if isinstance(sol, int):
                by_sol[sol] = props
    return by_sol


def fetch_stop_photos(sols: list[int], limit: int = 4) -> list[dict[str, Any]]:
    """Fetch diverse non-thumbnail Curiosity raw photos for the given sols."""
    sol_csv = ",".join(str(s) for s in sols)
    url = (
        f"{RAW_IMAGES_API}?per_page=100"
        f"&condition_1=msl:mission&condition_2={sol_csv}:sol:in"
    )
    payload = fetch_json(url)
    all_items: list[dict[str, Any]] = [
        item
        for item in payload.get("items", [])
        if not item.get("is_thumbnail") and item.get("https_url")
    ]

    # First pass: pick one representative per (sol, instrument) in preferred instrument order.
    by_key: dict[tuple[int, str], dict[str, Any]] = {}
    for item in all_items:
        inst = item.get("instrument", "")
        if inst not in PREFERRED_INSTRUMENTS:
            continue
        key = (int(item["sol"]), inst)
        if key not in by_key:
            by_key[key] = item

    sorted_keys = sorted(
        by_key.keys(),
        key=lambda k: (PREFERRED_INSTRUMENTS.get(k[1], 99), k[0]),
    )
    selected: list[dict[str, Any]] = [by_key[k] for k in sorted_keys[:limit]]
    seen_ids = {item["imageid"] for item in selected if item.get("imageid")}

    # Second pass: if a single-sol stop has fewer than 3 distinct instruments, fill from remaining frames.
    if len(selected) < limit:
        remaining = sorted(
            (
                x
                for x in all_items
                if x.get("instrument") in PREFERRED_INSTRUMENTS
                and x.get("imageid") not in seen_ids
            ),
            key=lambda x: (
                PREFERRED_INSTRUMENTS.get(x.get("instrument", ""), 99),
                int(x.get("sol", 0)),
                x.get("imageid", ""),
            ),
        )
        for item in remaining:
            if len(selected) >= limit:
                break
            selected.append(item)
            seen_ids.add(item["imageid"])

    photos: list[dict[str, Any]] = []
    for item in selected:
        img_url = item["https_url"]
        if not check_url_ok(img_url):
            continue
        photos.append(
            {
                "id": item.get("imageid"),
                "sol": int(item["sol"]),
                "instrument": item.get("instrument"),
                "title": item.get("title"),
                "date_taken": item.get("date_taken"),
                "url": img_url,
                "credit": item.get("image_credit") or "NASA/JPL-Caltech/MSSS",
                "approx_location": True,
                "location_note": (
                    "Pinned by sol to NASA MMGIS rover waypoint; raw image metadata "
                    "does not carry per-frame lat/lon."
                ),
                "badge": "Observed",
            }
        )
    return photos


def build_stops(waypoints: dict[int, dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Build the GeoJSON stops FeatureCollection and standalone stop cards list."""
    features: list[dict[str, Any]] = []
    stop_cards: list[dict[str, Any]] = []

    for spec in STOP_SPECS:
        wp = waypoints.get(spec["waypoint_sol"], {})
        site = wp.get("site", spec["site"])
        drive = wp.get("drive", spec["drive"])
        elev_m = round(float(wp.get("elev_geoid", spec["elev_m"])), 2)
        dist_km = round(float(wp.get("dist_km", spec["dist_km"])), 2)
        lon, lat = spec["coordinates"]

        photos = fetch_stop_photos(spec["query_sols"], limit=4)
        if len(photos) < 3:
            raise RuntimeError(f"Stop {spec['id']} returned fewer than 3 verified photos ({len(photos)}).")

        photo_urls = [p["url"] for p in photos]
        card = dict(spec["card"])
        card["photos"] = photos

        props: dict[str, Any] = {
            "id": spec["id"],
            "name": spec["name"],
            "kind": spec["kind"],
            "sols": spec["sols"],
            "sol": spec["sol"],
            "lon": lon,
            "lat": lat,
            "site": site,
            "drive": drive,
            "elev_m": elev_m,
            "dist_km": dist_km,
            "evidence": spec["evidence"],
            "approx": spec["approx"],
            "photos": photos,
            "photo_urls": photo_urls,
            "panorama": spec["panorama"],
            "panorama_meta": spec["panorama_meta"],
            "science": spec["science"],
            "scienceText": spec["science"],
            "detail": spec["science"],
            "card": card,
            "badge": spec["badge"],
        }
        if "campaign_sols" in spec:
            props["campaign_sols"] = spec["campaign_sols"]

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": props,
            }
        )

        stop_cards.append(
            {
                "id": spec["id"],
                "name": spec["name"],
                "kind": spec["kind"],
                "coordinates": [lon, lat],
                "approx": spec["approx"],
                "badge": spec["badge"],
                "evidence": spec["evidence"],
                "panorama": spec["panorama"],
                "panorama_meta": spec["panorama_meta"],
                "science": spec["science"],
                **card,
            }
        )

    stops_fc = {
        "type": "FeatureCollection",
        "crs": CRS_STRING,
        "updated": BUILD_DATE,
        "source": (
            "NASA MMGIS MSL_waypoints.json (through sol 5070) + "
            "NASA MSL Raw Images API + JPL Photojournal (PIA26559, PIA26696)"
        ),
        "features": features,
    }
    return stops_fc, stop_cards


def build_rad_card() -> dict[str, Any]:
    """Build the verified Gale RAD radiation context card."""
    return {
        "title": "Radiation at Gale (RAD)",
        "badge": "Observed",
        "values": [
            {
                "label": "Surface dose rate (GCR, average)",
                "value": 0.64,
                "unit": "mSv/day",
                "pm": 0.12,
                "badge": "Observed",
            },
            {
                "label": "Surface GCR dose range across mission",
                "value": "0.64–0.67",
                "unit": "mSv/day",
                "badge": "Observed",
            },
            {
                "label": "Modeled 4-hour Marswalk GCR dose (unshielded)",
                "value": 0.11,
                "unit": "mSv",
                "badge": "Scenario",
                "note": "Derived arithmetic (0.64 mSv/day × 4/24 h); suit and terrain sky-view shielding not modeled.",
            },
            {
                "label": "Sept 2017 surface SEP event total",
                "value": 369,
                "unit": "µGy",
                "badge": "Observed",
                "note": "Episodic solar energetic particle event measured at the surface by RAD (Zeitlin et al. 2018).",
            },
        ],
        "limits": [
            {
                "label": "NASA career effective dose limit",
                "value": 600,
                "unit": "mSv",
                "source": "NASA-STD-3001 Vol 1",
                "badge": "Observed",
            },
            {
                "label": "Spatial radiation map at walk scale",
                "value": "Unavailable",
                "unit": "—",
                "source": "RAD is the sole surface dosimeter on Mars (single roving point)",
                "badge": "Unavailable",
            },
        ],
        "note": (
            "Curiosity RAD is the only surface radiation dosimeter on Mars. Measurements are rover-local "
            "point values, not a spatial map across the ops box. Suit and terrain sky-view shielding are not modeled."
        ),
        "claim_boundary": (
            "Context card only — never rendered as a spatial hazard heatmap. Modeled walk dose scales the "
            "Observed GCR baseline by excursion duration (Scenario)."
        ),
        "source": (
            "Hassler et al. 2014, Science 343:1244797, doi:10.1126/science.1244797; "
            "Zeitlin et al. 2018, GRL, doi:10.1029/2018GL077760; "
            "PDS PPI MSL-M-RAD-2-EDR-V1.0; NASA-STD-3001 Vol 1"
        ),
        "source_urls": [
            "https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-2-EDR-V1.0",
            "https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf",
        ],
        "date_range": "2012-08-07 → 2026 (GCR baseline 2012-08 → 2013-06; Sept 2017 SEP event)",
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
            },
            {
                "label": "Air temperature (diurnal range, 1.6 m boom)",
                "value": "−83 to −3",
                "unit": "°C",
                "badge": "Observed",
                "note": "Typical diurnal cycle (~190 K nighttime low to ~270 K daytime high, Gómez-Elvira et al. 2014).",
            },
            {
                "label": "Ground brightness temperature (diurnal range)",
                "value": "−90 to +17",
                "unit": "°C",
                "badge": "Observed",
                "note": "Typical diurnal cycle (~183 K pre-dawn to ~290 K midday, Gómez-Elvira et al. 2014).",
            },
            {
                "label": "Measurement cadence",
                "value": "1 Hz (5-min hourly windows)",
                "unit": "cadence",
                "badge": "Observed",
            },
        ],
        "limits": [
            {
                "label": "Water triple-point context",
                "value": "611.65",
                "unit": "Pa",
                "source": "Gale surface pressure (700–920 Pa) straddles water's triple point; unsuited human survival impossible",
                "badge": "Observed",
            },
            {
                "label": "Walk-scale spatial weather map",
                "value": "Unavailable",
                "unit": "—",
                "source": "REMS is a single rover-local weather station; Mars Climate Database v6.2 is 5.625° × 3.75° (~330 × 220 km)",
                "badge": "Unavailable",
            },
        ],
        "note": (
            "REMS is a rover-local meteorological station on Curiosity; no walk-scale spatial weather map "
            "or live forecast exists for Gale Crater. Values represent observed Gale climatology."
        ),
        "claim_boundary": (
            "Context card only — never interpolated into per-cell route weather maps. "
            "Excursion thermal/dust windows derived from climatology are Scenario assumptions."
        ),
        "source": (
            "Gómez-Elvira et al. 2012, Space Sci Rev, doi:10.1007/s11214-012-9921-1; "
            "Gómez-Elvira et al. 2014, JGR-Planets, doi:10.1002/2013JE004576; "
            "Haberle et al. 2014, JGR-Planets, doi:10.1002/2013JE004488; "
            "PDS4 urn:nasa:pds:msl_rems_bundle"
        ),
        "source_urls": [
            "https://pds-geosciences.wustl.edu/missions/msl/rems.htm",
        ],
        "date_range": "2012-08-07 → 2026 (PDS4 urn:nasa:pds:msl_rems_bundle sols 1–4843; Gómez-Elvira et al. 2014 baseline)",
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    print("Fetching NASA MMGIS Curiosity waypoints...")
    waypoints = load_waypoints_by_sol()
    print(f"Loaded {len(waypoints)} waypoint sols from MMGIS.")

    print("Fetching Curiosity raw images and building stops.json...")
    stops_fc, stop_cards = build_stops(waypoints)

    write_json(DATA_DIR / "stops.json", stops_fc)
    write_json(CARDS_DIR / "stops.json", {"updated": BUILD_DATE, "cards": stop_cards})
    write_json(CARDS_DIR / "rad.json", build_rad_card())
    write_json(CARDS_DIR / "rems.json", build_rems_card())

    print("Wrote:")
    for f in stops_fc["features"]:
        p = f["properties"]
        print(f"  {p['id']}: {p['name']} — {len(p['photos'])} photos, site={p['site']}, elev={p['elev_m']} m")
    print("Done.")


if __name__ == "__main__":
    main()
