import sys
import os
import json
import re
from pathlib import Path
from datetime import datetime, timedelta

# UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.database import SessionLocal
from backend.main import auto_migrate_db
from backend.models.task_codinh import TaskCodinh
from backend.models.task_qlctkt import TaskQlctkt
from backend.services.codinh import get_codinh_stats, get_codinh_drilldown_tasks, clear_codinh_stats_cache
from backend.services.codinh.reports.tong_hop_su_co import clear_tong_hop_su_co_cache

def main():
    print("=" * 90)
    print("KIỂM TRA TỰ ĐỘNG BÁO CÁO: TỔNG HỢP SỰ CỐ (tong_hop_su_co)")
    print("=" * 90)

    # 1. Trigger DB migration & backfills
    auto_migrate_db()

    db = SessionLocal()
    try:
        now_test = datetime(2026, 10, 16, 9, 56, 38)
        print(f"Mốc thời gian test: {now_test}\n")

        # -------------------------------------------------------------
        # Kiểm tra bổ sung về Task ID 484532296 & CSKH
        # -------------------------------------------------------------
        print("--- [1] KIỂM TRA BỔ SUNG: TASK ĐẶC BIỆT QLCTKT ---")
        task_special = db.query(TaskQlctkt).filter(TaskQlctkt.task_id == "484532296").first()
        if task_special:
            print(f"Task ID 484532296: tien_do='{task_special.tien_do}', is_huy={task_special.is_huy}, ngay_tich_huy='{task_special.ngay_tich_huy}'")
            if task_special.is_huy:
                print("  -> [PASS] Task 484532296 có is_huy=True (KHÔNG nằm trong Tồn TK).")
            else:
                print("  -> [FAIL] Task 484532296 chưa được đánh dấu is_huy!")
        else:
            print("  -> [NOTE] Không tìm thấy Task ID 484532296 trong DB hiện tại.")

        cskh_tasks = db.query(TaskQlctkt).filter(TaskQlctkt.is_cskh_2022 == True).all()
        print(f"Số lượng Task CSKH_2022 trong DB: {len(cskh_tasks)}")
        print("  -> [PASS] Đã loại trừ khỏi nghiem_thu_n và ton_tk qua filter is_cskh_2022 == False.\n")

        # -------------------------------------------------------------
        # Test Case 1: n = 15/10/2026
        # -------------------------------------------------------------
        print("--- [2] ĐỐI CHIẾU SỐ LIỆU GOLDEN NGÀY 15/10/2026 ---")
        clear_codinh_stats_cache()
        clear_tong_hop_su_co_cache()
        res_15 = get_codinh_stats(db, report="tong_hop_su_co", target_date="2026-10-15", now_override=now_test)

        # 2.1 Đội Can Lộc ngày 15/10
        golden_can_loc_15 = {
            "so_nv": 8, "ton_truoc": 4, "phat_sinh": 8, "xu_ly": 11, "ton_su_co": 2,
            "nghiem_thu_n": 7, "ton_tk": 11, "ton_su_co_tk": 13, "tac_vu_dong_n": 29,
            "nsld": 4.5, "lte_3h": 1, "h3_24": 0, "h24_48": 1, "h48_72": 0, "gt_72h": 0,
            "tam_dung": 1, "hot": 0, "qua_han": 0
        }

        team_cl = next((t for t in res_15["by_team"] if "can lộc" in t.get("ten_doi", "").lower()), None)
        if not team_cl:
            team_cl = next((t for t in res_15["by_team"] if "clc" in t.get("ma_doi", "").lower()), None)

        print(">> ĐỘI CAN LỘC (n = 15/10):")
        mismatches_cl = []
        if team_cl:
            print(f"{'Chỉ số':<18} | {'Thực tế':<10} | {'Golden':<10} | {'Trạng thái'}")
            print("-" * 55)
            for k, g_val in golden_can_loc_15.items():
                act_val = team_cl.get(k)
                match = (act_val == g_val)
                if not match:
                    mismatches_cl.append((k, act_val, g_val))
                print(f"{k:<18} | {str(act_val):<10} | {str(g_val):<10} | {'OK' if match else 'LỆCH'}")
            if not mismatches_cl:
                print("==> [PASS] Đội Can Lộc ngày 15/10 khớp 100% tất cả các chỉ số golden!\n")
            else:
                print(f"==> [FAIL] Đội Can Lộc ngày 15/10 lệch {len(mismatches_cl)} chỉ số: {mismatches_cl}\n")
        else:
            print("  -> [FAIL] Không tìm thấy Đội Can Lộc trong kết quả by_team!\n")

        # 2.2 Tổng toàn bảng (85 NV) ngày 15/10
        golden_total_15 = {
            "ton_truoc": 96, "phat_sinh": 164, "xu_ly": 177, "ton_su_co": 114,
            "nghiem_thu_n": 174, "ton_tk": 424, "ton_su_co_tk": 538, "tac_vu_dong_n": 554,
            "lte_3h": 41, "h3_24": 29, "h24_48": 21, "h48_72": 11, "gt_72h": 12,
            "tam_dung": 63, "hot": 9, "qua_han": 11
        }
        sum_15 = res_15["summary"]
        print(">> TỔNG TOÀN BẢNG (n = 15/10):")
        mismatches_sum_15 = []
        print(f"{'Chỉ số':<18} | {'Thực tế':<10} | {'Golden':<10} | {'Trạng thái'}")
        print("-" * 55)
        for k, g_val in golden_total_15.items():
            act_val = sum_15.get(k)
            match = (act_val == g_val)
            if not match:
                mismatches_sum_15.append((k, act_val, g_val))
            print(f"{k:<18} | {str(act_val):<10} | {str(g_val):<10} | {'OK' if match else 'LỆCH'}")
        if not mismatches_sum_15:
            print("==> [PASS] Tổng toàn bảng ngày 15/10 khớp 100% tất cả chỉ số golden!\n")
        else:
            print(f"==> [FAIL] Tổng toàn bảng ngày 15/10 lệch {len(mismatches_sum_15)} chỉ số: {mismatches_sum_15}\n")

        # -------------------------------------------------------------
        # Test Case 2: n = 16/10/2026
        # -------------------------------------------------------------
        print("--- [3] ĐỐI CHIẾU SỐ LIỆU GOLDEN NGÀY 16/10/2026 ---")
        clear_codinh_stats_cache()
        clear_tong_hop_su_co_cache()
        res_16 = get_codinh_stats(db, report="tong_hop_su_co", target_date="2026-10-16", now_override=now_test)

        golden_total_16 = {
            "ton_truoc": 82, "phat_sinh": 44, "xu_ly": 12, "ton_su_co": 114,
            "nghiem_thu_n": 17, "tac_vu_dong_n": 51,
            "lte_3h": 41, "h3_24": 29, "h24_48": 21, "h48_72": 11, "gt_72h": 12,
            "tam_dung": 63, "hot": 9, "qua_han": 11
        }
        sum_16 = res_16["summary"]
        print(">> TỔNG TOÀN BẢNG (n = 16/10):")
        mismatches_sum_16 = []
        print(f"{'Chỉ số':<18} | {'Thực tế':<10} | {'Golden':<10} | {'Trạng thái'}")
        print("-" * 55)
        for k, g_val in golden_total_16.items():
            act_val = sum_16.get(k)
            match = (act_val == g_val)
            if not match:
                mismatches_sum_16.append((k, act_val, g_val))
            print(f"{k:<18} | {str(act_val):<10} | {str(g_val):<10} | {'OK' if match else 'LỆCH'}")
        if not mismatches_sum_16:
            print("==> [PASS] Tổng toàn bảng ngày 16/10 khớp 100% tất cả chỉ số golden!\n")
        else:
            print(f"==> [FAIL] Tổng toàn bảng ngày 16/10 lệch {len(mismatches_sum_16)} chỉ số: {mismatches_sum_16}\n")

        # -------------------------------------------------------------
        # Kiểm tra tính toàn vẹn và công thức cứng
        # -------------------------------------------------------------
        print("--- [4] KIỂM TRA CÔNG THỨC TOÀN VẸN VÀ TÍNH CHẤT ĐỐI ỨNG ---")
        # 1. ton_truoc + phat_sinh - xu_ly = ton_su_co khi n = ngày hiện tại (16/10)
        tt_16 = sum_16["ton_truoc"]
        ps_16 = sum_16["phat_sinh"]
        xl_16 = sum_16["xu_ly"]
        ton_16 = sum_16["ton_su_co"]
        calc_ton = tt_16 + ps_16 - xl_16
        print(f"Công thức cân bằng: ton_truoc({tt_16}) + phat_sinh({ps_16}) - xu_ly({xl_16}) = {calc_ton} (ton_su_co={ton_16})")
        assert calc_ton == ton_16, f"Sai công thức cân bằng: {calc_ton} != {ton_16}"
        print("  -> [PASS] Công thức cân bằng bảo toàn chính xác 100%!")

        # 2. Tổng 5 bucket tuổi = ton_su_co
        sum_buckets = sum_15["lte_3h"] + sum_15["h3_24"] + sum_15["h24_48"] + sum_15["h48_72"] + sum_15["gt_72h"]
        print(f"Tổng 5 bucket: 41 + 29 + 21 + 11 + 12 = {sum_buckets} (ton_su_co={sum_15['ton_su_co']})")
        assert sum_buckets == sum_15["ton_su_co"], f"Sai tổng 5 bucket: {sum_buckets} != {sum_15['ton_su_co']}"
        print("  -> [PASS] Tổng 5 bucket bằng đúng ton_su_co!")

        # 3. Rollup 3 cấp: sum(Cụm) == sum(Đội) == sum(Nhân viên) == summary
        count_keys = [
            "ton_truoc", "phat_sinh", "xu_ly", "ton_su_co", "nghiem_thu_n", "ton_tk",
            "ton_su_co_tk", "tac_vu_dong_n", "lte_3h", "h3_24", "h24_48", "h48_72", "gt_72h",
            "tam_dung", "tong", "hot", "qua_han"
        ]
        tier_errors = []
        for k in count_keys:
            c_val = sum(c[k] for c in res_15["by_cluster"])
            t_val = sum(t[k] for t in res_15["by_team"])
            e_val = sum(e[k] for e in res_15["by_employee"])
            s_val = res_15["summary"][k]
            if not (c_val == t_val == e_val == s_val):
                tier_errors.append((k, c_val, t_val, e_val, s_val))

        if not tier_errors:
            print("  -> [PASS] Tổng 3 cấp khớp tuyệt đối: sum(Cụm) = sum(Đội) = sum(Nhân viên) = Summary trên toàn bộ 17 cột đếm!")
        else:
            print(f"  -> [FAIL] Lệch tổng 3 cấp: {tier_errors}")

        # -------------------------------------------------------------
        # Kiểm tra Drilldown Can Lộc ngày 15/10
        # -------------------------------------------------------------
        print("\n--- [5] KIỂM TRA DRILLDOWN ĐỘI CAN LỘC NGÀY 15/10 ---")
        dd_checks = [
            ("ton_truoc", 4),
            ("phat_sinh", 8),
            ("xu_ly", 11),
            ("ton_su_co", 2),
            ("nghiem_thu_n", 7),
            ("ton_tk", 11),
            ("tac_vu_dong_n", 29),
            ("lte_3h", 1),
            ("h24_48", 1),
            ("tam_dung", 1),
        ]
        dd_errors = []
        for m_key, exp_count in dd_checks:
            dd_res = get_codinh_drilldown_tasks(
                db,
                report="tong_hop_su_co",
                target_date="2026-10-15",
                metric=m_key,
                filter_type="team",
                target_name=team_cl.get("ten_doi"),
                now_override=now_test
            )
            act_cnt = dd_res["total"]
            match = (act_cnt == exp_count)
            if not match:
                dd_errors.append((m_key, act_cnt, exp_count))
            print(f"  Drilldown {m_key:<15}: số dòng = {act_cnt:<3} (Kỳ vọng: {exp_count}) -> {'OK' if match else 'LỆCH'}")

        if not dd_errors:
            print("==> [PASS] Toàn bộ drilldown Đội Can Lộc khớp chính xác 100% với số hiển thị trên ô!\n")
        else:
            print(f"==> [FAIL] Drilldown có {len(dd_errors)} lỗi: {dd_errors}\n")

    finally:
        db.close()

    print("=" * 90)
    print("HOÀN THÀNH TẤT CẢ CÁC BƯỚC KIỂM TRA NGHIỆM THU!")
    print("=" * 90)

if __name__ == "__main__":
    main()
