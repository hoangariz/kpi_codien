import sys
sys.stdout.reconfigure(encoding='utf-8')
from backend.database import SessionLocal
from backend.models.task_codinh import TaskCodinh
from backend.services.codinh_service import CLOSED_STATUSES

db = SessionLocal()
rows = db.query(TaskCodinh).filter(TaskCodinh.loai_cong_viec == 'Chủ động xử lý port kém').all()
print('Total tasks:', len(rows))

pend_rows = [r for r in rows if r.trang_thai not in CLOSED_STATUSES]
print('Total pending (Tồn):', len(pend_rows))

p_home = 0
p_port = 0
p_other = 0

for r in pend_rows:
    nd = (r.noi_dung_cong_viec or '').lower()
    if 'home wifi' in nd or 'thu kém' in nd:
        p_home += 1
    elif 'port' in nd:
        p_port += 1
    else:
        p_other += 1
        print('Other pending task sample:', r.noi_dung_cong_viec)

print(f'Pending breakdown: Home={p_home}, Port={p_port}, Other={p_other}')
print(f'Home + Port = {p_home + p_port} vs Pending = {len(pend_rows)}')

db.close()
