from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.services.codinh.registry import REPORTS
from backend.services.codinh.org import get_org_tree
from backend.models.settings import SystemSetting


def get_dieuhanh_team_data(
    db: Session,
    team_id: Optional[int] = None,
    target_date: Optional[str] = None,
    target_month: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Tổng hợp dữ liệu điều hành cho Đội trưởng theo từng nhân viên trong Đội:
    - Nhóm 1: VIỆC TỒN (Triển khai, Sự cố, Bảo dưỡng THC, Báo hỏng THC, Port kém)
    - Nhóm 2: TIẾN ĐỘ & HOÀN THÀNH (Nghiệm thu ngày/tháng, NSLĐ, Đóng sự cố, Đóng THC, Port kém)
    - Thời gian cập nhật dữ liệu gần nhất
    """
    org_tree = get_org_tree(db)

    # 1. Tìm thông tin đội và danh sách nhân viên
    selected_team = None
    all_teams_list = []

    for cluster in org_tree:
        for team in cluster.get("teams", []):
            team_summary_item = {
                "id": team["id"],
                "ten_doi": team["ten_doi"],
                "ma_doi": team["ma_doi"],
                "cluster_id": cluster["id"],
                "ten_cum": cluster["ten_cum"],
                "ma_cum": cluster["ma_cum"],
                "member_count": len(team.get("employees", [])),
            }
            all_teams_list.append(team_summary_item)
            if team_id is not None and team["id"] == team_id:
                selected_team = {
                    **team_summary_item,
                    "employees": team.get("employees", []),
                }

    # 2. Lấy thời gian cập nhật gần nhất từ SystemSetting
    last_update_vn = "Chưa cập nhật"
    s_update = db.query(SystemSetting).filter(
        SystemSetting.key.in_(["qlctkt_last_update_vn", "codinh_last_import_wo_time_vn"])
    ).all()
    setting_vals = [s.value for s in s_update if s.value]
    if setting_vals:
        last_update_vn = sorted(setting_vals, reverse=True)[0]

    rep_qlctkt = REPORTS.get("qlctkt_trien_khai")
    available_dates = rep_qlctkt.get_available_dates(db) if (rep_qlctkt and hasattr(rep_qlctkt, "get_available_dates")) else []
    active_date = target_date or (available_dates[0] if available_dates else datetime.now().strftime("%Y-%m-%d"))
    active_month = target_month or datetime.now().strftime("%Y-%m")

    # Nếu người dùng chưa chọn đội nào (mặc định ban đầu):
    if team_id is None:
        return {
            "status": "no_team_selected",
            "message": "Vui lòng chọn Cụm & Đội để xem dữ liệu điều hành",
            "last_update_vn": last_update_vn,
            "selected_date": active_date,
            "selected_month": active_month,
            "available_dates": available_dates[:15],
            "all_teams": all_teams_list,
            "team_info": None,
            "team_summary": None,
            "employees": [],
        }

    if not selected_team:
        return {
            "status": "not_found",
            "message": f"Không tìm thấy Đội có ID {team_id}",
            "last_update_vn": last_update_vn,
            "selected_date": active_date,
            "selected_month": active_month,
            "available_dates": available_dates[:15],
            "all_teams": all_teams_list,
            "team_info": None,
            "team_summary": None,
            "employees": [],
        }

    # 3. Chạy các báo cáo CĐBR
    rep_qlctkt = REPORTS.get("qlctkt_trien_khai")
    rep_su_co = REPORTS.get("tong_hop_su_co")
    rep_thc = REPORTS.get("thc")
    rep_bao_hong = REPORTS.get("bao_hong_thc")
    rep_port_kem = REPORTS.get("port_kem")

    stats_qlctkt = rep_qlctkt.compute_stats(db, target_date=target_date) if rep_qlctkt else {}
    stats_su_co = rep_su_co.compute_stats(db, target_month=target_month) if rep_su_co else {}
    stats_thc = rep_thc.compute_stats(db, target_month=target_month) if rep_thc else {}
    stats_bao_hong = rep_bao_hong.compute_stats(db, target_month=target_month) if rep_bao_hong else {}
    stats_port_kem = rep_port_kem.compute_stats(db, target_month=target_month) if rep_port_kem else {}

    # Available dates
    available_dates = stats_qlctkt.get("available_dates", [])
    active_date = stats_qlctkt.get("selected_date") or target_date
    active_month = stats_qlctkt.get("selected_month") or target_month or datetime.now().strftime("%Y-%m")

    # Map số liệu của từng nhân viên theo employee_id hoặc username
    t_id = selected_team["id"]

    def index_by_emp(stats_obj):
        res = {}
        for r in stats_obj.get("by_employee", []):
            if r.get("team_id") == t_id:
                eid = r.get("employee_id")
                uname = str(r.get("username") or r.get("key_name") or "").strip().lower()
                name = str(r.get("name") or "").strip().lower()
                if eid:
                    res[eid] = r
                if uname:
                    res[uname] = r
                if name:
                    res[name] = r
        return res

    map_qlctkt = index_by_emp(stats_qlctkt)
    map_su_co = index_by_emp(stats_su_co)
    map_thc = index_by_emp(stats_thc)
    map_bao_hong = index_by_emp(stats_bao_hong)
    map_port_kem = index_by_emp(stats_port_kem)

    # 4. Dựng dữ liệu cho từng nhân viên trong Đội
    employees_data = []
    team_total_ton = 0
    team_total_qua_han = 0
    team_total_nghiem_thu_n = 0
    team_total_ftth_thang = 0
    team_total_nsld_sum = 0
    team_total_nsld_count = 0

    for emp in selected_team.get("employees", []):
        eid = emp["id"]
        uname = str(emp.get("username") or "").strip().lower()
        name = str(emp.get("ho_ten") or "").strip().lower()

        # Lookup in each report
        q_row = map_qlctkt.get(eid) or map_qlctkt.get(uname) or map_qlctkt.get(name) or {}
        sc_row = map_su_co.get(eid) or map_su_co.get(uname) or map_su_co.get(name) or {}
        thc_row = map_thc.get(eid) or map_thc.get(uname) or map_thc.get(name) or {}
        bh_row = map_bao_hong.get(eid) or map_bao_hong.get(uname) or map_bao_hong.get(name) or {}
        pk_row = map_port_kem.get(eid) or map_port_kem.get(uname) or map_port_kem.get(name) or {}

        # TỒN
        ton_tk_val = int(q_row.get("tong_ton") or 0)
        qua_han_tk = int(q_row.get("qua_han") or 0)
        ton_sc_val = int(sc_row.get("ton_su_co") or 0)
        qua_han_sc = int(sc_row.get("qua_han") or 0)
        ton_thc_val = int(thc_row.get("pending_wos") or 0)
        qua_han_thc = int(thc_row.get("overdue_wos") or 0)
        ton_bh_val = int(bh_row.get("pending_wos") or 0)
        qua_han_bh = int(bh_row.get("overdue_wos") or 0)
        ton_pk_val = int(pk_row.get("pending_wos") or 0)
        qua_han_pk = int(pk_row.get("overdue_wos") or 0)

        emp_total_ton = ton_tk_val + ton_sc_val + ton_thc_val + ton_bh_val + ton_pk_val
        emp_total_qua_han = qua_han_tk + qua_han_sc + qua_han_thc + qua_han_bh + qua_han_pk

        team_total_ton += emp_total_ton
        team_total_qua_han += emp_total_qua_han

        # HOÀN THÀNH
        nt_n = int(q_row.get("nghiem_thu_n") or 0)
        nt_ftth_thang = int(q_row.get("nghiem_thu_ftth_thang") or 0)
        nsld_val = q_row.get("nsld")
        if nsld_val is not None:
            try:
                team_total_nsld_sum += float(nsld_val)
                team_total_nsld_count += 1
            except Exception:
                pass

        team_total_nghiem_thu_n += nt_n
        team_total_ftth_thang += nt_ftth_thang

        emp_obj = {
            "id": eid,
            "username": emp.get("username"),
            "ho_ten": emp.get("ho_ten"),
            "is_leader": bool(emp.get("la_doi_truong")),
            "ton": {
                "tong_ton": emp_total_ton,
                "tong_qua_han": emp_total_qua_han,
                "trien_khai": {
                    "tong": ton_tk_val,
                    "qua_han": qua_han_tk,
                    "duong_day": int(q_row.get("ton_duong_day") or 0),
                    "ldtb": int(q_row.get("ton_ldtb") or 0),
                    "vtci_ftth": int(q_row.get("ton_vtci_ftth") or 0),
                    "tich_hen_dd": int(q_row.get("ton_duong_day_th") or 0),
                    "tich_hen_ldtb": int(q_row.get("ton_ldtb_th") or 0),
                },
                "su_co": {
                    "tong": ton_sc_val,
                    "qua_han": qua_han_sc,
                    "hot": int(sc_row.get("hot") or 0),
                },
                "thc_bao_duong": {
                    "tong": ton_thc_val,
                    "qua_han": qua_han_thc,
                },
                "thc_bao_hong": {
                    "tong": ton_bh_val,
                    "qua_han": qua_han_bh,
                    "pda": int(bh_row.get("ton_pda") or 0),
                    "qua_han_pda": int(bh_row.get("qua_han_pda") or 0),
                    "thay_hop": int(bh_row.get("ton_thay_hop") or 0),
                    "qua_han_thay_hop": int(bh_row.get("qua_han_thay_hop") or 0),
                },
                "port_kem": {
                    "tong": ton_pk_val,
                    "qua_han": qua_han_pk,
                },
            },
            "hoan_thanh": {
                "trien_khai": {
                    "nghiem_thu_n": nt_n,
                    "dd_nghiem_thu_n": int(q_row.get("dd_nghiem_thu_n") or 0),
                    "nghiem_thu_ftth_thang": nt_ftth_thang,
                    "tk_vtci_ngay_n": int(q_row.get("tk_vtci_ngay_n") or 0),
                    "tk_vtci_thang_n": int(q_row.get("tk_vtci_thang_n") or 0),
                    "dau_noi_n": int(q_row.get("dau_noi_n") or 0),
                    "nsld": nsld_val,
                },
                "su_co": {
                    "da_dong_n": int(sc_row.get("tac_vu_dong_n") or sc_row.get("nghiem_thu_n") or 0),
                },
                "thc_bao_duong": {
                    "closed_wos": int(thc_row.get("closed_wos") or 0),
                    "completed_cabinets": int(thc_row.get("completed_cabinets") or 0),
                    "total_cabinets": int(thc_row.get("total_cabinets") or 0),
                },
                "thc_bao_hong": {
                    "closed_wos": int(bh_row.get("closed_wos") or 0),
                    "wo_rate": bh_row.get("wo_rate"),
                },
                "port_kem": {
                    "closed_wos": int(pk_row.get("closed_wos") or 0),
                    "wo_rate": pk_row.get("wo_rate"),
                },
            },
        }
        employees_data.append(emp_obj)

    # Sắp xếp: Đội trưởng lên đầu, sau đó sắp xếp theo tổng tồn giảm dần
    employees_data.sort(key=lambda x: (not x["is_leader"], -x["ton"]["tong_ton"], -x["hoan_thanh"]["trien_khai"]["nghiem_thu_n"]))

    avg_nsld = round(team_total_nsld_sum / team_total_nsld_count, 2) if team_total_nsld_count > 0 else 0

    return {
        "status": "success",
        "last_update_vn": last_update_vn,
        "selected_date": active_date,
        "selected_month": active_month,
        "available_dates": available_dates[:15],
        "team_info": {
            "id": selected_team["id"],
            "ten_doi": selected_team["ten_doi"],
            "ma_doi": selected_team["ma_doi"],
            "cluster_id": selected_team["cluster_id"],
            "ten_cum": selected_team["ten_cum"],
            "ma_cum": selected_team["ma_cum"],
            "total_members": len(employees_data),
        },
        "all_teams": all_teams_list,
        "team_summary": {
            "tong_ton": team_total_ton,
            "tong_qua_han": team_total_qua_han,
            "nghiem_thu_n": team_total_nghiem_thu_n,
            "nghiem_thu_ftth_thang": team_total_ftth_thang,
            "avg_nsld": avg_nsld,
        },
        "employees": employees_data,
    }
