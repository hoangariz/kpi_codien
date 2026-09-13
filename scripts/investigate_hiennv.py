import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.models import Task, Employee, Group
from backend.services.stats_service import get_special_maintenance_stats, MAINTENANCE_TASK_TYPE, COMPLETED_STATUSES
from sqlalchemy import func, distinct

db = SessionLocal()

print("--- 1. TẤT CẢ TRẠNG THÁI (DISTINCT trang_thai) TRONG DATABASE ---")
all_statuses = db.query(Task.trang_thai, func.count(Task.ma_cong_viec))\
    .filter(Task.loai_cong_viec == MAINTENANCE_TASK_TYPE)\
    .group_by(Task.trang_thai).all()
for st, cnt in all_statuses:
    print(f"  - '{st}': {cnt} việc")

print("\n--- 2. TẤT CẢ TRẠNG THÁI HOÀN THÀNH (DISTINCT trang_thai_hoan_thanh) ---")
all_tt_ht = db.query(Task.trang_thai_hoan_thanh, func.count(Task.ma_cong_viec))\
    .filter(Task.loai_cong_viec == MAINTENANCE_TASK_TYPE)\
    .group_by(Task.trang_thai_hoan_thanh).all()
for st, cnt in all_tt_ht:
    print(f"  - '{st}': {cnt} việc")

print("\n--- 3. KIỂM TRA NHÂN VIÊN hiennv41 ---")
emp = db.query(Employee).filter(Employee.name.ilike("%hiennv41%")).first()
if not emp:
    print("Không tìm thấy employee hiennv41 trực tiếp, tìm LIKE:")
    emps = db.query(Employee).filter(Employee.name.ilike("%hien%")).all()
    for e in emps:
        print(f"  id={e.id}, name={e.name}")
else:
    print(f"Employee found: ID={emp.id}, Name={emp.name}")
    
    # All tasks of hiennv41
    all_tasks = db.query(Task).filter(Task.assigned_to_id == emp.id).all()
    print(f"Tổng số task trong DB của {emp.name}: {len(all_tasks)}")
    for t in all_tasks:
        print(f"  WO: {t.ma_cong_viec} | Loai: '{t.loai_cong_viec}' | TT: '{t.trang_thai}' | KetThuc: {t.thoi_diem_yeu_cau_ket_thuc} | FT_HT: {t.thoi_diem_ft_hoan_thanh} | CD_Dong: {t.thoi_diem_cd_dong}")

    # Stats for hiennv41 from get_special_maintenance_stats
    stats = get_special_maintenance_stats(db, MAINTENANCE_TASK_TYPE)
    for r in stats['by_employee']:
        if r['id'] == emp.id:
            print("\nSố liệu thống kê trong stats_service cho hiennv41:")
            print(r)

db.close()
