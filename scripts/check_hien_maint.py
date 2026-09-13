import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.models import Task, Employee
from backend.services.stats_service import MAINTENANCE_TASK_TYPE

db = SessionLocal()
emp = db.query(Employee).filter(Employee.name == "hiennv41").first()

tasks_all_types = db.query(Task).filter(Task.assigned_to_id == emp.id).count()
tasks_maintenance_all = db.query(Task).filter(
    Task.assigned_to_id == emp.id,
    Task.loai_cong_viec == MAINTENANCE_TASK_TYPE
).all()

print(f"Tổng task mọi loại của {emp.name}: {tasks_all_types}")
print(f"Tổng task loại '{MAINTENANCE_TASK_TYPE}' của {emp.name}: {len(tasks_maintenance_all)}")

for t in tasks_maintenance_all:
    print(f"  {t.ma_cong_viec} | TT: '{t.trang_thai}' | YC_KT: {t.thoi_diem_yeu_cau_ket_thuc} | FT_HT: {t.thoi_diem_ft_hoan_thanh} | CD_Dong: {t.thoi_diem_cd_dong}")

db.close()
