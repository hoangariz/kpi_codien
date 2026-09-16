import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.stdout.reconfigure(encoding='utf-8')
from backend.database import SessionLocal
from backend.models.report_category import ReportSubCategory, ReportCategory

def main():
    db = SessionLocal()
    try:
        # Check subcategories for category 2
        subs_cat2 = db.query(ReportSubCategory).filter(ReportSubCategory.category_id == 2).all()
        print(f"Found {len(subs_cat2)} subcategories for category 2 before cleanup:")
        for s in subs_cat2:
            print(f" - ID: {s.id}, Name: {s.name}, Keyword: {s.keyword}")

        deleted = db.query(ReportSubCategory).filter(ReportSubCategory.category_id == 2).delete()
        db.commit()
        print(f"\nSuccessfully deleted {deleted} subcategories from category 2.")

        all_subs = db.query(ReportSubCategory).all()
        print(f"\nRemaining total subcategories in database ({len(all_subs)}):")
        for s in all_subs:
            print(f" - ID: {s.id}, CategoryID: {s.category_id}, Name: {s.name}, Keyword: {s.keyword}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
