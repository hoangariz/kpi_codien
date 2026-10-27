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


def parse_tagged_wo_input(raw: Optional[Union[List[Union[str, Dict[str, Any]]], str]]) -> List[Dict[str, Optional[str]]]:
    """
    Parse and clean WO items with their optional tag/group from raw text, list of lines, or list of dicts.
    Supports formats:
    1. Tab separated (e.g. from Excel copy-paste):
       KSVHKT\tWO_WFM-FT_20260923_174715597
    2. Comma or semicolon separated:
       Cơ điện, WO_WFM-FT_20260908_173962053
    3. Space separated with multi-word tag:
       Cơ điện WO_WFM-FT_20260908_173962053
    4. Plain WO code (tag is None):
       WO_TT_20261001_175166721
    5. Dict format: {"tag": "KSVHKT", "ma_cong_viec": "WO_..."}
    Deduplicates by ma_cong_viec.
    """
    if not raw:
        return []

    lines = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                code = str(item.get("ma_cong_viec") or item.get("code") or item.get("wo_code") or "").strip()
                tag = str(item.get("tag") or item.get("group") or "").strip() or None
                if code:
                    lines.append({"code": code, "tag": tag})
            elif isinstance(item, str):
                for sub in item.splitlines():
                    if sub.strip():
                        lines.append(sub.strip())
            else:
                s = str(item).strip()
                if s:
                    lines.append(s)
    elif isinstance(raw, str):
        for sub in raw.splitlines():
            if sub.strip():
                lines.append(sub.strip())

    seen = {}
    for entry in lines:
        if isinstance(entry, dict):
            code = entry["code"]
            tag = entry["tag"]
            if code and code not in seen:
                seen[code] = tag
            continue

        line_str = str(entry).strip()
        if not line_str:
            continue

        tag = None
        code = None

        if "\t" in line_str:
            parts = [p.strip() for p in line_str.split("\t") if p.strip()]
            if len(parts) >= 2:
                tag = " - ".join(parts[:-1]) if len(parts) > 2 else parts[0]
                code = parts[-1]
            elif len(parts) == 1:
                code = parts[0]
        elif "," in line_str or ";" in line_str:
            parts = [p.strip() for p in re.split(r"[,;]+", line_str) if p.strip()]
            if len(parts) >= 2:
                tag = " - ".join(parts[:-1]) if len(parts) > 2 else parts[0]
                code = parts[-1]
            elif len(parts) == 1:
                code = parts[0]
        else:
            parts = line_str.split()
            if len(parts) >= 2:
                tag = " ".join(parts[:-1])
                code = parts[-1]
            elif len(parts) == 1:
                code = parts[0]

        if code:
            code = code.strip()
            if tag:
                tag = tag.strip() or None
            if code and code not in seen:
                seen[code] = tag

    return [{"ma_cong_viec": c, "tag": t} for c, t in seen.items()]


def parse_wo_codes_input(raw: Optional[Union[List[Union[str, Dict[str, Any]]], str]]) -> List[str]:
    """Parse, clean, and deduplicate WO codes from raw string or list."""
    tagged = parse_tagged_wo_input(raw)
    return [item["ma_cong_viec"] for item in tagged]


def get_or_create_all_wo_hth_report(db: Session) -> FixedWoReport:
    """Ensure the All-Wo-HTH report exists and return it."""
    report = db.query(FixedWoReport).filter(
        or_(FixedWoReport.name == "All-Wo-HTH", FixedWoReport.report_type == "all_wo_hth")
    ).first()
    if not report:
        report = FixedWoReport(
            name="All-Wo-HTH",
            description="Báo cáo cố định All-Wo-HTH hiển thị tại Tổng quan",
            dashboard_view="overview",
            sort_order=0,
            is_priority=True,
            is_all_wo=True,
            report_type="all_wo_hth",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(report)
        db.commit()
        db.refresh(report)
    return report


def create_fixed_wo_report(db: Session, data: FixedWoReportCreate) -> FixedWoReport:
    """Create a new Fixed WO Report with its imported WO codes and optional tags."""
    name = (data.name or "").strip()
    if not name:
        raise ValueError("Tên danh mục báo cáo không được để trống")

    rep_type = getattr(data, "report_type", None) or ("all_wo_hth" if name == "All-Wo-HTH" else "standard")
    d_view = (data.dashboard_view or ("overview" if rep_type == "all_wo_hth" else "nhatram")).strip()

    report = FixedWoReport(
        name=name,
        description=data.description.strip() if data.description else None,
        dashboard_view=d_view,
        sort_order=data.sort_order if data.sort_order is not None else 0,
        is_priority=bool(data.is_priority),
        is_all_wo=bool(data.is_all_wo),
        report_type=rep_type.strip(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    tagged_items = parse_tagged_wo_input(data.wo_codes)
    if tagged_items:
        batch_size = 5000
        items_to_insert = [
            {
                "report_id": report.id,
                "ma_cong_viec": item["ma_cong_viec"],
                "tag": item["tag"],
                "created_at": datetime.utcnow()
            }
            for item in tagged_items
        ]
        for i in range(0, len(items_to_insert), batch_size):
            db.bulk_insert_mappings(FixedWoItem, items_to_insert[i : i + batch_size])
            db.commit()

    return report


def update_fixed_wo_report(db: Session, report_id: int, data: FixedWoReportUpdate) -> FixedWoReport:
    """Update name, description, report_type, or WO codes list with tags of a Fixed WO Report."""
    report = db.query(FixedWoReport).filter(FixedWoReport.id == report_id).first()
    if not report:
        raise ValueError(f"Không tìm thấy báo cáo cố định có ID {report_id}")

    if data.name is not None:
        report.name = data.name.strip()
    if data.description is not None:
        report.description = data.description.strip() if data.description else None
    if data.dashboard_view is not None:
        report.dashboard_view = data.dashboard_view.strip()
    if data.sort_order is not None:
        report.sort_order = data.sort_order
    if data.is_priority is not None:
        report.is_priority = bool(data.is_priority)
    if data.is_all_wo is not None:
        report.is_all_wo = bool(data.is_all_wo)
    if getattr(data, "report_type", None) is not None:
        report.report_type = data.report_type.strip()

    # Replace all WO codes if explicitly provided
    if data.wo_codes is not None:
        db.query(FixedWoItem).filter(FixedWoItem.report_id == report_id).delete()
        db.commit()

        tagged_items = parse_tagged_wo_input(data.wo_codes)
        if tagged_items:
            batch_size = 5000
            items_to_insert = [
                {
                    "report_id": report.id,
                    "ma_cong_viec": item["ma_cong_viec"],
                    "tag": item["tag"],
                    "created_at": datetime.utcnow()
                }
                for item in tagged_items
            ]
            for i in range(0, len(items_to_insert), batch_size):
                db.bulk_insert_mappings(FixedWoItem, items_to_insert[i : i + batch_size])
                db.commit()

    # Append new WO codes if provided
    if data.wo_codes_to_add:
        items_to_add = parse_tagged_wo_input(data.wo_codes_to_add)
        if items_to_add:
            existing = set(
                row[0] for row in db.query(FixedWoItem.ma_cong_viec).filter(
                    FixedWoItem.report_id == report_id,
                    FixedWoItem.ma_cong_viec.in_([it["ma_cong_viec"] for it in items_to_add])
                ).all()
            )
            to_insert = [it for it in items_to_add if it["ma_cong_viec"] not in existing]
            if to_insert:
                batch_size = 5000
                items_to_insert = [
                    {
                        "report_id": report.id,
                        "ma_cong_viec": it["ma_cong_viec"],
                        "tag": it["tag"],
                        "created_at": datetime.utcnow()
                    }
                    for it in to_insert
                ]
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
    reports = db.query(FixedWoReport).order_by(
        FixedWoReport.is_priority.desc(),
        FixedWoReport.sort_order.asc(),
        FixedWoReport.id.asc()
    ).all()
    results = []

    now = datetime.utcnow() + timedelta(hours=7)

    for r in reports:
        total_wos = db.query(func.count(FixedWoItem.id)).filter(FixedWoItem.report_id == r.id).scalar() or 0
        is_all_wo = bool(getattr(r, "is_all_wo", False))

        if is_all_wo and total_wos == 0:
            # All-WO report without explicit list: encompass ALL tasks in DB
            total_wos = db.query(func.count(Task.ma_cong_viec)).scalar() or 0
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
            ).first()

            matched = agg.matched or 0 if agg else 0
            cl = agg.closed or 0 if agg else 0
            pe = agg.pending or 0 if agg else 0
            ov = agg.overdue or 0 if agg else 0
            unmatched = 0
            rate = round((cl / total_wos * 100), 1) if total_wos > 0 else 0.0
        else:
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
            "dashboard_view": getattr(r, "dashboard_view", "nhatram") or "nhatram",
            "sort_order": getattr(r, "sort_order", 0) or 0,
            "is_priority": bool(getattr(r, "is_priority", False)),
            "is_all_wo": is_all_wo,
            "report_type": getattr(r, "report_type", "standard") or "standard",
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
    target_month: Optional[str] = None,
    exclude_tu_choi: bool = False
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

    now = datetime.utcnow() + timedelta(hours=7)
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    yesterday_start = today_start - timedelta(days=1)
    seven_days_ago = today_start - timedelta(days=7)

    # All WO codes registered in this report
    total_wos = db.query(func.count(FixedWoItem.id)).filter(FixedWoItem.report_id == report_id).scalar() or 0
    is_all_wo = bool(getattr(report, "is_all_wo", False))

    if is_all_wo and total_wos == 0:
        total_wos = db.query(func.count(Task.ma_cong_viec)).scalar() or 0
        condition = (Task.id != None)
        if exclude_tu_choi:
            condition = and_(
                condition,
                ~Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                ~Task.trang_thai.ilike("%từ chối%")
            )
            total_wos = db.query(func.count(Task.ma_cong_viec)).filter(condition).scalar() or 0
    else:
        wo_subquery = db.query(FixedWoItem.ma_cong_viec).filter(FixedWoItem.report_id == report_id)
        # Condition: task is in this report's WOs
        condition = Task.ma_cong_viec.in_(wo_subquery)
        if exclude_tu_choi:
            rejected_wos_sub = db.query(Task.ma_cong_viec).filter(
                Task.ma_cong_viec.in_(wo_subquery),
                or_(
                    Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                    Task.trang_thai.ilike("%từ chối%")
                )
            )
            total_wos = db.query(func.count(FixedWoItem.id)).filter(
                FixedWoItem.report_id == report_id,
                ~FixedWoItem.ma_cong_viec.in_(rejected_wos_sub)
            ).scalar() or 0
            condition = and_(
                condition,
                ~Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                ~Task.trang_thai.ilike("%từ chối%")
            )

    wo_tag_map = {
        row[0]: (row[1] or "Chưa phân nhóm")
        for row in db.query(FixedWoItem.ma_cong_viec, FixedWoItem.tag).filter(FixedWoItem.report_id == report_id).all()
    }

    # Query closed tasks for daily breakdown
    closed_tasks_records = db.query(
        Task.ma_cong_viec,
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
    tag_daily = defaultdict(lambda: defaultdict(int))
    total_daily = defaultdict(int)

    for wcode, aid, gid, ctime in closed_tasks_records:
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
                tkey = wo_tag_map.get(wcode, "Chưa phân nhóm")
                emp_daily[ekey][d] += 1
                grp_daily[gkey][d] += 1
                tag_daily[tkey][d] += 1
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
        func.sum(case((Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]), 1), else_=0)).label("tu_choi"),
        func.sum(case((Task.trang_thai == "FT từ chối", 1), else_=0)).label("ft_tu_choi"),
        func.sum(case((Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]), 1), else_=0)).label("cd_tu_choi"),
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
    tu_choi_count = overall_agg.tu_choi or 0 if overall_agg else 0
    ft_tu_choi_count = overall_agg.ft_tu_choi or 0 if overall_agg else 0
    cd_tu_choi_count = overall_agg.cd_tu_choi or 0 if overall_agg else 0
    overdue_tu_choi_count = overall_agg.overdue_tu_choi or 0 if overall_agg else 0

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
        "tu_choi": tu_choi_count,
        "ft_tu_choi": ft_tu_choi_count,
        "cd_tu_choi": cd_tu_choi_count,
        "overdue_tu_choi": overdue_tu_choi_count,
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

    # 4. Breakdown by Tag (Nhóm WO: KSVHKT, Cơ điện, NOC...)
    tag_counts_query = db.query(
        func.coalesce(FixedWoItem.tag, "Chưa phân nhóm").label("tag_name"),
        func.count(FixedWoItem.id).label("total")
    ).filter(FixedWoItem.report_id == report_id)
    if exclude_tu_choi:
        tag_counts_query = tag_counts_query.filter(~FixedWoItem.ma_cong_viec.in_(rejected_wos_sub))
    tag_counts_map = dict(tag_counts_query.group_by(func.coalesce(FixedWoItem.tag, "Chưa phân nhóm")).all())

    tag_agg_res = db.query(
        func.coalesce(FixedWoItem.tag, "Chưa phân nhóm").label("tag_name"),
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
        func.sum(case((Task.trang_thai == "Đã giao FT", 1), else_=0)).label("da_giao_ft"),
        func.sum(case((Task.trang_thai == "FT Đang thực hiện", 1), else_=0)).label("ft_dang_thuc_hien"),
        func.sum(case((Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]), 1), else_=0)).label("tu_choi"),
        func.sum(case((Task.trang_thai == "FT từ chối", 1), else_=0)).label("ft_tu_choi"),
        func.sum(case((Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]), 1), else_=0)).label("cd_tu_choi"),
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
    ).join(FixedWoItem, and_(FixedWoItem.report_id == report_id, FixedWoItem.ma_cong_viec == Task.ma_cong_viec))\
     .filter(condition)\
     .group_by(func.coalesce(FixedWoItem.tag, "Chưa phân nhóm"))\
     .all()

    tag_agg_map = {row.tag_name: row for row in tag_agg_res}
    all_tags = sorted(list(set(list(tag_counts_map.keys()) + list(tag_agg_map.keys()))))

    by_tag = []
    other_tag_item = None
    for tname in all_tags:
        tot = tag_counts_map.get(tname, 0)
        agg = tag_agg_map.get(tname)
        matched = agg.matched if agg else 0
        cl = agg.closed if agg else 0
        unmatched_in_tag = max(0, tot - matched)
        pe = (agg.pending if agg else 0) + unmatched_in_tag
        ov = agg.overdue if agg else 0
        ct = agg.closed_today if agg else 0
        cy = agg.closed_yesterday if agg else 0
        c7 = agg.closed_last_7_days if agg else 0
        c_cd = agg.cho_cd_tiep_nhan if agg else 0
        ft_ht = agg.ft_hoan_thanh if agg else 0
        t_choi = agg.tu_choi if agg else 0
        ft_tc = agg.ft_tu_choi if agg else 0
        cd_tc = agg.cd_tu_choi if agg else 0
        ov_tc = agg.overdue_tu_choi if agg else 0
        rate = round((cl / tot * 100), 1) if tot > 0 else 0.0
        is_other = (tname in ("Chưa phân nhóm", "Khác", None))

        d_closed = {str(d): tag_daily[tname].get(d, 0) for d in range(1, 32)}
        sum_c = sum(tag_daily[tname].get(d, 0) for d in range(1, max_day + 1))
        tag_nsld = round(sum_c / max_day, 2) if max_day > 0 else 0.0

        item = {
            "id": None,
            "key_name": tname,
            "group_name": tname,
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
            "nsld": tag_nsld,
            "dong": cl,
            "da_giao_ft": ((agg.da_giao_ft if agg else 0) + unmatched_in_tag),
            "ft_dang_thuc_hien": agg.ft_dang_thuc_hien if agg else 0,
            "other": max(0, tot - (((agg.da_giao_ft if agg else 0) + unmatched_in_tag) + (agg.ft_dang_thuc_hien if agg else 0) + cl)),
        }
        if is_other:
            other_tag_item = item
        else:
            by_tag.append(item)

    by_tag.sort(key=lambda x: (x["total"], x["pending"]), reverse=True)
    if other_tag_item:
        by_tag.append(other_tag_item)

    return {
        "report_id": report.id,
        "name": report.name,
        "description": report.description,
        "active_month": active_month,
        "total_wos": total_wos,
        "matched_wos": matched_count,
        "unmatched_wos": unmatched_count,
        "summary": summary,
        "by_tag": by_tag,
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
    target_name: Optional[str] = None,
    is_other: bool = False,
    search: Optional[str] = None,
    day: Optional[int] = None,
    max_day: Optional[int] = None,
    target_month: Optional[str] = None,
    page: int = 1,
    page_size: int = 10000,
    sort_by: str = "thoi_diem_yeu_cau_ket_thuc",
    sort_order: str = "desc",
    exclude_tu_choi: bool = False
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

    now = datetime.utcnow() + timedelta(hours=7)
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    yesterday_start = today_start - timedelta(days=1)
    seven_days_ago = today_start - timedelta(days=7)

    report = db.query(FixedWoReport).filter(FixedWoReport.id == report_id).first()
    is_all_wo = bool(getattr(report, "is_all_wo", False)) if report else False
    has_items = bool(db.query(FixedWoItem.id).filter(FixedWoItem.report_id == report_id).first())

    # 1. Xây dựng query cho các tasks thuộc báo cáo cố định
    # Dùng INNER JOIN trực tiếp với FixedWoItem để tận dụng index idx_fixed_wo_report_wo
    if is_all_wo and not has_items:
        query = db.query(Task)
    else:
        query = db.query(Task).join(
            FixedWoItem,
            (Task.ma_cong_viec == FixedWoItem.ma_cong_viec) & (FixedWoItem.report_id == report_id)
        )

    if exclude_tu_choi:
        query = query.filter(
            ~Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
            ~Task.trang_thai.ilike("%từ chối%")
        )

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

    # Filter by Employee, Group, or Tag:
    # Nhận diện dòng TỔNG CỘNG / Toàn Bộ (không lọc theo employee/group/tag)
    is_target_all = (
        filter_type in (None, "", "all")
        or not target_name
        or target_name.startswith("Toàn Bộ")
        or target_name in ("all", "Toàn Mạng", "Tất Cả")
    )
    is_target_other = target_name in ("Khác", "Chưa phân nhóm", "Chưa phân cụm", "Chưa phân đội", "none")
    is_other_filter = is_other or is_target_other

    if not is_target_all:
        if filter_type == "employee":
            if filter_id is not None and filter_id != 0:
                query = query.filter(Task.assigned_to_id == filter_id)
            elif is_other_filter:
                query = query.filter(or_(Task.assigned_to_id == None, Task.assigned_to_id == 0))
        elif filter_type == "group":
            if filter_id is not None and filter_id != 0:
                query = query.filter(Task.group_id == filter_id)
            elif is_other_filter:
                query = query.filter(or_(Task.group_id == None, Task.group_id == 0))
        elif filter_type == "tag" and target_name:
            if is_other_filter:
                query = query.filter(
                    or_(FixedWoItem.tag == None, FixedWoItem.tag == '', FixedWoItem.tag == "Chưa phân nhóm")
                )
            else:
                query = query.filter(FixedWoItem.tag == target_name)

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

    # Đảm bảo mỗi Task chỉ xuất hiện 1 lần duy nhất kể cả khi FixedWoItem có mã trùng hoặc nhiều tag
    query = query.distinct()

    # Count tasks nhanh chóng trực tiếp trên PK ma_cong_viec (distinct loại bỏ hoàn toàn sai lệch đếm)
    db_total_count = query.with_entities(func.count(distinct(Task.ma_cong_viec))).order_by(None).scalar() or 0

    # 2. Xử lý unmatched WOs (chỉ tính khi người dùng xem metric liên quan đến tồn/tổng và filter cho phép)
    virtual_items: List[TaskListItem] = []
    include_unmatched = False
    if metric in ("total", "pending", "da_giao_ft") and has_items:
        if is_target_all or not filter_type or filter_type == "all":
            include_unmatched = True
        elif filter_type == "tag":
            include_unmatched = True
        elif is_other_filter:
            include_unmatched = True

    if include_unmatched:
        # Truy vấn trực tiếp các WO thuộc report nhưng chưa tồn tại trong bảng tasks (LEFT JOIN)
        unm_query = db.query(FixedWoItem.ma_cong_viec, FixedWoItem.tag)\
            .outerjoin(Task, FixedWoItem.ma_cong_viec == Task.ma_cong_viec)\
            .filter(FixedWoItem.report_id == report_id, Task.ma_cong_viec == None)

        if filter_type == "tag" and target_name:
            is_tag_other = is_other or target_name in ("Khác", "Chưa phân nhóm")
            if is_tag_other:
                unm_query = unm_query.filter(or_(FixedWoItem.tag == None, FixedWoItem.tag == '', FixedWoItem.tag == "Chưa phân nhóm"))
            else:
                unm_query = unm_query.filter(FixedWoItem.tag == target_name)

        unmatched_rows = unm_query.all()
        if search:
            s_low = search.strip().lower()
            unmatched_rows = [
                (w, tg) for w, tg in unmatched_rows
                if s_low in w.lower() or s_low in "(is kl)" or s_low in "is kl"
            ]

        for w, tg in unmatched_rows:
            tag_label = tg or (target_name if (filter_type == "tag" and target_name) else "Khác")
            virtual_items.append(TaskListItem(
                ma_cong_viec=w,
                ma_cong_viec_cha=None,
                loai_cong_viec="Báo Cáo Cố Định WO",
                noi_dung_cong_viec=f"(IS KL) [{tag_label}]" if filter_type == "tag" and target_name else "(IS KL)",
                ghi_chu=f"(IS KL) [{tag_label}]" if filter_type == "tag" and target_name else "(IS KL)",
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
                group_name=tag_label,
                system_name=None,
                unit_name=None,
                station_code=None,
                note_count=1,
                history_count=0,
                latest_note="(IS KL)",
            ))

    total_count = db_total_count + len(virtual_items)

    # 3. Sorting & Pagination
    sort_column = getattr(Task, sort_by, None)
    if sort_column is not None:
        query = query.order_by(desc(sort_column) if sort_order == "desc" else asc(sort_column))
    else:
        query = query.order_by(desc(Task.thoi_diem_yeu_cau_ket_thuc))

    offset = (page - 1) * page_size
    tasks = query.offset(offset).limit(page_size).all()

    # 4. Ghi chú (latest_notes & note_counts) gom thành 1 lượt truy vấn an toàn (chunking 400)
    task_keys = [t.ma_cong_viec for t in tasks]
    note_counts = {}
    history_counts = {}
    latest_notes = {}
    if task_keys:
        for i in range(0, len(task_keys), 400):
            chunk = task_keys[i:i + 400]
            notes_rows = db.query(TaskNote.ma_cong_viec, TaskNote.note_content)\
                .filter(TaskNote.ma_cong_viec.in_(chunk))\
                .order_by(TaskNote.created_at.desc())\
                .all()
            for k, content in notes_rows:
                note_counts[k] = note_counts.get(k, 0) + 1
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
            loi=None,
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


def get_all_wo_hth_kpi_ft(
    db: Session,
    target_quota: int = 125,
    min_wos: int = 40,
    exclude_tu_choi: bool = False
) -> Dict[str, Any]:
    """
    Calculate FT KPI scores (range 0.8 - 1.2) based on All-Wo-HTH report data.
    - If N >= 125:
      * A >= 125: Base 1.0, bonus asymptotically approaching 1.2 (overdue B not penalized)
      * A < 125: Score in [0.8 - 1.0] scaled by A / 125
    - If N < 125 (and N >= 40):
      * B == 0 (100% on-time): Score = 1.0
      * B > 0: Penalized down towards 0.8 based on on-time ratio
    - N < 40: Excluded from evaluation
    """
    report = get_or_create_all_wo_hth_report(db)
    stats = get_fixed_wo_stats(db, report.id, exclude_tu_choi=exclude_tu_choi)
    by_employee = stats.get("by_employee", [])

    eligible_items = []
    excluded_items = []

    for emp in by_employee:
        if emp.get("is_other") or emp.get("key_name") == "Khác":
            continue

        N = emp.get("total", 0)
        A = emp.get("closed", 0)
        B = emp.get("overdue", 0)

        if N < min_wos:
            excluded_items.append({
                **emp,
                "n_total": N,
                "a_closed": A,
                "b_overdue": B,
                "reason": f"Tổng WO ({N}) < ngưỡng xét duyệt {min_wos} WO"
            })
            continue

        # Branch 1: N >= target_quota (Được giao đủ hoặc nhiều việc)
        if N >= target_quota:
            branch = "DU_DINH_MUC"
            if A >= target_quota:
                V = A - target_quota
                # Tiệm cận tối đa 1.2: 1.0 + 0.2 * (V / (V + 50.0))
                bonus = 0.2 * (V / (V + 50.0)) if V > 0 else 0.0
                score = round(1.0 + bonus, 3)
                eval_text = f"Vượt định mức (+{V} WO đóng)" if V > 0 else "Đạt định mức chuẩn (125 WO)"
                tier = "XUAT_SAC" if score >= 1.10 else "DAT_CHUAN"
            else:
                score = round(0.8 + 0.2 * (A / float(target_quota)), 3)
                shortfall = target_quota - A
                eval_text = f"Chưa đủ định mức (-{shortfall} WO đóng)"
                tier = "KHA" if score >= 0.90 else "CAN_CO_GANG"
        else:
            # Branch 2: N < target_quota (Ít việc, nhưng N >= min_wos)
            branch = "IT_VIEC"
            if B == 0:
                score = 1.000
                eval_text = "Hoàn thành 100% trong hạn (0 quá hạn)"
                tier = "DAT_CHUAN"
            else:
                on_time_ratio = max(0.0, (N - B) / float(N)) if N > 0 else 0.0
                score = round(max(0.800, 0.8 + 0.2 * on_time_ratio), 3)
                eval_text = f"Trừ điểm do có {B} WO quá hạn"
                tier = "KHA" if score >= 0.90 else "CAN_CO_GANG"

        eligible_items.append({
            **emp,
            "n_total": N,
            "a_closed": A,
            "b_overdue": B,
            "kpi_score": score,
            "evaluation": eval_text,
            "tier": tier,
            "branch": branch
        })

    # Sort eligible_items descending by kpi_score, then total closed
    eligible_items.sort(key=lambda x: (x["kpi_score"], x["a_closed"], x["n_total"]), reverse=True)

    for idx, item in enumerate(eligible_items, 1):
        item["rank"] = idx

    scores = [it["kpi_score"] for it in eligible_items]
    avg_score = round(sum(scores) / len(scores), 3) if scores else 0.0
    qualified_count = sum(1 for s in scores if s >= 1.0)
    bonus_count = sum(1 for s in scores if s > 1.0)
    shortfall_count = sum(1 for s in scores if s < 1.0)

    summary = {
        "report_id": report.id,
        "active_month": stats.get("active_month"),
        "total_eligible": len(eligible_items),
        "total_excluded": len(excluded_items),
        "avg_kpi_score": avg_score,
        "qualified_count": qualified_count,
        "bonus_count": bonus_count,
        "shortfall_count": shortfall_count,
        "target_quota": target_quota,
        "min_wos": min_wos,
        "total_all_wos": stats.get("summary", {}).get("total", 0),
    }

    return {
        "summary": summary,
        "items": eligible_items,
        "excluded_items": excluded_items
    }

