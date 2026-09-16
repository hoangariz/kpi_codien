import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.services.stats_service import get_special_maintenance_stats
from backend.models.report_category import ReportCategory

def test():
    db = SessionLocal()
    try:
        cats = db.query(ReportCategory).all()
        print("Report Categories in DB:")
        for c in cats:
            print(f"- ID: {c.id}, Name: {c.name}, loai_cong_viec: {c.loai_cong_viec}")

        # Test Category 1
        cat1 = cats[0]
        stats1 = get_special_maintenance_stats(db, target_type=cat1.loai_cong_viec)
        subs1 = stats1.get("sub_categories_stats", [])
        print(f"\nCategory 1 ({cat1.name}) subcategories count: {len(subs1)}")
        for s in subs1:
            print(f"  * {s['name']} ({s['keyword']}): total = {s['summary']['total']}")

        # Test Category 2 (Lắp đặt tủ nguồn DC)
        if len(cats) > 1:
            cat2 = cats[1]
            stats2 = get_special_maintenance_stats(db, target_type=cat2.loai_cong_viec)
            subs2 = stats2.get("sub_categories_stats", [])
            print(f"\nCategory 2 ({cat2.name}) subcategories count: {len(subs2)}")
            print(f"Category 2 total parent summary: {stats2['summary']}")
            for s in subs2:
                print(f"  * {s['name']} ({s['keyword']}): total = {s['summary']['total']}")

            assert len(subs2) == 0, f"Expected 0 subcategories for Category 2, but found {len(subs2)}"
            print("\n>> VERIFICATION PASSED: Category 2 has NO unwanted conditioner/generator subcategories!")
    finally:
        db.close()

if __name__ == "__main__":
    test()
