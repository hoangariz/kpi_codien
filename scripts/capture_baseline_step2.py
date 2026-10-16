import sys
import os
import json
from pathlib import Path

# UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.database import SessionLocal
import backend.main
from backend.services.codinh import get_codinh_stats, clear_codinh_stats_cache

def main():
    print("=" * 80)
    print("CHỤP VÀ ĐỐI CHIẾU BASELINE BƯỚC 2 CHO THC & PORT_KEM")
    print("=" * 80)

    db = SessionLocal()
    try:
        baseline1_path = ROOT_DIR / "scripts" / "baseline_codinh_step1.json"
        baseline2_path = ROOT_DIR / "scripts" / "baseline_codinh_step2.json"

        b1_stats = {}
        if baseline1_path.exists():
            with open(baseline1_path, "r", encoding="utf-8") as f:
                b1_data = json.load(f)
                b1_stats = b1_data.get("stats", {})

        test_months = [None, "2026-08", "2026-09", "2026-10", "all"]
        stats_step2 = {}
        mismatches = []

        metric_keys_to_check = [
            "total_wos", "closed_wos", "pending_wos", "overdue_wos",
            "closed_today_wos", "closed_yesterday_wos", "closed_week_wos",
            "wo_rate", "home_kem_count", "port_kem_count",
            "pending_under_24h", "pending_under_72h",
            "closed_within_24h", "closed_within_72h",
            "total_cabinets", "completed_cabinets", "pending_cabinets", "overdue_cabinets",
            "cabinet_rate"
        ]

        for report_key, cid in [("thc", 13), ("port_kem", 14)]:
            for m in test_months:
                case_key = f"cat_{cid}_m_{m}"
                clear_codinh_stats_cache()
                data = get_codinh_stats(db, report=report_key, target_month=m)
                stats_step2[case_key] = data

                if case_key in b1_stats:
                    b1_sum = b1_stats[case_key]["summary"]
                    cur_sum = data["summary"]
                    for k in metric_keys_to_check:
                        if b1_sum.get(k) != cur_sum.get(k):
                            mismatches.append((case_key, k, b1_sum.get(k), cur_sum.get(k)))

        # Save step 2 baseline
        with open(baseline2_path, "w", encoding="utf-8") as f:
            json.dump({"stats": stats_step2}, f, ensure_ascii=False, indent=2, default=str)
        print(f"[OK] Đã lưu kết quả baseline mới vào {baseline2_path.name}")

        if not mismatches:
            print("[PASS] 100% kết quả thc và port_kem KHÔNG HỀ THAY ĐỔI so với baseline_codinh_step1.json!")
        else:
            print(f"[FAIL] Phát hiện {len(mismatches)} chỉ số lệch so với baseline:")
            for m in mismatches:
                print(f"  - {m[0]}: {m[1]} cũ={m[2]} mới={m[3]}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
