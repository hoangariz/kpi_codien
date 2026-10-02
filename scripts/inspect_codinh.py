import sys
import io
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.models.report_category import ReportCategory
from backend.models.task_codinh import TaskCodinh
from backend.models.task import Task
from backend.services.settings_service import get_current_month_setting, get_setting
from sqlalchemy import func

db = SessionLocal()
try:
    print("Current month setting:", get_current_month_setting(db))
    print("\nReport categories (all):")
    cats = db.query(ReportCategory).all()
    for c in cats:
        print(f"  ID: {c.id}, Domain: {c.domain}, Name: {repr(c.name)}, ExcludePrior: {c.exclude_closed_prior_months}")
    
    print("\nTaskCodinh count:", db.query(TaskCodinh).count())
    print("Task count:", db.query(Task).count())

    print("\nTaskCodinh - Months by thoi_diem_yeu_cau_ket_thuc:")
    for row in db.query(func.strftime('%Y-%m', TaskCodinh.thoi_diem_yeu_cau_ket_thuc), func.count()).group_by(func.strftime('%Y-%m', TaskCodinh.thoi_diem_yeu_cau_ket_thuc)).all():
        print(" ", row)

    print("\nTaskCodinh - Months by coalesce(bat_dau, tao):")
    for row in db.query(func.strftime('%Y-%m', func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao)), func.count()).group_by(func.strftime('%Y-%m', func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao))).all():
        print(" ", row)

    print("\nTask (Cơ điện) - Months by thoi_diem_yeu_cau_ket_thuc:")
    for row in db.query(func.strftime('%Y-%m', Task.thoi_diem_yeu_cau_ket_thuc), func.count()).group_by(func.strftime('%Y-%m', Task.thoi_diem_yeu_cau_ket_thuc)).all():
        print(" ", row)

finally:
    db.close()
