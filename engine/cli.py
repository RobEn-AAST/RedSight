"""Command line entry point for deterministic static contract generation."""

import argparse
import json
import sys

from engine.export import build_real_routes


def parser():
    root = argparse.ArgumentParser(prog="python3 -m engine")
    sub = root.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build", help="build real DEM routes and Ali-owned contract outputs")
    build.add_argument("--input-manifest", required=True, help="verified local input handoff JSON")
    build.add_argument("--native-hazard-manifest", help="hash-checked native Horn slope cache manifest (defaults to --input-manifest)")
    build.add_argument("--constants", required=True, help="stable constants.json input")
    build.add_argument("--stops", required=True, help="current stops.json contract")
    build.add_argument("--out", required=True, help="output data directory, normally app/public/data")
    build.add_argument("--habitat-row-col", nargs=2, type=int, metavar=("ROW", "COL"), help="optional explicit Scenario habitat cell")
    return root


def build_summary(result):
    routes = result["route_index"]["routes"]
    return {
        "status": "complete" if all(item["status"] == "routed" for item in routes) else "partial",
        "output_dir": result["output_dir"],
        "habitat": result["meta"]["habitat"],
        "route_status": result["route_status"],
        "pilot_gates": result["manifest"].get("pilot_gates", {}),
        "pilot_timing": result["manifest"].get("pilot_timing", {}),
        # Constants, metadata, route index, build manifest and hazards plus route files.
        "files_written": len(result["exported_files"]) + 5,
    }


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        result = build_real_routes(
            input_manifest=args.input_manifest,
            native_hazard_manifest=args.native_hazard_manifest or args.input_manifest,
            constants_path=args.constants,
            stops_path=args.stops,
            output_dir=args.out,
            habitat_row_col=args.habitat_row_col,
        )
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    summary = build_summary(result)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary["status"] == "complete" else 1


if __name__ == "__main__":
    raise SystemExit(main())
