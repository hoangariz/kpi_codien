import sys
from backend.database import SessionLocal
from backend.models.task_codinh import TaskCodinh
from backend.models.report_category import ReportCategory
from backend.services.codinh_service import _parse_filter_values, CLOSED_STATUSES
from backend.services.settings_service import get_current_month_setting
from sqlalchemy import func, or_
from datetime import datetime

db = SessionLocal()
try:
    cat = db.query(ReportCategory).filter(ReportCategory.id == 14).first()
    values = _parse_filter_values(cat.filter_values)
    q = db.query(func.count(TaskCodinh.ma_cong_viec)).filter(TaskCodinh.loai_cong_viec.in_(values))
    print("Cat 14 total before month filter:", q.scalar())
    
    effective_date = func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao)
    active_month = get_current_month_setting(db)
    y, m = active_month.split("-")
    m_start = datetime(int(y), int(m), 1, 0, 0, 0)
    q_filtered = q.filter(
        or_(
            ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
            func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= m_start,
            effective_date >= m_start
        )
    )
    print("Cat 14 with drilldown filter (m_start):", q_filtered.scalar())
finally:
    db.close()
