import sys
from backend.database import SessionLocal, is_sqlite
from backend.models.task_codinh import TaskCodinh
from backend.models.report_category import ReportCategory
from backend.services.codinh_service import _parse_filter_values, CLOSED_STATUSES
from backend.services.settings_service import get_current_month_setting
from sqlalchemy import func, or_, distinct, desc
from datetime import datetime

def _apply_task_filters(q, model, mode, values, target_month, cat, db):
    if values:
        if mode == "by_system":
            q = q.filter(func.upper(model.he_thong).in_([v.upper().strip() for v in values]))
        else:
            q = q.filter(model.loai_cong_viec.in_(values))

    is_all = target_month and target_month.strip().lower() == "all"
    if is_all:
        return q

    effective_date = func.coalesce(model.thoi_diem_bat_dau_thuc_hien, model.thoi_diem_tao)
    if target_month and target_month.strip():
        try:
            tm_y, tm_m = target_month.strip().split("-")
            tm_year, tm_month = int(tm_y), int(tm_m)
            m_start = datetime(tm_year, tm_month, 1, 0, 0, 0)
            if tm_month == 12:
                m_end = datetime(tm_year + 1, 1, 1, 0, 0, 0)
            else:
                m_end = datetime(tm_year, tm_month + 1, 1, 0, 0, 0)
            q = q.filter(
                effective_date >= m_start,
                effective_date < m_end
            )
        except Exception:
            pass
    elif cat and cat.exclude_closed_prior_months:
        active_month = get_current_month_setting(db)
        try:
            y, m = active_month.split("-")
            m_start = datetime(int(y), int(m), 1, 0, 0, 0)
            q = q.filter(
                or_(
                    ~model.trang_thai.in_(CLOSED_STATUSES),
                    func.coalesce(model.thoi_diem_ft_hoan_thanh, model.thoi_diem_cd_dong) >= m_start,
                    effective_date >= m_start
                )
            )
        except Exception:
            pass
    return q

db = SessionLocal()
try:
    for cat_id in [13, 14]:
        cat = db.query(ReportCategory).filter(ReportCategory.id == cat_id).first()
        values = _parse_filter_values(cat.filter_values)
        mode = cat.filter_mode or "by_loai"
        
        for m in [None, "2026-08", "2026-09", "all"]:
            q = db.query(func.count(TaskCodinh.ma_cong_viec))
            q = _apply_task_filters(q, TaskCodinh, mode, values, m, cat, db)
            print(f"Cat {cat_id}, month {m}: count = {q.scalar()}")
finally:
    db.close()
