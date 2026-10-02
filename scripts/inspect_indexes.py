import sys
sys.stdout.reconfigure(encoding='utf-8')
from backend.database import SessionLocal, is_sqlite, engine
from sqlalchemy import text
from backend.main import auto_migrate_db

db = SessionLocal()
try:
    print("--- 1. CURRENT INDEXES BEFORE ---")
    if is_sqlite:
        c_idx = db.execute(text("PRAGMA index_list('codinh_tasks');")).fetchall()
        print("codinh_tasks count:", len(c_idx))
        cab_idx = db.execute(text("PRAGMA index_list('cabinets');")).fetchall()
        print("cabinets count:", len(cab_idx))

    queries = [
        ("WO query with filter by loai and month",
         "EXPLAIN QUERY PLAN SELECT ma_cong_viec, trang_thai, nhan_vien FROM codinh_tasks WHERE loai_cong_viec = 'ICMS_Bảo dưỡng THC' AND coalesce(thoi_diem_bat_dau_thuc_hien, thoi_diem_tao) >= '2026-08-01'"),
        ("Available months query",
         "EXPLAIN QUERY PLAN SELECT DISTINCT strftime('%Y-%m', coalesce(thoi_diem_bat_dau_thuc_hien, thoi_diem_tao)) FROM codinh_tasks WHERE loai_cong_viec = 'ICMS_Bảo dưỡng THC'"),
        ("Cabinets group by ma_wo",
         "EXPLAIN QUERY PLAN SELECT ma_wo, trang_thai_thc, count(id) FROM cabinets WHERE category_id = 13 GROUP BY ma_wo, trang_thai_thc"),
        ("Drilldown with employee and metric",
         "EXPLAIN QUERY PLAN SELECT ma_cong_viec FROM codinh_tasks WHERE loai_cong_viec = 'ICMS_Bảo dưỡng THC' AND trang_thai = 'Đóng' AND nhan_vien = 'd00199830'")
    ]

    print("\n--- 2. RUNNING auto_migrate_db() ---")
    auto_migrate_db()
    print("auto_migrate_db() completed.")

    print("\n--- 3. INDEXES AFTER MIGRATION ---")
    if is_sqlite:
        c_idx2 = db.execute(text("PRAGMA index_list('codinh_tasks');")).fetchall()
        print("codinh_tasks indexes:")
        for idx in c_idx2:
            print("  ", idx)
        cab_idx2 = db.execute(text("PRAGMA index_list('cabinets');")).fetchall()
        print("cabinets indexes:")
        for idx in cab_idx2:
            print("  ", idx)

    print("\n--- 4. EXPLAIN QUERY PLAN AFTER MIGRATION ---")
    for name, sql in queries:
        print(f"\n[{name}]")
        plan = db.execute(text(sql)).fetchall()
        for p in plan:
            print(" ", p)

finally:
    db.close()
