import sys
import os
from datetime import datetime

# UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

import backend.main
from backend.database import SessionLocal, engine, Base
from backend.models import (
    ImportLog, Task, Employee, Group, TaskHistory, TaskNote
)
from backend.services.etl_service import process_excel_import
from backend.services.stats_service import (
    get_kpi_overview,
    get_stats_by_group,
    get_stats_by_employee,
    get_special_maintenance_stats,
    MAINTENANCE_TASK_TYPE
)
from backend.services.task_service import (
    add_task_note,
    get_task_detail,
    get_tasks_paginated
)

print("=" * 60)
print("1. RUNNING ETL IMPORT WITH demofile.xlsx")
print("=" * 60)

db = SessionLocal()
import_record = ImportLog(
    file_name="demofile.xlsx",
    imported_at=datetime.utcnow(),
    status="PENDING",
    progress_percent=0
)
db.add(import_record)
db.commit()
db.refresh(import_record)
import_id = import_record.id
print(f"Created ImportLog ID: {import_id}")
db.close()

# Run the ETL import
t_start = datetime.now()
process_excel_import(import_id, "demofile.xlsx")
t_end = datetime.now()
duration = (t_end - t_start).total_seconds()

db = SessionLocal()
final_log = db.query(ImportLog).filter(ImportLog.id == import_id).first()
print("\nETL Result:")
print(f" - Status: {final_log.status}")
print(f" - Duration: {duration:.2f} seconds")
print(f" - Total rows: {final_log.total_rows}")
print(f" - Filtered out SPM/SPM_VTNET: {final_log.filtered_out_count}")
print(f" - Inserted count: {final_log.inserted_count}")
print(f" - Updated count: {final_log.updated_count}")
print(f" - Unchanged count: {final_log.unchanged_count}")
if final_log.error_message:
    print(f" - Error: {final_log.error_message}")

print("\n" + "=" * 60)
print("2. DATABASE TOTALS AFTER IMPORT")
print("=" * 60)
print(f"Total tasks in DB: {db.query(Task).count()}")
print(f"Total employees in DB: {db.query(Employee).count()}")
print(f"Total groups in DB: {db.query(Group).count()}")

print("\n" + "=" * 60)
print("3. TESTING SPECIAL MAINTENANCE STATS:")
print(f"   '{MAINTENANCE_TASK_TYPE}'")
print("=" * 60)

special_stats = get_special_maintenance_stats(db, MAINTENANCE_TASK_TYPE)
print(f"Total matching records: {special_stats['total_records']}")

print("\n--- TOP NHÂN VIÊN THỰC HIỆN ---")
for idx, emp in enumerate(special_stats['by_employee'][:10]):
    print(f"[{idx+1}] {emp['key_name']}: Tổng={emp['total']} | Đã giao={emp['da_giao_ft']} | Đang thực hiện={emp['ft_dang_thuc_hien']} | Đóng={emp['dong']} | TLHT={emp['completion_rate']}%")

print("\n--- TOP NHÓM ĐIỀU PHỐI ---")
for idx, grp in enumerate(special_stats['by_group']):
    print(f"[{idx+1}] {grp['key_name']}: Tổng={grp['total']} | Đã giao={grp['da_giao_ft']} | Đang thực hiện={grp['ft_dang_thuc_hien']} | Đóng={grp['dong']} | TLHT={grp['completion_rate']}%")

print("\n" + "=" * 60)
print("4. TESTING TASK NOTE & PERSISTENCE TEST")
print("=" * 60)

# Pick one task from maintenance
sample_task = db.query(Task).filter(Task.loai_cong_viec == MAINTENANCE_TASK_TYPE).first()
if sample_task:
    sample_key = sample_task.ma_cong_viec
    print(f"Adding note for task: {sample_key}")
    note = add_task_note(db, sample_key, "Test ghi chú nghiệp vụ: Kiểm tra nhiệt độ điều hòa phòng máy", "KTV_Truong")
    print(f"Created note ID: {note.id} with content: '{note.note_content}'")

    # Fetch detail
    detail = get_task_detail(db, sample_key)
    print(f"Task detail notes count: {len(detail.notes)}")
    assert len(detail.notes) >= 1, "Note must be present!"

print("\n" + "=" * 60)
print("5. TESTING SECOND IMPORT (RE-IMPORT) & CHANGE TRACKING")
print("=" * 60)

# Simulate a change in one task to verify TaskHistory tracking
if sample_task:
    print(f"Simulating a status change on {sample_task.ma_cong_viec} to test history generation on next import...")
    # Modify DB value so next import detects the difference from Excel
    old_status = sample_task.trang_thai
    sample_task.trang_thai = "Trạng thái thử nghiệm cũ"
    db.commit()

# Create 2nd import log
import_record2 = ImportLog(
    file_name="demofile_reimport.xlsx",
    imported_at=datetime.utcnow(),
    status="PENDING",
    progress_percent=0
)
db.add(import_record2)
db.commit()
db.refresh(import_record2)
import_id2 = import_record2.id

process_excel_import(import_id2, "demofile.xlsx")

final_log2 = db.query(ImportLog).filter(ImportLog.id == import_id2).first()
print(f"2nd Import Result: Inserted={final_log2.inserted_count}, Updated={final_log2.updated_count}, Unchanged={final_log2.unchanged_count}")

history_count = db.query(TaskHistory).count()
print(f"TaskHistory entries in DB: {history_count}")
if sample_task:
    histories = db.query(TaskHistory).filter(TaskHistory.ma_cong_viec == sample_task.ma_cong_viec).all()
    print(f"History entries for {sample_task.ma_cong_viec}: {len(histories)}")
    for h in histories:
        print(f"  Field: {h.field_changed} | '{h.old_value}' -> '{h.new_value}'")

    # Check note still exists
    notes = db.query(TaskNote).filter(TaskNote.ma_cong_viec == sample_task.ma_cong_viec).all()
    print(f"Note entries for {sample_task.ma_cong_viec} after 2nd import: {len(notes)}")
    assert len(notes) >= 1, "Task note must NEVER be lost across imports!"
    print("SUCCESS: Note persisted perfectly!")

db.close()
print("\nAll ETL and Statistics verification tests completed successfully!")
