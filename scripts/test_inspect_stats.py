import sys
sys.stdout.reconfigure(encoding='utf-8')
from backend.database import SessionLocal
from backend.services.codinh_service import get_codinh_stats

db = SessionLocal()
try:
    for cat_id in [13, 14]:
        stats = get_codinh_stats(db, category_id=cat_id)
        print(f"Cat {cat_id}: Name={stats['active_category']['name']}, Months={stats['available_months']}")
        print(f"  Summary total_wos={stats['summary']['total_wos']}, closed={stats['summary']['closed_wos']}, total_cabs={stats['summary']['total_cabinets']}, comp_cabs={stats['summary']['completed_cabinets']}")
finally:
    db.close()
