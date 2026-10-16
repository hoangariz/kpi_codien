import sys
import os
import json
import re
from pathlib import Path
import pandas as pd
from datetime import datetime

# UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.database import SessionLocal
from backend.models.task_codinh import TaskCodinh
from backend.services.codinh_service import (
    get_codinh_stats,
    get_codinh_drilldown_tasks,
    clear_codinh_stats_cache
)

def inspect_nhom_and_excel():
    print("=" * 70)
    print("1. ĐỌC FILE danhsachnhanvien_codinh.xlsx")
    print("=" * 70)
    
    excel_path = Path("danhsachnhanvien_codinh.xlsx")
    if not excel_path.exists():
        print(f"[-] ERROR: Không tìm thấy file {excel_path}")
        return

    df = pd.read_excel(excel_path)
    print(f"Tổng số dòng trong Excel: {len(df)}")
    print("Các cột trong Excel:", list(df.columns))

    # Identify columns
    col_user = None
    col_role = None
    col_name = None
    col_team_name = None
    col_team_code = None
    col_cluster_name = None
    col_cluster_code = None

    for col in df.columns:
        c_clean = str(col).strip().lower()
        if "username" in c_clean:
            col_user = col
        elif "chức vụ" in c_clean or "chuc vu" in c_clean:
            col_role = col
        elif "họ tên" in c_clean or "ho ten" in c_clean:
            col_name = col
        elif "tên đội" in c_clean or "ten doi" in c_clean:
            col_team_name = col
        elif "viết tắt đội" in c_clean or "viet tat doi" in c_clean or "mã đội" in c_clean:
            col_team_code = col
        elif "tên cụm" in c_clean or "ten cum" in c_clean:
            col_cluster_name = col
        elif "viết tắt cụm" in c_clean or "viet tat cum" in c_clean or "mã cụm" in c_clean:
            col_cluster_code = col

    print(f"Mapping cột: user={col_user}, role={col_role}, name={col_name}, team={col_team_name}, team_code={col_team_code}, cluster={col_cluster_name}, cluster_code={col_cluster_code}")

    # Build employee directory from Excel
    org_employees = {} # username_key -> dict
    org_teams = set()
    org_clusters = {} # ma_cum -> ten_cum

    def extract_vcc_code(text):
        if not text:
            return ""
        m = re.search(r'(VCC_HTH_\d+_[A-Z0-9]+)', str(text))
        if m:
            return m.group(1).upper()
        m2 = re.search(r'(\d+_[A-Z0-9]+)', str(text))
        if m2:
            return m2.group(1).upper()
        return str(text).strip()

    for idx, row in df.iterrows():
        raw_user = str(row[col_user]).strip()
        # handle floats like 485974.0 if read as float
        if raw_user.endswith(".0"):
            raw_user = raw_user[:-2]
        user_key = raw_user.lower()

        raw_role = row[col_role]
        is_leader = False
        try:
            is_leader = int(raw_role) == 1
        except Exception:
            is_leader = str(raw_role).strip() == "1"

        name = str(row[col_name]).strip()
        team_name = str(row[col_team_name]).strip()
        team_code = str(row[col_team_code]).strip()
        cluster_name = str(row[col_cluster_name]).strip()
        cluster_code = str(row[col_cluster_code]).strip()

        org_employees[user_key] = {
            "username": raw_user,
            "username_key": user_key,
            "ho_ten": name,
            "la_doi_truong": is_leader,
            "ten_doi": team_name,
            "ma_doi": team_code,
            "ten_cum": cluster_name,
            "ma_cum": cluster_code,
            "vcc_cum_code": extract_vcc_code(cluster_name)
        }
        org_teams.add((cluster_code, team_code, team_name))
        org_clusters[cluster_code] = cluster_name

    print(f"Đã đọc {len(org_employees)} nhân viên, {len(org_teams)} đội, {len(org_clusters)} cụm.")

    print("\n" + "=" * 70)
    print("2. ĐỐI CHIẾU NHÓM TRONG codinh_tasks VỚI DANH MỤC")
    print("=" * 70)
    
    db = SessionLocal()
    try:
        from sqlalchemy import func
        # Query distinct nhom in TaskCodinh
        nhom_counts = db.query(TaskCodinh.nhom, func.count(TaskCodinh.ma_cong_viec))\
            .group_by(TaskCodinh.nhom).all()
        
        total_wos = sum(c for _, c in nhom_counts)
        print(f"Tổng số WO trong codinh_tasks: {total_wos}")
        print(f"Số lượng giá trị nhom khác nhau: {len(nhom_counts)}\n")

        print("Chi tiết các giá trị `nhom` trong codinh_tasks:")
        matched_nhom_wos = 0
        unmatched_nhom_wos = 0

        # Cluster lookup by vcc code or ma_cum
        cluster_lookup = {}
        for mc, tc in org_clusters.items():
            cluster_lookup[mc.upper()] = (mc, tc)
            vcc = extract_vcc_code(tc)
            if vcc:
                cluster_lookup[vcc.upper()] = (mc, tc)

        for nhom_val, cnt in nhom_counts:
            nhom_str = (nhom_val or "").strip()
            vcc_code = extract_vcc_code(nhom_str)
            
            matched = False
            matched_info = None
            if vcc_code in cluster_lookup:
                matched = True
                matched_info = cluster_lookup[vcc_code]
            else:
                for mc, tc in org_clusters.items():
                    if mc.lower() in nhom_str.lower() or tc.lower() in nhom_str.lower():
                        matched = True
                        matched_info = (mc, tc)
                        break

            if matched:
                matched_nhom_wos += cnt
                print(f"  [KHỚP] nhom = '{nhom_val}': {cnt} WO -> Map tới Cụm: {matched_info[0]} ({matched_info[1]})")
            else:
                unmatched_nhom_wos += cnt
                print(f"  [KHÔNG KHỚP] nhom = '{nhom_val}': {cnt} WO")

        print(f"\nTổng kết: Khớp = {matched_nhom_wos} WO ({matched_nhom_wos/total_wos*100:.1f}%), Không khớp = {unmatched_nhom_wos} WO ({unmatched_nhom_wos/total_wos*100:.1f}%)")

        print("\n" + "=" * 70)
        print("3. ĐỐI CHIẾU CỤM CỦA NHÂN VIÊN (DANH MỤC VS WO CỦA HỌ)")
        print("=" * 70)

        emp_nhom_query = db.query(TaskCodinh.nhan_vien, TaskCodinh.nhom, func.count(TaskCodinh.ma_cong_viec))\
            .group_by(TaskCodinh.nhan_vien, TaskCodinh.nhom).all()

        emp_wo_summary = {} # user_key -> list of (nhom, cnt)
        unregistered_users = {} # user_key -> list of (nhom, cnt)

        for raw_u, nhom_val, cnt in emp_nhom_query:
            u_clean = (raw_u or "").strip().lower()
            if u_clean in org_employees:
                if u_clean not in emp_wo_summary:
                    emp_wo_summary[u_clean] = []
                emp_wo_summary[u_clean].append((nhom_val, cnt))
            else:
                if u_clean not in unregistered_users:
                    unregistered_users[u_clean] = []
                unregistered_users[u_clean].append((nhom_val, cnt))

        print(f"Số nhân viên có WO trong danh mục: {len(emp_wo_summary)} / {len(org_employees)}")
        print(f"Số username có WO NGOÀI danh mục: {len(unregistered_users)}")
        if unregistered_users:
            print("  Chi tiết username ngoài danh mục:")
            for u, nhoms in unregistered_users.items():
                total_u_wos = sum(c for _, c in nhoms)
                print(f"    - '{u}': tổng {total_u_wos} WO ({nhoms})")

        print("\nKiểm tra các trường hợp nhân viên có WO lệch cụm so với danh mục:")
        mismatched_emps = []
        consistent_emps = []

        for u_key, nhoms in emp_wo_summary.items():
            emp_info = org_employees[u_key]
            emp_cluster_code = emp_info["ma_cum"]
            emp_vcc = emp_info["vcc_cum_code"]

            has_mismatch = False
            mismatch_details = []

            for nhom_val, cnt in nhoms:
                nhom_vcc = extract_vcc_code(nhom_val)
                # check if matches
                is_match = False
                if emp_vcc and nhom_vcc and (emp_vcc in nhom_vcc or nhom_vcc in emp_vcc):
                    is_match = True
                elif emp_cluster_code and nhom_val and emp_cluster_code.lower() in nhom_val.lower():
                    is_match = True
                
                if not is_match:
                    has_mismatch = True
                    mismatch_details.append((nhom_val, cnt))

            if has_mismatch:
                mismatched_emps.append({
                    "username": emp_info["username"],
                    "ho_ten": emp_info["ho_ten"],
                    "ten_doi": emp_info["ten_doi"],
                    "org_cluster": f"{emp_info['ma_cum']} ({emp_info['ten_cum']})",
                    "wo_nhoms": nhoms,
                    "mismatch_nhoms": mismatch_details
                })
            else:
                consistent_emps.append(u_key)

        print(f"\nSố nhân viên có WO hoàn toàn đúng cụm danh mục: {len(consistent_emps)}")
        print(f"Số nhân viên có WO lệch cụm danh mục: {len(mismatched_emps)}")

        if mismatched_emps:
            print("\nDANH SÁCH CHI TIẾT CÁC NHÂN VIÊN BỊ LỆCH CỤM:")
            for m in mismatched_emps:
                print(f"  * {m['username']} ({m['ho_ten']}) - Đội: {m['ten_doi']}")
                print(f"    -> Cụm theo danh mục: {m['org_cluster']}")
                print(f"    -> Các nhóm WO trong DB: {m['wo_nhoms']}")
                print(f"    -> Nhóm bị lệch: {m['mismatch_nhoms']}")

        results_summary = {
            "total_wos": total_wos,
            "matched_nhom_wos": matched_nhom_wos,
            "unmatched_nhom_wos": unmatched_nhom_wos,
            "unregistered_users": {k: v for k, v in unregistered_users.items()},
            "mismatched_emps": mismatched_emps,
            "consistent_emps_count": len(consistent_emps),
        }
        with open("scripts/nhom_inspection_results.json", "w", encoding="utf-8") as f:
            json.dump(results_summary, f, ensure_ascii=False, indent=2)
        print("\nĐã lưu kết quả đối chiếu vào scripts/nhom_inspection_results.json")

    finally:
        db.close()

def capture_baseline():
    print("\n" + "=" * 70)
    print("4. CHỤP BASELINE STATS & DRILLDOWN CŨ")
    print("=" * 70)
    db = SessionLocal()
    clear_codinh_stats_cache()
    baseline = {"stats": {}, "drilldown": {}}
    
    test_months = [None, "2026-08", "2026-09", "2026-10", "all"]
    for cat_id in [13, 14]:
        for m in test_months:
            key = f"cat_{cat_id}_m_{m}"
            try:
                clear_codinh_stats_cache()
                data = get_codinh_stats(db, category_id=cat_id, target_month=m)
                baseline["stats"][key] = {
                    "summary": data["summary"],
                    "by_employee": data["by_employee"],
                    "by_group": data["by_group"],
                    "available_months": data["available_months"],
                }
                print(f"Captured stats {key}: total_wos={data['summary'].get('total_wos')}")
            except Exception as ex:
                print(f"Error capturing stats {key}: {ex}")

    # Drilldown metrics
    dd_cases = [
        # Cat 13 THC
        (13, None, "total"), (13, None, "closed"), (13, None, "pending"), (13, None, "overdue"),
        (13, None, "closed_today"), (13, None, "closed_yesterday"), (13, None, "closed_week"),
        (13, None, "cabinet_total"), (13, None, "cabinet_completed"), (13, None, "cabinet_pending"), (13, None, "cabinet_overdue"),
        (13, "2026-08", "total"), (13, "2026-08", "pending"), (13, "all", "total"),
        # Cat 14 Port Kem
        (14, None, "total"), (14, None, "closed"), (14, None, "pending"), (14, None, "overdue"),
        (14, None, "home_kem"), (14, None, "port_kem"),
        (14, None, "pending_under_24h"), (14, None, "pending_under_72h"),
        (14, None, "kpi_24h"), (14, None, "kpi_72h"),
        (14, None, "closed_today"), (14, None, "closed_yesterday"), (14, None, "closed_week"),
        (14, "2026-09", "total"), (14, "2026-09", "kpi_24h"), (14, "2026-09", "home_kem"), (14, "all", "total"),
    ]

    for cid, m, metric in dd_cases:
        key = f"cat_{cid}_m_{m}_metric_{metric}"
        try:
            dd = get_codinh_drilldown_tasks(db, category_id=cid, target_month=m, metric=metric, page=1, page_size=50)
            baseline["drilldown"][key] = {
                "total": dd["total"],
                "items_count": len(dd.get("items", [])),
                "sample_first_wo": dd["items"][0]["ma_cong_viec"] if dd.get("items") else None,
            }
            print(f"Captured drilldown {key}: total={dd['total']}")
        except Exception as ex:
            print(f"Error capturing drilldown {key}: {ex}")

    db.close()
    with open("scripts/baseline_codinh_step1.json", "w", encoding="utf-8") as f:
        json.dump(baseline, f, ensure_ascii=False, indent=2)
    print("Đã lưu baseline vào scripts/baseline_codinh_step1.json")

if __name__ == "__main__":
    inspect_nhom_and_excel()
    capture_baseline()

