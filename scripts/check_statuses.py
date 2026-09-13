import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.models import Task
from backend.services.stats_service import MAINTENANCE_TASK_TYPE
from sqlalchemy import func

db = SessionLocal()

print("=== 1. TẤT CẢ TRẠNG THÁI (trang_thai) CỦA BẢO DƯỠNG CƠ ĐIỆN ===")
res = db.query(Task.trang_thai, func.count(Task.ma_cong_viec))\
    .filter(Task.loai_cong_viec == MAINTENANCE_TASK_TYPE)\
    .group_by(Task.trang_thai).all()
for st, c in res:
    print(f"  trang_thai: '{st}' -> {c} tasks")

print("\n=== 2. TẤT CẢ TRẠNG THÁI (trang_thai) TOÀN BỘ DATABASE ===")
res2 = db.query(Task.trang_thai, func.count(Task.ma_cong_viec))\
    .group_by(Task.trang_thai).all()
for st, c in res2:
    print(f"  trang_thai: '{st}' -> {c} tasks")

print("\n=== 3. CÁC CỘT NGÀY HOÀN THÀNH ===")
sample = db.query(
    func.count(Task.thoi_diem_ft_hoan_thanh),
    func.count(Task.thoi_diem_cd_dong),
    func.count(Task.ma_cong_viec)
).filter(Task.loai_cong_viec == MAINTENANCE_TASK_TYPE).first()
print(f"Bảo dưỡng cơ điện: Co FT_HT={sample[0]}, Co CD_Dong={sample[1]}, Tong={sample[2]}")

db.close()
