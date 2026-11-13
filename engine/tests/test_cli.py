from engine.cli import build_summary


def test_cli_reports_all_ten_routes_and_five_contract_files_written():
    result = {
        "route_index": {"routes": [{"status": "routed"} for _ in range(10)]},
        "output_dir": "/tmp/output",
        "meta": {"habitat": {"row_col": [2, 3]}},
        "route_status": {"route": {"status": "routed"}},
        "exported_files": [f"route-{i}.json" for i in range(10)],
    }

    summary = build_summary(result)

    assert summary["status"] == "complete"
    assert summary["files_written"] == 15
