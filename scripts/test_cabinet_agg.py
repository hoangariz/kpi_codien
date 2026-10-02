import sys
from collections import defaultdict
from sqlalchemy import func
from backend.database import SessionLocal
from backend.services.codinh_service import get_codinh_stats, CLOSED_STATUSES
from backend.models.report_category import ReportCategory
from backend.models.cabinet import Cabinet
from backend.models.task_codinh import TaskCodinh

db = SessionLocal()
try:
    for cat_id in [13]:
        cat = db.query(ReportCategory).filter(ReportCategory.id == cat_id).first()
        # Run baseline
        old_res = get_codinh_stats(db, category_id=cat_id, target_month=None)
        
        # Test new logic
        # 1. Fetch raw items same as current
        # Check if cab query grouped by produces exact same cab numbers
        # Let's compare summary and emp_map
        print("Old summary:", old_res["summary"])
finally:
    db.close()
