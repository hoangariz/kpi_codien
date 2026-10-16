import sys
import os
import json
from pathlib import Path

# UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.database import SessionLocal, engine, Base
import backend.main # trigger migrations & auto seeding
from backend.services.codinh import (
    get_codinh_stats,
    get_codinh_drilldown_tasks,
    clear_codinh_stats_cache,
    get_org_tree,
    get_unmatched_usernames,
    get_reports_summary_cards,
)
from backend.models.codinh_org import CodinhCluster, CodinhTeam, CodinhEmployee

def run_verification():
    print("=" * 80)
    print("BƯỚC 1: KIỂM TRA SEED DANH MỤC ORG (CỤM -> ĐỘI -> NHÂN VIÊN)")
    print("=" * 80)
    db = SessionLocal()
    try:
        n_clusters = db.query(CodinhCluster).count()
        n_teams = db.query(CodinhTeam).count()
        n_employees = db.query(CodinhEmployee).count()
        n_leaders = db.query(CodinhEmployee).filter(CodinhEmployee.la_doi_truong == True).count()
        
        print(f"Số Cụm: {n_clusters} (kỳ vọng: 7)")
        print(f"Số Đội: {n_teams} (kỳ vọng: 16)")
        print(f"Số Nhân viên: {n_employees} (kỳ vọng: 85)")
        print(f"Số Đội trưởng: {n_leaders} (kỳ vọng: 16 - mỗi đội 1 đội trưởng)")

        assert n_clusters == 7, f"Sai số cụm: {n_clusters}"
        assert n_teams == 16, f"Sai số đội: {n_teams}"
        assert n_employees == 85, f"Sai số nhân viên: {n_employees}"
        assert n_leaders == 16, f"Sai số đội trưởng: {n_leaders}"
        print("[OK] Danh mục Org được khởi tạo chính xác 100%!\n")

        print("=" * 80)
        print("BƯỚC 2: KIỂM TRA TÀI KHOẢN NGOÀI DANH MỤC (UNMATCHED USERNAMES)")
        print("=" * 80)
        unmatched = get_unmatched_usernames(db)
        print(f"Số username có WO nhưng không có trong danh mục CĐBR: {len(unmatched)}")
        for u in unmatched[:10]:
            print(f"  - {u['username']} ({u['full_name']}): {u['total_wos']} WO")
        if len(unmatched) > 10:
            print(f"  ... và {len(unmatched) - 10} username khác.")

        print("\n" + "=" * 80)
        print("BƯỚC 3: ĐỐI CHIẾU STATS & BASELINE (scripts/baseline_codinh_step1.json)")
        print("=" * 80)
        with open("scripts/baseline_codinh_step1.json", "r", encoding="utf-8") as f:
            baseline = json.load(f)

        test_months = [None, "2026-08", "2026-09", "2026-10", "all"]
        summary_mismatches = []
        employee_mismatches = []
        tier_sum_errors = []

        diff_cluster_data = {} # (report_key, month) -> list of cluster comparison

        for report_key, cid in [("thc", 13), ("port_kem", 14)]:
            for m in test_months:
                case_key = f"cat_{cid}_m_{m}"
                b_stats = baseline["stats"].get(case_key)
                if not b_stats:
                    print(f"[SKIP] Không tìm thấy baseline cho {case_key}")
                    continue

                clear_codinh_stats_cache()
                new_data = get_codinh_stats(db, report=report_key, target_month=m)

                b_sum = b_stats["summary"]
                n_sum = new_data["summary"]

                # 3.1 Check summary
                metric_keys_to_check = [
                    "total_wos", "closed_wos", "pending_wos", "overdue_wos",
                    "closed_today_wos", "closed_yesterday_wos", "closed_week_wos",
                    "wo_rate", "home_kem_count", "port_kem_count",
                    "pending_under_24h", "pending_under_72h",
                    "closed_within_24h", "closed_within_72h",
                    "total_cabinets", "completed_cabinets", "pending_cabinets", "overdue_cabinets",
                    "cabinet_rate"
                ]

                sum_err = []
                for k in metric_keys_to_check:
                    if b_sum.get(k) != n_sum.get(k):
                        sum_err.append((k, b_sum.get(k), n_sum.get(k)))

                if sum_err:
                    summary_mismatches.append((case_key, sum_err))
                    print(f"[-] LỆCH SUMMARY {case_key}: {sum_err}")
                else:
                    print(f"[OK] Summary khớp 100%: {case_key} (total_wos={n_sum['total_wos']}, closed={n_sum['closed_wos']}, pending={n_sum['pending_wos']})")

                # 3.2 Check by_employee matches baseline 100%
                b_emps = {e["key_name"]: e for e in b_stats["by_employee"]}
                n_emps = {e["key_name"]: e for e in new_data["by_employee"]}

                emp_err = []
                # Check all employees present in baseline
                for e_name, b_e in b_emps.items():
                    if e_name not in n_emps:
                        emp_err.append((e_name, "Thiếu nhân viên trong new_data"))
                        continue
                    n_e = n_emps[e_name]
                    for k in [
                        "total_wos", "closed_wos", "pending_wos", "overdue_wos",
                        "home_kem_count", "port_kem_count",
                        "total_cabinets", "completed_cabinets", "pending_cabinets", "overdue_cabinets"
                    ]:
                        if b_e.get(k) != n_e.get(k):
                            emp_err.append((e_name, k, b_e.get(k), n_e.get(k)))

                for e_name, n_e in n_emps.items():
                    if e_name not in b_emps:
                        if n_e["total_wos"] != 0:
                            emp_err.append((e_name, f"Nhân viên mới có {n_e['total_wos']} WO nhưng không có trong baseline"))

                if emp_err:
                    employee_mismatches.append((case_key, emp_err[:5]))
                    print(f"[-] LỆCH BY_EMPLOYEE {case_key}: {len(emp_err)} lỗi, vd: {emp_err[:3]}")
                else:
                    active_cnt = sum(1 for e in n_emps.values() if e['total_wos'] > 0)
                    zero_cnt = sum(1 for e in n_emps.values() if e['total_wos'] == 0)
                    print(f"[OK] by_employee khớp 100%: {case_key} ({len(n_emps)} nhân viên: {active_cnt} có WO, {zero_cnt} có 0 WO)")

                # 3.3 Check 3-tier sums: sum(by_cluster) == sum(by_team) == sum(by_employee) == summary
                sum_wos = n_sum["total_wos"]
                sum_closed = n_sum["closed_wos"]
                sum_pending = n_sum["pending_wos"]
                sum_cabs = n_sum.get("total_cabinets", 0)

                c_wos = sum(c["total_wos"] for c in new_data["by_cluster"])
                c_closed = sum(c["closed_wos"] for c in new_data["by_cluster"])
                c_pending = sum(c["pending_wos"] for c in new_data["by_cluster"])
                c_cabs = sum(c["total_cabinets"] for c in new_data["by_cluster"])

                t_wos = sum(t["total_wos"] for t in new_data["by_team"])
                t_closed = sum(t["closed_wos"] for t in new_data["by_team"])
                t_pending = sum(t["pending_wos"] for t in new_data["by_team"])
                t_cabs = sum(t["total_cabinets"] for t in new_data["by_team"])

                e_wos = sum(e["total_wos"] for e in new_data["by_employee"])
                e_closed = sum(e["closed_wos"] for e in new_data["by_employee"])
                e_pending = sum(e["pending_wos"] for e in new_data["by_employee"])
                e_cabs = sum(e["total_cabinets"] for e in new_data["by_employee"])

                tier_ok = (
                    c_wos == t_wos == e_wos == sum_wos and
                    c_closed == t_closed == e_closed == sum_closed and
                    c_pending == t_pending == e_pending == sum_pending and
                    c_cabs == t_cabs == e_cabs == sum_cabs
                )
                if not tier_ok:
                    tier_sum_errors.append((case_key, {
                        "summary": (sum_wos, sum_closed, sum_pending, sum_cabs),
                        "cluster": (c_wos, c_closed, c_pending, c_cabs),
                        "team": (t_wos, t_closed, t_pending, t_cabs),
                        "employee": (e_wos, e_closed, e_pending, e_cabs),
                    }))
                    print(f"[-] LỆCH TỔNG 3 CẤP {case_key}")
                else:
                    print(f"[OK] Tổng 3 cấp khớp tuyệt đối: sum(Cụm) = sum(Đội) = sum(Nhân viên) = summary ({sum_wos} WO)")

                # Verify drilldown for other_cluster and other_team
                other_c_entry = next((c for c in new_data["by_cluster"] if c.get("is_other")), None)
                other_t_entry = next((t for t in new_data["by_team"] if t.get("is_other")), None)
                if other_c_entry:
                    dd_c_other = get_codinh_drilldown_tasks(db, report=report_key, target_month=m, metric="total", filter_type="other_cluster")
                    if dd_c_other["total"] != other_c_entry["total_wos"]:
                        print(f"[-] LỆCH DRILLDOWN other_cluster {case_key}: dd={dd_c_other['total']}, stats={other_c_entry['total_wos']}")
                    else:
                        print(f"[OK] Drilldown other_cluster khớp {case_key}: {dd_c_other['total']} WOs")
                if other_t_entry:
                    dd_t_other = get_codinh_drilldown_tasks(db, report=report_key, target_month=m, metric="total", filter_type="other_team")
                    if dd_t_other["total"] != other_t_entry["total_wos"]:
                        print(f"[-] LỆCH DRILLDOWN other_team {case_key}: dd={dd_t_other['total']}, stats={other_t_entry['total_wos']}")
                    else:
                        print(f"[OK] Drilldown other_team khớp {case_key}: {dd_t_other['total']} WOs")

                # Collect cluster comparison data for report
                diff_cluster_data[(report_key, str(m))] = {
                    "old_groups": b_stats.get("by_group", []),
                    "new_clusters": new_data.get("by_cluster", [])
                }

        print("\n" + "=" * 80)
        print("BƯỚC 4: KIỂM TRA DRILLDOWN MATCHING BASELINE")
        print("=" * 80)
        dd_mismatches = []
        for dd_key, b_dd in baseline.get("drilldown", {}).items():
            # parse key: cat_{cid}_m_{m}_metric_{metric}
            parts = dd_key.split("_")
            cid = int(parts[1])
            rep_key = "thc" if cid == 13 else "port_kem"
            
            # extract m and metric
            # Format: cat_13_m_None_metric_total or cat_13_m_2026-08_metric_total
            m_val = None
            if "_m_None_" in dd_key:
                m_val = None
                metric_name = dd_key.split("_metric_")[1]
            elif "_m_all_" in dd_key:
                m_val = "all"
                metric_name = dd_key.split("_metric_")[1]
            else:
                m_val = dd_key.split("_m_")[1].split("_metric_")[0]
                metric_name = dd_key.split("_metric_")[1]

            n_dd = get_codinh_drilldown_tasks(
                db,
                report=rep_key,
                target_month=m_val,
                metric=metric_name,
                page=1,
                page_size=50
            )

            if n_dd["total"] != b_dd["total"]:
                dd_mismatches.append((dd_key, b_dd["total"], n_dd["total"]))
                print(f"[-] LỆCH DRILLDOWN {dd_key}: baseline={b_dd['total']}, new={n_dd['total']}")
            else:
                print(f"[OK] Drilldown {dd_key}: {n_dd['total']} WOs")

        print("\n" + "=" * 80)
        print("BƯỚC 5: TẠO FILE SO SÁNH scripts/diff_cluster_vs_baseline.md")
        print("=" * 80)
        generate_markdown_report(diff_cluster_data, summary_mismatches, employee_mismatches, tier_sum_errors, dd_mismatches)

    finally:
        db.close()


def generate_markdown_report(diff_cluster_data, summary_mismatches, employee_mismatches, tier_sum_errors, dd_mismatches):
    md_lines = []
    md_lines.append("# BẢNG SO SÁNH TAB CỤM CŨ VÀ MỚI (CĐBR)")
    md_lines.append("")
    md_lines.append("> **Ngày tạo:** 2026-10-12  ")
    md_lines.append("> **Nguồn danh mục mới:** `danhsachnhanvien_codinh.xlsx` (Cụm -> Đội -> Nhân viên)  ")
    md_lines.append("> **Quy tắc gom Cụm mới:** Mỗi WO được tính về Cụm của Nhân viên thực hiện theo danh mục. WO của tài khoản ngoài danh mục được gom vào dòng `Chưa phân cụm` (`is_other=True`).")
    md_lines.append("")

    md_lines.append("## 1. Kết quả kiểm tra toàn vẹn hệ thống")
    md_lines.append("")
    md_lines.append(f"- **Summary khớp baseline:** {'✅ 100% Khớp hoàn hảo' if not summary_mismatches else f'❌ Có {len(summary_mismatches)} lỗi'}")
    md_lines.append(f"- **Tab Nhân viên khớp baseline:** {'✅ 100% Khớp hoàn hảo' if not employee_mismatches else f'❌ Có {len(employee_mismatches)} lỗi'}")
    md_lines.append(f"- **Tổng Cụm = Đội = Nhân viên = Summary:** {'✅ 100% Khớp tuyệt đối mọi tháng' if not tier_sum_errors else f'❌ Có {len(tier_sum_errors)} lỗi'}")
    md_lines.append(f"- **Drilldown khớp baseline:** {'✅ 100% Khớp hoàn hảo' if not dd_mismatches else f'❌ Có {len(dd_mismatches)} lỗi'}")
    md_lines.append("")

    # Current month: "None" / active month in system
    months_to_compare = [("None", "Tháng hiện tại (Active Month)"), ("2026-08", "Tháng 2026-08"), ("all", "Toàn bộ thời gian (All)")]

    for m_val, m_title in months_to_compare:
        md_lines.append(f"---")
        md_lines.append(f"## 2. So sánh chi tiết: {m_title}")
        md_lines.append("")

        # 2.1 THC Report
        md_lines.append("### 2.1. Báo cáo Bảo Dưỡng Tủ Hộp Cáp (THC)")
        md_lines.append("")
        thc_data = diff_cluster_data.get(("thc", m_val))
        if thc_data:
            md_lines.append("#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)")
            md_lines.append("| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |")
            md_lines.append("|---|---|---|---|---|---|---|---|---|---|")
            for idx, c in enumerate(thc_data["new_clusters"], 1):
                md_lines.append(f"| {idx} | **{c['key_name']}** | {c['total_wos']} | {c['closed_wos']} | {c['pending_wos']} | {c['overdue_wos']} | {c['total_cabinets']} | {c['completed_cabinets']} | {c['pending_cabinets']} | {c['cabinet_rate']}% |")
            
            md_lines.append("")
            md_lines.append("#### Nhóm CŨ (Tính theo codinh_tasks.nhom)")
            md_lines.append("| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |")
            md_lines.append("|---|---|---|---|---|---|---|---|---|---|")
            for idx, g in enumerate(thc_data["old_groups"], 1):
                md_lines.append(f"| {idx} | {g['key_name']} | {g['total_wos']} | {g['closed_wos']} | {g['pending_wos']} | {g['overdue_wos']} | {g['total_cabinets']} | {g['completed_cabinets']} | {g['pending_cabinets']} | {g['cabinet_rate']}% |")

        md_lines.append("")

        # 2.2 Port Kem Report
        md_lines.append("### 2.2. Báo cáo ĐH Port Kém")
        md_lines.append("")
        port_data = diff_cluster_data.get(("port_kem", m_val))
        if port_data:
            md_lines.append("#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)")
            md_lines.append("| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |")
            md_lines.append("|---|---|---|---|---|---|---|---|---|---|")
            for idx, c in enumerate(port_data["new_clusters"], 1):
                md_lines.append(f"| {idx} | **{c['key_name']}** | {c['total_wos']} | {c['closed_wos']} | {c['pending_wos']} | {c['home_kem_count']} | {c['port_kem_count']} | {c['overdue_wos']} | {c['kpi_24h_rate']}% | {c['kpi_72h_rate']}% |")

            md_lines.append("")
            md_lines.append("#### Nhóm CŨ (Tính theo codinh_tasks.nhom)")
            md_lines.append("| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |")
            md_lines.append("|---|---|---|---|---|---|---|---|---|---|")
            for idx, g in enumerate(port_data["old_groups"], 1):
                md_lines.append(f"| {idx} | {g['key_name']} | {g['total_wos']} | {g['closed_wos']} | {g['pending_wos']} | {g['home_kem_count']} | {g['port_kem_count']} | {g['overdue_wos']} | {g['kpi_24h_rate']}% | {g['kpi_72h_rate']}% |")

        md_lines.append("")

    md_content = "\n".join(md_lines)
    out_path = Path("scripts/diff_cluster_vs_baseline.md")
    out_path.write_text(md_content, encoding="utf-8")
    print(f"[OK] Đã ghi báo cáo so sánh vào {out_path} ({len(md_content)} ký tự)")

if __name__ == "__main__":
    run_verification()
