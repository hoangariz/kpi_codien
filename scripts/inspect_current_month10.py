import sys
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.services.stats_service import get_special_maintenance_stats
from backend.services.codinh_service import get_codinh_stats, get_codinh_drilldown_tasks
from backend.services.settings_service import get_current_month_setting
from backend.models.report_category import ReportCategory
from backend.models.task_codinh import TaskCodinh
from backend.models.task import Task
from backend.config import CLOSED_STATUSES

db = SessionLocal()
try:
    active_m = get_current_month_setting(db)
    print(f"=== CURRENT ACTIVE MONTH SETTING: {active_m} ===")

    print("\n--- 1. TỔNG QUAN (stats_service) for active month ---")
    res_special = get_special_maintenance_stats(db)
    print("maintSpecial active_month:", res_special.get("active_month"))
    print("maintSpecial total_tasks:", res_special.get("total_tasks"))
    print("maintSpecial closed_tasks:", res_special.get("closed_tasks"))
    print("maintSpecial pending_tasks:", res_special.get("pending_tasks"))
    print("maintSpecial excluded_count (bị loại bỏ):", res_special.get("excluded_count"))

    print("\n--- 2. CODINH (codinh_service) for active month ---")
    # Category 13 (THC)
    res_13 = get_codinh_stats(db, category_id=13)
    sum_13 = res_13.get("summary", {})
    print("Cat 13 summary:", sum_13)

    # Category 14 (Port Kém)
    res_14 = get_codinh_stats(db, category_id=14)
    sum_14 = res_14.get("summary", {})
    print("Cat 14 summary:", sum_14)

    # Category with exclude_closed_prior_months = False (e.g. Cat 2)
    cat2 = db.query(ReportCategory).filter(ReportCategory.id == 2).first()
    print(f"\nCat 2 (name={cat2.name}, exclude_closed={cat2.exclude_closed_prior_months}):")
    res_2 = get_special_maintenance_stats(db, target_type=cat2.loai_cong_viec)
    print("Cat 2 total:", res_2.get("total_tasks"), "closed:", res_2.get("closed_tasks"), "pending:", res_2.get("pending_tasks"), "excluded:", res_2.get("excluded_count"))

finally:
    db.close()
