import sys
import json
import time
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.services.codinh_service import get_codinh_stats, get_codinh_drilldown_tasks, clear_codinh_stats_cache

TEST_CASES_STATS = [
    {"cat_id": 13, "month": None},
    {"cat_id": 13, "month": "2026-08"},
    {"cat_id": 13, "month": "all"},
    {"cat_id": 14, "month": None},
    {"cat_id": 14, "month": "2026-09"},
    {"cat_id": 14, "month": "all"},
]

TEST_CASES_DRILLDOWN = [
    {"cat_id": 13, "month": None, "metric": "total", "page": 1, "page_size": 50},
    {"cat_id": 13, "month": None, "metric": "pending", "page": 1, "page_size": 50},
    {"cat_id": 13, "month": None, "metric": "cabinet_total", "page": 1, "page_size": 50},
    {"cat_id": 14, "month": None, "metric": "total", "page": 1, "page_size": 50},
    {"cat_id": 14, "month": None, "metric": "closed", "page": 1, "page_size": 50},
    {"cat_id": 14, "month": "2026-09", "metric": "kpi_24h", "page": 1, "page_size": 50},
    {"cat_id": 14, "month": "2026-09", "metric": "home_kem", "page": 1, "page_size": 50},
]

def run_tests():
    db = SessionLocal()
    results = {"stats": {}, "drilldown": {}}
    try:
        clear_codinh_stats_cache()
        for tc in TEST_CASES_STATS:
            key = f"cat_{tc['cat_id']}_m_{tc['month']}"
            t0 = time.perf_counter()
            clear_codinh_stats_cache()
            data = get_codinh_stats(db, category_id=tc["cat_id"], target_month=tc["month"])
            elapsed = time.perf_counter() - t0
            # Remove timestamp fields that change each second if any
            # last_data_update_vn is based on DB setting or log, deterministic
            results["stats"][key] = {
                "summary": data["summary"],
                "by_employee": data["by_employee"],
                "by_group": data["by_group"],
                "available_months": data["available_months"],
                "active_category": data["active_category"],
                "elapsed_ms": round(elapsed * 1000, 2),
            }
            print(f"Stats {key}: total_wos={data['summary']['total_wos']}, time={elapsed*1000:.2f}ms")

        for tc in TEST_CASES_DRILLDOWN:
            key = f"cat_{tc['cat_id']}_m_{tc['month']}_metric_{tc['metric']}"
            t0 = time.perf_counter()
            data = get_codinh_drilldown_tasks(
                db,
                category_id=tc["cat_id"],
                target_month=tc["month"],
                metric=tc["metric"],
                page=tc["page"],
                page_size=tc["page_size"],
            )
            elapsed = time.perf_counter() - t0
            results["drilldown"][key] = {
                "total": data["total"],
                "page": data["page"],
                "page_size": data["page_size"],
                "total_pages": data["total_pages"],
                "items_count": len(data["items"]),
                "sample_first_item_wo": data["items"][0]["ma_cong_viec"] if data["items"] else None,
                "elapsed_ms": round(elapsed * 1000, 2),
            }
            print(f"Drilldown {key}: total={data['total']}, items={len(data['items'])}, time={elapsed*1000:.2f}ms")

        return results
    finally:
        db.close()

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    if mode == "save_baseline":
        res = run_tests()
        with open("scripts/baseline_codinh.json", "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
        print("Baseline saved to scripts/baseline_codinh.json")
    elif mode == "compare":
        with open("scripts/baseline_codinh.json", "r", encoding="utf-8") as f:
            base = json.load(f)
        current = run_tests()
        
        all_passed = True
        print("\n--- STATS COMPARISON ---")
        for k in base["stats"]:
            b_s = base["stats"][k]
            c_s = current["stats"].get(k)
            if not c_s:
                print(f"[FAIL] Missing {k} in current stats")
                all_passed = False
                continue
            
            # Compare summary
            if b_s["summary"] != c_s["summary"]:
                print(f"[FAIL] Summary mismatch for {k}:")
                for sk in b_s["summary"]:
                    if b_s["summary"][sk] != c_s["summary"].get(sk):
                        print(f"  Field {sk}: base={b_s['summary'][sk]} != cur={c_s['summary'].get(sk)}")
                all_passed = False
            else:
                print(f"[PASS] Summary for {k} MATCHES exactly ({b_s['summary']['total_wos']} WOs)")

            # Compare available_months
            if b_s["available_months"] != c_s["available_months"]:
                print(f"[FAIL] available_months mismatch for {k}: base={b_s['available_months']} cur={c_s['available_months']}")
                all_passed = False

            # Compare active_category
            if b_s["active_category"] != c_s["active_category"]:
                print(f"[FAIL] active_category mismatch for {k}")
                all_passed = False

            # Compare by_employee
            if len(b_s["by_employee"]) != len(c_s["by_employee"]):
                print(f"[FAIL] by_employee length mismatch for {k}: base={len(b_s['by_employee'])} cur={len(c_s['by_employee'])}")
                all_passed = False
            else:
                emp_mismatches = 0
                for idx, (b_emp, c_emp) in enumerate(zip(b_s["by_employee"], c_s["by_employee"])):
                    # compare all fields except if any floating precision difference
                    for fld in b_emp:
                        if b_emp[fld] != c_emp.get(fld):
                            emp_mismatches += 1
                            if emp_mismatches <= 3:
                                print(f"  by_employee[{idx}] ({b_emp.get('key_name')}) field {fld}: base={b_emp[fld]} != cur={c_emp.get(fld)}")
                if emp_mismatches > 0:
                    print(f"[FAIL] by_employee had {emp_mismatches} field mismatches for {k}")
                    all_passed = False
                else:
                    print(f"[PASS] by_employee for {k} MATCHES exactly ({len(b_s['by_employee'])} employees)")

            # Compare by_group
            if len(b_s["by_group"]) != len(c_s["by_group"]):
                print(f"[FAIL] by_group length mismatch for {k}: base={len(b_s['by_group'])} cur={len(c_s['by_group'])}")
                all_passed = False
            else:
                grp_mismatches = 0
                for idx, (b_grp, c_grp) in enumerate(zip(b_s["by_group"], c_s["by_group"])):
                    for fld in b_grp:
                        if b_grp[fld] != c_grp.get(fld):
                            grp_mismatches += 1
                            if grp_mismatches <= 3:
                                print(f"  by_group[{idx}] ({b_grp.get('key_name')}) field {fld}: base={b_grp[fld]} != cur={c_grp.get(fld)}")
                if grp_mismatches > 0:
                    print(f"[FAIL] by_group had {grp_mismatches} field mismatches for {k}")
                    all_passed = False
                else:
                    print(f"[PASS] by_group for {k} MATCHES exactly ({len(b_s['by_group'])} groups)")

            print(f"  Timing for {k}: base={b_s['elapsed_ms']}ms -> cur={c_s['elapsed_ms']}ms")

        print("\n--- DRILLDOWN COMPARISON ---")
        for k in base["drilldown"]:
            b_d = base["drilldown"][k]
            c_d = current["drilldown"].get(k)
            if not c_d:
                print(f"[FAIL] Missing {k} in current drilldown")
                all_passed = False
                continue
            if b_d["total"] != c_d["total"] or b_d["items_count"] != c_d["items_count"]:
                print(f"[FAIL] Drilldown mismatch for {k}: base={b_d} cur={c_d}")
                all_passed = False
            else:
                print(f"[PASS] Drilldown for {k}: total={b_d['total']}, items={b_d['items_count']}, sample_wo={b_d['sample_first_item_wo']}")
            print(f"  Timing for {k}: base={b_d['elapsed_ms']}ms -> cur={c_d['elapsed_ms']}ms")

        if all_passed:
            print("\n>>> ALL TESTS PASSED! Output data matches baseline exactly. <<<")
            sys.exit(0)
        else:
            print("\n>>> TEST FAILED! Differences found. <<<")
            sys.exit(1)
    else:
        run_tests()
