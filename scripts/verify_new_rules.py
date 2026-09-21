import sys
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal, engine, Base
import backend.models
from backend.models import Task, SystemSetting
from backend.services.stats_service import get_special_maintenance_stats, MAINTENANCE_TASK_TYPE
from backend.services.settings_service import get_current_month_setting, set_setting

# Create tables (including system_settings)
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Set current month to 2026-09
set_setting(db, "current_month", "2026-09", "Tháng 09/2026")
current_month = get_current_month_setting(db)
print(f"Cấu hình tháng hiện tại: {current_month}")

# Run stats
stats = get_special_maintenance_stats(db, MAINTENANCE_TASK_TYPE)

print("\n" + "=" * 60)
print(f"KẾT QUẢ THỐNG KÊ BẢO DƯỠNG CƠ ĐIỆN THEO QUY TẮC MỚI ({stats['active_month']}):")
print("=" * 60)
print(f"Tổng bản ghi hợp lệ: {stats['total_valid_records']}")
print(f"Số bản ghi đã đóng của tháng trước bị loại bỏ: {stats['excluded_closed_prior_months']}")

s = stats['summary']
print("\nTỔNG HỢP TOÀN BỘ (SUMMARY ROW):")
print(f" - Tổng số: {s['total']}")
print(f" - Đã đóng: {s['closed']}")
print(f" - Tồn việc: {s['pending']}")
print(f" - Quá hạn: {s['overdue']}")
print(f" - Đóng hôm nay: {s['closed_today']}")
print(f" - Đóng tuần qua: {s['closed_last_7_days']}")
print(f" - Tỉ lệ đóng: {s['completion_rate']}%")

print("\n--- TOP NHÂN VIÊN (DẠNG EXCEL) ---")
print(f"{'STT':<4} | {'Nhân viên':<20} | {'Tổng':<6} | {'Đóng':<6} | {'Tồn':<6} | {'Quá hạn':<8} | {'Hôm nay':<8} | {'Tuần qua':<8} | {'Tỉ lệ':<6}")
print("-" * 85)
for idx, r in enumerate(stats['by_employee'][:10]):
    print(f"{idx+1:<4} | {r['key_name']:<20} | {r['total']:<6} | {r['closed']:<6} | {r['pending']:<6} | {r['overdue']:<8} | {r['closed_today']:<8} | {r['closed_last_7_days']:<8} | {r['completion_rate']}%")

print("\n--- CỤM / NHÓM ĐIỀU PHỐI (DẠNG EXCEL) ---")
print(f"{'STT':<4} | {'Nhóm / Cụm':<35} | {'Tổng':<6} | {'Đóng':<6} | {'Tồn':<6} | {'Quá hạn':<8} | {'Hôm nay':<8} | {'Tuần qua':<8} | {'Tỉ lệ':<6}")
print("-" * 100)
for idx, r in enumerate(stats['by_group']):
    print(f"{idx+1:<4} | {r['key_name']:<35} | {r['total']:<6} | {r['closed']:<6} | {r['pending']:<6} | {r['overdue']:<8} | {r['closed_today']:<8} | {r['closed_last_7_days']:<8} | {r['completion_rate']}%")

db.close()

