import sys
from pathlib import Path

# UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.database import SessionLocal
from backend.services.codinh import get_codinh_drilldown_tasks

def main():
    print("=" * 80)
    print("KIỂM TRA DRILLDOWN TẤT CẢ 4 BÁO CÁO CĐBR VỚI SUB_METRIC")
    print("=" * 80)
    
    db = SessionLocal()
    try:
        # 1. Test THC
        print("\n1. Test Drilldown Báo cáo THC:")
        try:
            res_thc = get_codinh_drilldown_tasks(
                db=db,
                report="thc",
                metric="total",
                sub_metric=None,
                page=1,
                page_size=10,
            )
            print(f"   -> [PASS] THC drilldown OK! Số tasks: {len(res_thc.get('tasks', []))}, total: {res_thc.get('total')}")
        except Exception as e:
            print(f"   -> [FAIL] THC drilldown lỗi: {e}")

        # 2. Test Port Kém
        print("\n2. Test Drilldown Báo cáo Port Kém:")
        try:
            res_pk = get_codinh_drilldown_tasks(
                db=db,
                report="port_kem",
                metric="pending_under_24h",
                sub_metric=None,
                page=1,
                page_size=10,
            )
            print(f"   -> [PASS] Port Kém drilldown OK! Số tasks: {len(res_pk.get('tasks', []))}, total: {res_pk.get('total')}")
        except Exception as e:
            print(f"   -> [FAIL] Port Kém drilldown lỗi: {e}")

        # 3. Test QLCTKT Triển Khai
        print("\n3. Test Drilldown Báo cáo QLCTKT Triển Khai:")
        try:
            res_ql = get_codinh_drilldown_tasks(
                db=db,
                report="qlctkt_trien_khai",
                target_date="2026-10-16",
                metric="ton_duong_day_th",
                sub_metric=None,
                page=1,
                page_size=10,
            )
            print(f"   -> [PASS] QLCTKT drilldown OK! Số tasks: {len(res_ql.get('tasks', []))}, total: {res_ql.get('total')}")
        except Exception as e:
            print(f"   -> [FAIL] QLCTKT drilldown lỗi: {e}")

        # 4. Test Tổng Hợp Sự Cố
        print("\n4. Test Drilldown Báo cáo Tổng Hợp Sự Cố:")
        try:
            res_sc = get_codinh_drilldown_tasks(
                db=db,
                report="tong_hop_su_co",
                target_date="2026-10-16",
                metric="ton_su_co",
                sub_metric=None,
                page=1,
                page_size=10,
            )
            print(f"   -> [PASS] Tổng Hợp Sự Cố (GNOC) drilldown OK! Số tasks: {len(res_sc.get('tasks', []))}, total: {res_sc.get('total')}")
            
            res_sc_dual = get_codinh_drilldown_tasks(
                db=db,
                report="tong_hop_su_co",
                target_date="2026-10-16",
                metric="ton_su_co_tk",
                sub_metric="ton_tk",
                page=1,
                page_size=10,
            )
            print(f"   -> [PASS] Tổng Hợp Sự Cố (Dual tab ton_tk) drilldown OK! Số tasks: {len(res_sc_dual.get('tasks', []))}, total: {res_sc_dual.get('total')}")
        except Exception as e:
            print(f"   -> [FAIL] Tổng Hợp Sự Cố drilldown lỗi: {e}")

        print("\n" + "=" * 80)
        print("HOÀN THÀNH KIỂM TRA DRILLDOWN!")
        print("=" * 80)
    finally:
        db.close()

if __name__ == "__main__":
    main()
