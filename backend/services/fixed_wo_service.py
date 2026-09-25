import re
import calendar
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, case, distinct, desc, asc

from backend.models.task import Task
from backend.models.dimensions import Employee, Group, TaskType
from backend.models.fixed_wo_report import FixedWoReport, FixedWoItem
from backend.schemas.fixed_wo_schema import (
    FixedWoReportCreate,
    FixedWoReportUpdate,
)

CLOSED_STATUSES = ["Đóng", "FT hoàn thành", "FT Hoàn thành", "FT Hoàn Thành"]


def parse_wo_codes_input(raw: Optional[Union[List[str], str]]) -> List[str]:
    """Parse, clean, and deduplicate WO codes from raw string or list."""
    if not raw:
        return []
    if isinstance(raw, list):
        items = raw
    else:
        # Split by comma, semicolon, newline, tab, carriage return, or multiple spaces
        items = re.split(r"[,;\n\r\t]+", str(raw))

    results = []
    seen = set()
    for it in items:
        cleaned = str(it).strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            results.append(cleaned)
    return results


def create_fixed_wo_report(db: Session, data: FixedWoReportCreate) -> FixedWoReport:
    """Create a new Fixed WO Report with its imported WO codes."""
    name = (data.name or "").strip()
    if not name:
        raise ValueError("Tên danh mục báo cáo không được để trống")

    report = FixedWoReport(
        name=name,
        description=data.description.strip() if data.description else None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    wo_codes = parse_wo_codes_input(data.wo_codes)
    if wo_codes:
        batch_size = 5000
        items_to_insert = [{"report_id": report.id, "ma_cong_viec": code, "created_at": datetime.utcnow()} for code in wo_codes]
        for i in range(0, len(items_to_insert), batch_size):
            db.bulk_insert_mappings(FixedWoItem, items_to_insert[i : i + batch_size])
            db.commit()

    return report


def update_fixed_wo_report(db: Session, report_id: int, data: FixedWoReportUpdate) -> FixedWoReport:
    """Update name, description, or WO codes list of a Fixed WO Report."""
    report = db.query(FixedWoReport).filter(FixedWoReport.id == report_id).first()
    if not report:
        raise ValueError(f"Không tìm thấy báo cáo cố định có ID {report_id}")

    if data.name is not None:
        report.name = data.name.strip()
    if data.description is not None:
        report.description = data.description.strip() if data.description else None

    # Replace all WO codes if explicitly provided
    if data.wo_codes is not None:
        db.query(FixedWoItem).filter(FixedWoItem.report_id == report_id).delete()
        db.commit()

        new_codes = parse_wo_codes_input(data.wo_codes)
        if new_codes:
            batch_size = 5000
            items_to_insert = [{"report_id": report.id, "ma_cong_viec": code, "created_at": datetime.utcnow()} for code in new_codes]
            for i in range(0, len(items_to_insert), batch_size):
                db.bulk_insert_mappings(FixedWoItem, items_to_insert[i : i + batch_size])
                db.commit()

    # Append new WO codes if provided
    if data.wo_codes_to_add:
        codes_to_add = parse_wo_codes_input(data.wo_codes_to_add)
        if codes_to_add:
            existing = set(
                row[0] for row in db.query(FixedWoItem.ma_cong_viec).filter(
                    FixedWoItem.report_id == report_id,
                    FixedWoItem.ma_cong_viec.in_(codes_to_add)
                ).all()
            )
            to_insert = [c for c in codes_to_add if c not in existing]
            if to_insert:
                batch_size = 5000
                items_to_insert = [{"report_id": report.id, "ma_cong_viec": c, "created_at": datetime.utcnow()} for c in to_insert]
                for i in range(0, len(items_to_insert), batch_size):
                    db.bulk_insert_mappings(FixedWoItem, items_to_insert[i : i + batch_size])
                    db.commit()

    # Remove WO codes if provided
    if data.wo_codes_to_remove:
        codes_to_remove = parse_wo_codes_input(data.wo_codes_to_remove)
        if codes_to_remove:
            db.query(FixedWoItem).filter(
                FixedWoItem.report_id == report_id,
                FixedWoItem.ma_cong_viec.in_(codes_to_remove)
            ).delete(synchronize_session=False)
            db.commit()

    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return report


def delete_fixed_wo_report(db: Session, report_id: int) -> bool:
    """Delete a Fixed WO Report and its items."""
    report = db.query(FixedWoReport).filter(FixedWoReport.id == report_id).first()
    if not report:
        return False
    db.delete(report)
    db.commit()
    return True


def get_fixed_wo_reports(db: Session) -> List[Dict[str, Any]]:
    """List all fixed WO reports with counts and summary metrics."""
    reports = db.query(FixedWoReport).order_by(FixedWoReport.id.asc()).all()
    results = []

    now = datetime.utcnow()

    for r in reports:
        total_wos = db.query(func.count(FixedWoItem.id)).filter(FixedWoItem.report_id == r.id).scalar() or 0

        # Subquery for tasks belonging to this report
        task_subquery = db.query(FixedWoItem.ma_cong_viec).filter(FixedWoItem.report_id == r.id)

        agg = db.query(
            func.count(Task.ma_cong_viec).label("matched"),
            func.sum(case((Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("closed"),
            func.sum(case((~Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("pending"),
            func.sum(
                case(
                    (
                        and_(
                            ~Task.trang_thai.in_(CLOSED_STATUSES),
                            or_(
                                Task.thoi_gian_con_lai < 0,
                                and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                            )
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("overdue"),
        ).filter(Task.ma_cong_viec.in_(task_subquery)).first()

        matched = agg.matched or 0 if agg else 0
        cl_matched = agg.closed or 0 if agg else 0
        pe = agg.pending or 0 if agg else 0
        ov = agg.overdue or 0 if agg else 0

        # Quy tắc: Những WO không tìm thấy trong log để Đã giao FT -> tính vào Tồn việc (chưa đóng), note ghi chú (IS KL)
        unmatched = max(0, total_wos - matched)
        cl = cl_matched
        pe = pe + unmatched
        rate = round((cl / total_wos * 100), 1) if total_wos > 0 else 0.0

        results.append({
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "total_wos": total_wos,
            "matched_wos": matched,
            "unmatched_wos": unmatched,
            "summary": {
                "total": total_wos,
                "closed": cl,
                "pending": pe,
                "overdue": ov,
                "completion_rate": rate,
            },
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        })
    return results


def get_fixed_wo_stats(
    db: Session,
    report_id: int,
    target_month: Optional[str] = None
) -> Dict[str, Any]:
    """
    Compute detailed breakdown by Employee and Group for tasks in this Fixed WO Report.
    Mirrors get_special_maintenance_stats logic for spreadsheet table rendering.
    """
    from backend.services.settings_service import get_current_month_setting

    report = db.query(FixedWoReport).filter(FixedWoReport.id == report_id).first()
    if not report:
        raise ValueError(f"Không tìm thấy báo cáo cố định có ID {report_id}")

    active_month = target_month or get_current_month_setting(db)

    try:
        y_str, m_str = active_month.split("-")
        y_int = int(y_str)
        m_int = int(m_str)
    except Exception:
        now_dt = datetime.utcnow()
        active_month = now_dt.strftime("%Y-%m")
        y_int = now_dt.year
        m_int = now_dt.month

    now_vn = datetime.utcnow() + timedelta(hours=7)
    cur_ym = now_vn.strftime("%Y-%m")
    if active_month == cur_ym:
        max_day = max(1, now_vn.day - 1)
    elif active_month < cur_ym:
        max_day = calendar.monthrange(y_int, m_int)[1]
    else:
        max_day = 1
    days_list = list(range(1, 32))

    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    yesterday_start = today_start - timedelta(days=1)
    seven_days_ago = today_start - timedelta(days=7)

    # All WO codes registered in this report
    total_wos = db.query(func.count(FixedWoItem.id)).filter(FixedWoItem.report_id == report_id).scalar() or 0
    wo_subquery = db.query(FixedWoItem.ma_cong_viec).filter(FixedWoItem.report_id == report_id)

    # Condition: task is in this report's WOs
    condition = Task.ma_cong_viec.in_(wo_subquery)

    # Query closed tasks for daily breakdown
    closed_tasks_records = db.query(
        Task.assigned_to_id,
        Task.group_id,
        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong).label("closed_time")
    ).filter(
        condition,
        Task.trang_thai.in_(CLOSED_STATUSES),
        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None
    ).all()

    emp_daily = defaultdict(lambda: defaultdict(int))
    grp_daily = defaultdict(lambda: defaultdict(int))
    total_daily = defaultdict(int)

    for aid, gid, ctime in closed_tasks_records:
        if isinstance(ctime, str):
            try:
                ctime = datetime.fromisoformat(ctime.replace(" ", "T"))
            except Exception:
                ctime = None
        if ctime and ctime.year == y_int and ctime.month == m_int:
            d = ctime.day
            if 1 <= d <= 31:
                ekey = aid if aid is not None else "other"
                gkey = gid if gid is not None else "other"
                emp_daily[ekey][d] += 1
                grp_daily[gkey][d] += 1
                total_daily[d] += 1

    # Employee group mapping
    emp_groups = db.query(Task.assigned_to_id, Group.name)\
        .join(Group, Task.group_id == Group.id)\
        .filter(condition, Task.assigned_to_id != None)\
        .group_by(Task.assigned_to_id, Group.name)\
        .all()
    emp_to_group = {}
    for aid, gname in emp_groups:
        if aid not in emp_to_group:
            emp_to_group[aid] = gname

    # 1. Overall Summary
    overall_agg = db.query(
        func.count(Task.ma_cong_viec).label("matched"),
        func.sum(case((Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("closed"),
        func.sum(case((~Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("pending"),
        func.sum(
            case(
                (
                    and_(
                        ~Task.trang_thai.in_(CLOSED_STATUSES),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_today"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= yesterday_start,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) < today_start
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_yesterday"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= seven_days_ago
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_last_7_days"),
        func.sum(
            case(
                (
                    or_(
                        Task.trang_thai == "Chờ CD tiếp nhận",
                        Task.trang_thai == "Chờ CĐ tiếp nhận",
                        Task.trang_thai.ilike("%tiếp nhận%")
                    ),
                    1
                ),
                else_=0
            )
        ).label("cho_cd_tiep_nhan"),
        func.sum(
            case(
                (
                    or_(
                        Task.trang_thai == "FT hoàn thành",
                        Task.trang_thai.ilike("%FT hoàn thành%")
                    ),
                    1
                ),
                else_=0
            )
        ).label("ft_hoan_thanh"),
    ).filter(condition).first()

    matched_count = overall_agg.matched or 0 if overall_agg else 0
    closed_matched = overall_agg.closed or 0 if overall_agg else 0
    pending_count = overall_agg.pending or 0 if overall_agg else 0
    overdue_count = overall_agg.overdue or 0 if overall_agg else 0
    closed_today_count = overall_agg.closed_today or 0 if overall_agg else 0
    closed_yesterday_count = overall_agg.closed_yesterday or 0 if overall_agg else 0
    closed_7_days_count = overall_agg.closed_last_7_days or 0 if overall_agg else 0
    cho_cd_count = overall_agg.cho_cd_tiep_nhan or 0 if overall_agg else 0
    ft_ht_count = overall_agg.ft_hoan_thanh or 0 if overall_agg else 0

    # Quy tắc: Những WO không tìm thấy trong log để Đã giao FT -> tính vào Tồn việc (chưa đóng), note ghi chú (IS KL)
    unmatched_count = max(0, total_wos - matched_count)
    closed_count = closed_matched
    pending_count = (overall_agg.pending or 0 if overall_agg else 0) + unmatched_count
    completion_rate = round((closed_count / total_wos * 100), 1) if total_wos > 0 else 0.0

    summary_d_closed = {str(d): total_daily.get(d, 0) for d in range(1, 32)}
    summary_sum_c = sum(total_daily.get(d, 0) for d in range(1, max_day + 1))
    summary_nsld = round(summary_sum_c / max_day, 2) if max_day > 0 else 0.0

    summary = {
        "total": total_wos,
        "closed": closed_count,
        "pending": pending_count,
        "overdue": overdue_count,
        "closed_today": closed_today_count,
        "closed_yesterday": closed_yesterday_count,
        "closed_last_7_days": closed_7_days_count,
        "cho_cd_tiep_nhan": cho_cd_count,
        "ft_hoan_thanh": ft_ht_count,
        "completion_rate": completion_rate,
        "daily_closed": summary_d_closed,
        "closed_up_to_max_day": summary_sum_c,
        "nsld": summary_nsld,
        "max_day": max_day,
        "days_list": days_list,
    }

    # 2. Breakdown by Employee
    emp_res = db.query(
        Employee.id.label("id"),
        func.coalesce(Employee.name, "Khác").label("key_name"),
        func.count(Task.ma_cong_viec).label("total"),
        func.sum(case((Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("closed"),
        func.sum(case((~Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("pending"),
        func.sum(
            case(
                (
                    and_(
                        ~Task.trang_thai.in_(CLOSED_STATUSES),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_today"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= yesterday_start,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) < today_start
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_yesterday"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= seven_days_ago
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_last_7_days"),
        func.sum(
            case(
                (
                    or_(
                        Task.trang_thai == "Chờ CD tiếp nhận",
                        Task.trang_thai == "Chờ CĐ tiếp nhận",
                        Task.trang_thai.ilike("%tiếp nhận%")
                    ),
                    1
                ),
                else_=0
            )
        ).label("cho_cd_tiep_nhan"),
        func.sum(
            case(
                (
                    or_(
                        Task.trang_thai == "FT hoàn thành",
                        Task.trang_thai.ilike("%FT hoàn thành%")
                    ),
                    1
                ),
                else_=0
            )
        ).label("ft_hoan_thanh"),
        func.sum(case((Task.trang_thai == "Đã giao FT", 1), else_=0)).label("da_giao_ft"),
        func.sum(case((Task.trang_thai == "FT Đang thực hiện", 1), else_=0)).label("ft_dang_thuc_hien"),
        func.sum(
            case((Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]), 1), else_=0)
        ).label("tu_choi"),
        func.sum(
            case((Task.trang_thai == "FT từ chối", 1), else_=0)
        ).label("ft_tu_choi"),
        func.sum(
            case((Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]), 1), else_=0)
        ).label("cd_tu_choi"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue_tu_choi"),
    ).outerjoin(Employee, Task.assigned_to_id == Employee.id)\
     .filter(condition)\
     .group_by(Employee.id, Employee.name)\
     .all()

    by_employee = []
    other_emp = None
    for r in emp_res:
        tot = r.total or 0
        cl = r.closed or 0
        pe = r.pending or 0
        ov = r.overdue or 0
        ct = r.closed_today or 0
        cy = r.closed_yesterday or 0
        c7 = r.closed_last_7_days or 0
        c_cd = r.cho_cd_tiep_nhan or 0
        ft_ht = r.ft_hoan_thanh or 0
        t_choi = r.tu_choi or 0
        ft_tc = r.ft_tu_choi or 0
        cd_tc = r.cd_tu_choi or 0
        ov_tc = r.overdue_tu_choi or 0
        rate = round((cl / tot * 100), 1) if tot > 0 else 0.0
        is_other = (r.id is None or r.key_name == "Khác")
        ekey = r.id if (r.id is not None and not is_other) else "other"
        d_closed = {str(d): emp_daily[ekey].get(d, 0) for d in range(1, 32)}
        sum_c = sum(emp_daily[ekey].get(d, 0) for d in range(1, max_day + 1))
        emp_nsld = round(sum_c / max_day, 2) if max_day > 0 else 0.0
        item = {
            "id": r.id,
            "key_name": "Khác" if is_other else r.key_name,
            "group_name": "Khác" if is_other else emp_to_group.get(r.id, "Chưa phân cụm"),
            "is_other": is_other,
            "total": tot,
            "closed": cl,
            "pending": pe,
            "overdue": ov,
            "closed_today": ct,
            "closed_yesterday": cy,
            "closed_last_7_days": c7,
            "cho_cd_tiep_nhan": c_cd,
            "ft_hoan_thanh": ft_ht,
            "tu_choi": t_choi,
            "ft_tu_choi": ft_tc,
            "cd_tu_choi": cd_tc,
            "overdue_tu_choi": ov_tc,
            "completion_rate": rate,
            "daily_closed": d_closed,
            "closed_up_to_max_day": sum_c,
            "nsld": emp_nsld,
            "dong": cl,
            "da_giao_ft": r.da_giao_ft or 0,
            "ft_dang_thuc_hien": r.ft_dang_thuc_hien or 0,
            "other": max(0, tot - ((r.da_giao_ft or 0) + (r.ft_dang_thuc_hien or 0) + cl)),
        }
        if is_other:
            other_emp = item
        else:
            by_employee.append(item)

    # Nếu có WO không tìm thấy trong log, cộng dồn vào dòng 'Khác' với trạng thái 'Đã giao FT' (IS KL)
    if unmatched_count > 0:
        if other_emp:
            other_emp["total"] += unmatched_count
            other_emp["pending"] += unmatched_count
            other_emp["da_giao_ft"] = other_emp.get("da_giao_ft", 0) + unmatched_count
            other_emp["completion_rate"] = round((other_emp["closed"] / other_emp["total"] * 100), 1) if other_emp["total"] > 0 else 0.0
        else:
            other_emp = {
                "id": None,
                "key_name": "Khác",
                "group_name": "Khác",
                "is_other": True,
                "total": unmatched_count,
                "closed": 0,
                "pending": unmatched_count,
                "overdue": 0,
                "closed_today": 0,
                "closed_yesterday": 0,
                "closed_last_7_days": 0,
                "cho_cd_tiep_nhan": 0,
                "ft_hoan_thanh": 0,
                "tu_choi": 0,
                "ft_tu_choi": 0,
                "cd_tu_choi": 0,
                "overdue_tu_choi": 0,
                "completion_rate": 0.0,
                "daily_closed": {str(d): 0 for d in range(1, max_day + 1)},
                "closed_up_to_max_day": 0,
                "nsld": 0.0,
                "dong": 0,
                "da_giao_ft": unmatched_count,
                "ft_dang_thuc_hien": 0,
                "other": 0,
            }

    by_employee.sort(key=lambda x: (x["pending"], x["total"]), reverse=True)
    if other_emp:
        by_employee.append(other_emp)

    # 3. Breakdown by Group
    grp_res = db.query(
        Group.id.label("id"),
        func.coalesce(Group.name, "Khác").label("key_name"),
        func.count(Task.ma_cong_viec).label("total"),
        func.sum(case((Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("closed"),
        func.sum(case((~Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("pending"),
        func.sum(
            case(
                (
                    and_(
                        ~Task.trang_thai.in_(CLOSED_STATUSES),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_today"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= yesterday_start,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) < today_start
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_yesterday"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= seven_days_ago
                    ),
                    1
                ),
                else_=0
            )
        ).label("closed_last_7_days"),
        func.sum(
            case(
                (
                    or_(
                        Task.trang_thai == "Chờ CD tiếp nhận",
                        Task.trang_thai == "Chờ CĐ tiếp nhận",
                        Task.trang_thai.ilike("%tiếp nhận%")
                    ),
                    1
                ),
                else_=0
            )
        ).label("cho_cd_tiep_nhan"),
        func.sum(
            case(
                (
                    or_(
                        Task.trang_thai == "FT hoàn thành",
                        Task.trang_thai.ilike("%FT hoàn thành%")
                    ),
                    1
                ),
                else_=0
            )
        ).label("ft_hoan_thanh"),
        func.sum(case((Task.trang_thai == "Đã giao FT", 1), else_=0)).label("da_giao_ft"),
        func.sum(case((Task.trang_thai == "FT Đang thực hiện", 1), else_=0)).label("ft_dang_thuc_hien"),
        func.sum(
            case((Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]), 1), else_=0)
        ).label("tu_choi"),
        func.sum(
            case((Task.trang_thai == "FT từ chối", 1), else_=0)
        ).label("ft_tu_choi"),
        func.sum(
            case((Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]), 1), else_=0)
        ).label("cd_tu_choi"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue_tu_choi"),
    ).outerjoin(Group, Task.group_id == Group.id)\
     .filter(condition)\
     .group_by(Group.id, Group.name)\
     .all()

    by_group = []
    other_grp = None
    for r in grp_res:
        tot = r.total or 0
        cl = r.closed or 0
        pe = r.pending or 0
        ov = r.overdue or 0
        ct = r.closed_today or 0
        cy = r.closed_yesterday or 0
        c7 = r.closed_last_7_days or 0
        c_cd = r.cho_cd_tiep_nhan or 0
        ft_ht = r.ft_hoan_thanh or 0
        t_choi = r.tu_choi or 0
        ft_tc = r.ft_tu_choi or 0
        cd_tc = r.cd_tu_choi or 0
        ov_tc = r.overdue_tu_choi or 0
        rate = round((cl / tot * 100), 1) if tot > 0 else 0.0
        is_other = (r.id is None or r.key_name == "Khác")
        gkey = r.id if (r.id is not None and not is_other) else "other"
        d_closed = {str(d): grp_daily[gkey].get(d, 0) for d in range(1, 32)}
        sum_c = sum(grp_daily[gkey].get(d, 0) for d in range(1, max_day + 1))
        grp_nsld = round(sum_c / max_day, 2) if max_day > 0 else 0.0
        item = {
            "id": r.id,
            "key_name": "Khác" if is_other else r.key_name,
            "group_name": "Khác (Chưa phân cụm)" if is_other else r.key_name,
            "is_other": is_other,
            "total": tot,
            "closed": cl,
            "pending": pe,
            "overdue": ov,
            "closed_today": ct,
            "closed_yesterday": cy,
            "closed_last_7_days": c7,
            "cho_cd_tiep_nhan": c_cd,
            "ft_hoan_thanh": ft_ht,
            "tu_choi": t_choi,
            "ft_tu_choi": ft_tc,
            "cd_tu_choi": cd_tc,
            "overdue_tu_choi": ov_tc,
            "completion_rate": rate,
            "daily_closed": d_closed,
            "closed_up_to_max_day": sum_c,
            "nsld": grp_nsld,
            "dong": cl,
            "da_giao_ft": r.da_giao_ft or 0,
            "ft_dang_thuc_hien": r.ft_dang_thuc_hien or 0,
            "other": max(0, tot - ((r.da_giao_ft or 0) + (r.ft_dang_thuc_hien or 0) + cl)),
        }
        if is_other:
            other_grp = item
        else:
            by_group.append(item)

    # Nếu có WO không tìm thấy trong log, cộng dồn vào dòng 'Khác' của Cụm với trạng thái 'Đã giao FT' (IS KL)
    if unmatched_count > 0:
        if other_grp:
            other_grp["total"] += unmatched_count
            other_grp["pending"] += unmatched_count
            other_grp["da_giao_ft"] = other_grp.get("da_giao_ft", 0) + unmatched_count
            other_grp["completion_rate"] = round((other_grp["closed"] / other_grp["total"] * 100), 1) if other_grp["total"] > 0 else 0.0
        else:
            other_grp = {
                "id": None,
                "key_name": "Khác",
                "group_name": "Khác",
                "is_other": True,
                "total": unmatched_count,
                "closed": 0,
                "pending": unmatched_count,
                "overdue": 0,
                "closed_today": 0,
                "closed_yesterday": 0,
                "closed_last_7_days": 0,
                "cho_cd_tiep_nhan": 0,
                "ft_hoan_thanh": 0,
                "tu_choi": 0,
                "ft_tu_choi": 0,
                "cd_tu_choi": 0,
                "overdue_tu_choi": 0,
                "completion_rate": 0.0,
                "daily_closed": {str(d): 0 for d in range(1, max_day + 1)},
                "closed_up_to_max_day": 0,
                "nsld": 0.0,
                "dong": 0,
                "da_giao_ft": unmatched_count,
                "ft_dang_thuc_hien": 0,
                "other": 0,
            }

    by_group.sort(key=lambda x: (x["pending"], x["total"]), reverse=True)
    if other_grp:
        by_group.append(other_grp)

    return {
        "report_id": report.id,
        "name": report.name,
        "description": report.description,
        "active_month": active_month,
        "total_wos": total_wos,
        "matched_wos": matched_count,
        "unmatched_wos": unmatched_count,
        "summary": summary,
        "by_employee": by_employee,
        "by_group": by_group,
        "max_day": max_day,
        "days_list": days_list,
    }


def get_fixed_wo_tasks(
    db: Session,
    report_id: int,
    metric: str = "total",
    filter_type: Optional[str] = None,
    filter_id: Optional[int] = None,
    is_other: bool = False,
    search: Optional[str] = None,
    day: Optional[int] = None,
    max_day: Optional[int] = None,
    target_month: Optional[str] = None,
    page: int = 1,
    page_size: int = 10000,
    sort_by: str = "thoi_diem_yeu_cau_ket_thuc",
    sort_order: str = "desc"
) -> Dict[str, Any]:
    """
    Get detailed tasks for drilldown popup when user clicks a metric cell on Fixed WO Report.
    If a WO code is not found in the tasks table (unmatched), it is treated as 'Đã giao FT' with note '(IS KL)'.
    """
    from backend.schemas.task_schema import TaskListItem
    from backend.models.note import TaskNote
    from backend.models.history import TaskHistory
    from backend.services.settings_service import get_current_month_setting
    import math

    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    yesterday_start = today_start - timedelta(days=1)
    seven_days_ago = today_start - timedelta(days=7)

    # 1. Toàn bộ mã WO thuộc báo cáo cố định này
    all_report_wos = [
        row[0] for row in db.query(FixedWoItem.ma_cong_viec).filter(FixedWoItem.report_id == report_id).all()
    ]
    matched_wos_set = set(
        row[0] for row in db.query(Task.ma_cong_viec).filter(Task.ma_cong_viec.in_(all_report_wos)).all()
    ) if all_report_wos else set()
    unmatched_wos = [w for w in all_report_wos if w not in matched_wos_set]

    # 2. Xây dựng query cho các tasks có trong DB
    wo_subquery = db.query(FixedWoItem.ma_cong_viec).filter(FixedWoItem.report_id == report_id)
    query = db.query(Task).filter(Task.ma_cong_viec.in_(wo_subquery))

    # Metric filter
    if metric == "closed":
        query = query.filter(Task.trang_thai.in_(CLOSED_STATUSES))
    elif metric == "pending":
        query = query.filter(~Task.trang_thai.in_(CLOSED_STATUSES))
    elif metric == "da_giao_ft":
        query = query.filter(Task.trang_thai == "Đã giao FT")
    elif metric == "overdue":
        query = query.filter(
            ~Task.trang_thai.in_(CLOSED_STATUSES),
            or_(
                Task.thoi_gian_con_lai < 0,
                and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
            )
        )
    elif metric == "closed_today":
        query = query.filter(
            Task.trang_thai.in_(CLOSED_STATUSES),
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
        )
    elif metric == "closed_yesterday":
        query = query.filter(
            Task.trang_thai.in_(CLOSED_STATUSES),
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= yesterday_start,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) < today_start
        )
    elif metric == "closed_last_7_days":
        query = query.filter(
            Task.trang_thai.in_(CLOSED_STATUSES),
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= seven_days_ago
        )
    elif metric == "closed_day" and day is not None:
        active_m = target_month or get_current_month_setting(db)
        try:
            y_i, m_i = int(active_m.split("-")[0]), int(active_m.split("-")[1])
        except Exception:
            now_u = datetime.utcnow()
            y_i, m_i = now_u.year, now_u.month
        target_dt_start = datetime(y_i, m_i, day, 0, 0, 0)
        target_dt_end = target_dt_start + timedelta(days=1)
        query = query.filter(
            Task.trang_thai.in_(CLOSED_STATUSES),
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= target_dt_start,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) < target_dt_end,
        )
    elif metric == "closed_up_to_max" and max_day is not None:
        active_m = target_month or get_current_month_setting(db)
        try:
            y_i, m_i = int(active_m.split("-")[0]), int(active_m.split("-")[1])
        except Exception:
            now_u = datetime.utcnow()
            y_i, m_i = now_u.year, now_u.month
        target_dt_start = datetime(y_i, m_i, 1, 0, 0, 0)
        target_dt_end = datetime(y_i, m_i, max_day, 0, 0, 0) + timedelta(days=1)
        query = query.filter(
            Task.trang_thai.in_(CLOSED_STATUSES),
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= target_dt_start,
            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) < target_dt_end,
        )
    elif metric == "cho_cd_tiep_nhan":
        query = query.filter(
            or_(
                Task.trang_thai == "Chờ CD tiếp nhận",
                Task.trang_thai == "Chờ CĐ tiếp nhận",
                Task.trang_thai.ilike("%tiếp nhận%")
            )
        )
    elif metric == "ft_hoan_thanh":
        query = query.filter(
            or_(
                Task.trang_thai == "FT hoàn thành",
                Task.trang_thai.ilike("%FT hoàn thành%")
            )
        )
    elif metric == "tu_choi":
        query = query.filter(Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]))
    elif metric == "ft_tu_choi":
        query = query.filter(Task.trang_thai == "FT từ chối")
    elif metric == "cd_tu_choi":
        query = query.filter(Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]))
    elif metric == "overdue_tu_choi":
        query = query.filter(
            Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
            or_(
                Task.thoi_gian_con_lai < 0,
                and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
            )
        )

    # Filter by Employee or Group: nhận diện dòng "Khác" một cách triệt để
    is_other_filter = is_other or (filter_type in ("employee", "group") and (filter_id is None or filter_id == 0))
    if filter_type == "employee":
        if is_other_filter:
            query = query.filter(or_(Task.assigned_to_id == None, Task.assigned_to_id == 0))
        else:
            query = query.filter(Task.assigned_to_id == filter_id)
    elif filter_type == "group":
        if is_other_filter:
            query = query.filter(or_(Task.group_id == None, Task.group_id == 0))
        else:
            query = query.filter(Task.group_id == filter_id)

    # Keyword search
    if search:
        s = f"%{search.strip()}%"
        query = query.outerjoin(Employee, Task.assigned_to_id == Employee.id)\
                     .outerjoin(Group, Task.group_id == Group.id)\
                     .filter(
                         or_(
                             Task.ma_cong_viec.ilike(s),
                             Task.noi_dung_cong_viec.ilike(s),
                             Task.ghi_chu.ilike(s),
                             Task.station_id.ilike(s),
                             Employee.name.ilike(s),
                             Group.name.ilike(s),
                         )
                     )

    db_total_count = query.count()

    # 3. Tạo các tasks ảo cho unmatched WOs (Quy tắc: Không tìm thấy WO -> Đã giao FT -> Note ghi chú (IS KL))
    virtual_items: List[TaskListItem] = []
    include_unmatched = False
    if metric in ("total", "pending", "da_giao_ft"):
        if not filter_type or filter_type == "all":
            include_unmatched = True
        elif is_other_filter:
            include_unmatched = True

    if include_unmatched and unmatched_wos:
        candidate_unmatched = unmatched_wos
        if search:
            s_low = search.strip().lower()
            candidate_unmatched = [
                w for w in unmatched_wos
                if s_low in w.lower() or s_low in "(is kl)" or s_low in "is kl"
            ]
        for w in candidate_unmatched:
            virtual_items.append(TaskListItem(
                ma_cong_viec=w,
                ma_cong_viec_cha=None,
                loai_cong_viec="Báo Cáo Cố Định WO",
                noi_dung_cong_viec="(IS KL)",
                ghi_chu="(IS KL)",
                trang_thai="Đã giao FT",
                trang_thai_hoan_thanh="Đang thực hiện",
                thoi_diem_tao=None,
                thoi_diem_bat_dau_thuc_hien=None,
                thoi_diem_yeu_cau_ket_thuc=None,
                thoi_gian_con_lai=0.0,
                thoi_diem_ft_hoan_thanh=None,
                thoi_diem_cd_dong=None,
                thue_bao=None,
                loi=None,
                assigned_to_id=None,
                group_id=None,
                employee_assigned_name="Khác",
                employee_created_name=None,
                group_name="Khác",
                system_name=None,
                unit_name=None,
                station_code=None,
                note_count=1,
                history_count=0,
                latest_note="(IS KL)",
            ))

    total_count = db_total_count + len(virtual_items)

    # 4. Sorting & Pagination
    sort_column = getattr(Task, sort_by, None)
    if sort_column is not None:
        query = query.order_by(desc(sort_column) if sort_order == "desc" else asc(sort_column))
    else:
        query = query.order_by(desc(Task.thoi_diem_yeu_cau_ket_thuc))

    offset = (page - 1) * page_size
    tasks = query.offset(offset).limit(page_size).all()

    task_keys = [t.ma_cong_viec for t in tasks]
    note_counts = {}
    history_counts = {}
    latest_notes = {}
    if task_keys:
        nc = db.query(TaskNote.ma_cong_viec, func.count(TaskNote.id))\
            .filter(TaskNote.ma_cong_viec.in_(task_keys))\
            .group_by(TaskNote.ma_cong_viec).all()
        note_counts = {k: v for k, v in nc}

        hc = db.query(TaskHistory.ma_cong_viec, func.count(TaskHistory.id))\
            .filter(TaskHistory.ma_cong_viec.in_(task_keys))\
            .group_by(TaskHistory.ma_cong_viec).all()
        history_counts = {k: v for k, v in hc}

        all_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content)\
            .filter(TaskNote.ma_cong_viec.in_(task_keys))\
            .order_by(TaskNote.created_at.desc())\
            .all()
        for k, content in all_notes:
            if k not in latest_notes:
                latest_notes[k] = content

    items: List[TaskListItem] = []
    for t in tasks:
        item = TaskListItem(
            ma_cong_viec=t.ma_cong_viec,
            ma_cong_viec_cha=t.ma_cong_viec_cha,
            loai_cong_viec=t.loai_cong_viec,
            noi_dung_cong_viec=t.noi_dung_cong_viec,
            ghi_chu=t.ghi_chu,
            trang_thai=t.trang_thai,
            trang_thai_hoan_thanh=t.trang_thai_hoan_thanh,
            thoi_diem_tao=t.thoi_diem_tao,
            thoi_diem_bat_dau_thuc_hien=t.thoi_diem_bat_dau_thuc_hien,
            thoi_diem_yeu_cau_ket_thuc=t.thoi_diem_yeu_cau_ket_thuc,
            thoi_gian_con_lai=t.thoi_gian_con_lai,
            thoi_diem_ft_hoan_thanh=t.thoi_diem_ft_hoan_thanh,
            thoi_diem_cd_dong=t.thoi_diem_cd_dong,
            thue_bao=t.thue_bao,
            loi=t.loi,
            assigned_to_id=t.assigned_to_id,
            group_id=t.group_id,
            employee_assigned_name=t.employee_assigned.name if t.employee_assigned else None,
            employee_created_name=t.employee_created.name if t.employee_created else None,
            group_name=t.group.name if t.group else None,
            system_name=t.system.name if t.system else None,
            unit_name=t.unit.name if t.unit else None,
            station_code=t.station.code if t.station else None,
            note_count=note_counts.get(t.ma_cong_viec, 0),
            history_count=history_counts.get(t.ma_cong_viec, 0),
            latest_note=latest_notes.get(t.ma_cong_viec),
        )
        items.append(item)

    # Ghép virtual items vào trang nếu còn chỗ
    if len(items) < page_size and virtual_items:
        v_offset = max(0, offset - db_total_count)
        v_limit = page_size - len(items)
        items.extend(virtual_items[v_offset : v_offset + v_limit])

    total_pages = math.ceil(total_count / page_size) if page_size > 0 else 1

    return {
        "items": items,
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
