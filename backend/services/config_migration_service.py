import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.models.settings import SystemSetting
from backend.models.report_category import ReportCategory, ReportSubCategory
from backend.models.fixed_wo_report import FixedWoReport, FixedWoItem
from backend.models.tracking import TrackingBoard, TrackingBoardTask
from backend.models.quick_link import QuickLink
from backend.models.codinh_org import CodinhCluster, CodinhTeam, CodinhEmployee


def export_system_config(db: Session) -> Dict[str, Any]:
    """
    Xuất toàn bộ cấu hình quản trị hệ thống thành dictionary JSON nhỏ gọn (~400KB),
    bao gồm: Cấu hình tháng, Báo cáo All-Wo-HTH (kèm toàn bộ mã WO), 32 danh mục và từ khóa con,
    các bảng WO cần theo dõi, link rút gọn và cơ cấu tổ chức CĐBR.
    KHÔNG chứa dữ liệu công việc (tasks) nặng hàng ngày.
    """
    # 1. System Settings
    settings = [
        {"key": s.key, "value": s.value, "description": s.description}
        for s in db.query(SystemSetting).all()
    ]

    # 2. Report Categories & Subcategories
    categories = []
    for c in db.query(ReportCategory).all():
        sub_list = [
            {
                "name": sc.name,
                "keyword": sc.keyword,
                "description": sc.description,
                "sort_order": sc.sort_order,
                "is_standalone_table": sc.is_standalone_table,
            }
            for sc in c.sub_categories
        ]
        categories.append({
            "name": c.name,
            "loai_cong_viec": c.loai_cong_viec,
            "description": c.description,
            "icon": c.icon,
            "sort_order": c.sort_order,
            "is_default": c.is_default,
            "exclude_closed_prior_months": c.exclude_closed_prior_months,
            "filter_mode": c.filter_mode,
            "filter_values": c.filter_values,
            "domain": c.domain,
            "dashboard_view": c.dashboard_view,
            "is_priority": c.is_priority,
            "is_all_wo": c.is_all_wo,
            "other_sub_category_name": c.other_sub_category_name,
            "sub_categories": sub_list,
        })

    # 3. Fixed WO Reports & Items (All-Wo-HTH và danh mục cố định)
    fixed_reports = []
    for r in db.query(FixedWoReport).all():
        items = [{"ma_cong_viec": item.ma_cong_viec, "tag": item.tag} for item in r.items]
        fixed_reports.append({
            "name": r.name,
            "description": r.description,
            "dashboard_view": r.dashboard_view,
            "sort_order": r.sort_order,
            "is_priority": r.is_priority,
            "is_all_wo": r.is_all_wo,
            "report_type": r.report_type,
            "items": items,
        })

    # 4. Tracking Boards & Tasks
    tracking_boards = []
    for b in db.query(TrackingBoard).all():
        tasks = [{"ma_cong_viec": t.ma_cong_viec, "note": t.note} for t in b.tasks]
        tracking_boards.append({
            "name": b.name,
            "description": b.description,
            "loai_cong_viec": b.loai_cong_viec,
            "tasks": tasks,
        })

    # 5. Quick Links
    quick_links = [
        {
            "title": q.title,
            "slug": q.slug,
            "url": q.url,
            "description": q.description,
            "icon": q.icon,
            "color": q.color,
            "sort_order": q.sort_order,
            "is_active": q.is_active,
        }
        for q in db.query(QuickLink).all()
    ]

    return {
        "version": "1.0",
        "app": "KPI Cơ Điện VCC",
        "exported_at": datetime.utcnow().isoformat(),
        "system_settings": settings,
        "report_categories": categories,
        "fixed_wo_reports": fixed_reports,
        "tracking_boards": tracking_boards,
        "quick_links": quick_links,
    }


def import_system_config(db: Session, config_data: Dict[str, Any], overwrite: bool = True) -> Dict[str, Any]:
    """
    Nạp và khôi phục toàn bộ cấu hình từ file JSON sao lưu.
    overwrite=True: làm sạch các danh mục/bảng cũ trước khi nạp lại để đảm bảo đồng nhất 100%.
    """
    imported_counts = {
        "settings": 0,
        "categories": 0,
        "sub_categories": 0,
        "fixed_reports": 0,
        "fixed_items": 0,
        "tracking_boards": 0,
        "tracking_tasks": 0,
        "quick_links": 0,
    }

    # 1. System Settings (Upsert by key)
    for s in config_data.get("system_settings", []):
        k = s.get("key")
        if not k:
            continue
        existing = db.query(SystemSetting).filter(SystemSetting.key == k).first()
        if existing:
            existing.value = str(s.get("value", ""))
            if s.get("description"):
                existing.description = s.get("description")
        else:
            db.add(SystemSetting(key=k, value=str(s.get("value", "")), description=s.get("description")))
        imported_counts["settings"] += 1

    # 2. Report Categories & Subcategories
    if overwrite:
        db.query(ReportSubCategory).delete()
        db.query(ReportCategory).delete()
        db.flush()

    for c_data in config_data.get("report_categories", []):
        c_copy = dict(c_data)
        sub_list = c_copy.pop("sub_categories", [])
        cat = ReportCategory(**c_copy)
        db.add(cat)
        db.flush()
        imported_counts["categories"] += 1
        for sc in sub_list:
            db.add(ReportSubCategory(category_id=cat.id, **sc))
            imported_counts["sub_categories"] += 1

    # 3. Fixed WO Reports & Items
    if overwrite:
        db.query(FixedWoItem).delete()
        db.query(FixedWoReport).delete()
        db.flush()

    for r_data in config_data.get("fixed_wo_reports", []):
        r_copy = dict(r_data)
        items = r_copy.pop("items", [])
        rep = FixedWoReport(**r_copy)
        db.add(rep)
        db.flush()
        imported_counts["fixed_reports"] += 1
        for item in items:
            db.add(FixedWoItem(report_id=rep.id, ma_cong_viec=item.get("ma_cong_viec"), tag=item.get("tag")))
            imported_counts["fixed_items"] += 1

    # 4. Tracking Boards & Tasks
    if overwrite:
        db.query(TrackingBoardTask).delete()
        db.query(TrackingBoard).delete()
        db.flush()

    for b_data in config_data.get("tracking_boards", []):
        b_copy = dict(b_data)
        tasks = b_copy.pop("tasks", [])
        board = TrackingBoard(**b_copy)
        db.add(board)
        db.flush()
        imported_counts["tracking_boards"] += 1
        for t in tasks:
            db.add(TrackingBoardTask(board_id=board.id, ma_cong_viec=t.get("ma_cong_viec"), note=t.get("note")))
            imported_counts["tracking_tasks"] += 1

    # 5. Quick Links (Upsert by slug or title)
    for q_data in config_data.get("quick_links", []):
        slug = q_data.get("slug")
        title = q_data.get("title")
        existing = None
        if slug:
            existing = db.query(QuickLink).filter(QuickLink.slug == slug).first()
        elif title:
            existing = db.query(QuickLink).filter(QuickLink.title == title).first()

        if existing:
            for k, v in q_data.items():
                setattr(existing, k, v)
        else:
            db.add(QuickLink(**q_data))
        imported_counts["quick_links"] += 1

    db.commit()
    return imported_counts
