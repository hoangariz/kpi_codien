import sys
import os
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

import backend.main
from backend.database import SessionLocal
from backend.models import Task, ImportLog
from backend.services.etl_service import process_excel_import

def seed_if_empty():
    db = SessionLocal()
    task_count = db.query(Task).count()
    if task_count > 0:
        print(f"[SEED] Cơ sở dữ liệu đã có {task_count} công việc, bỏ qua bước khởi tạo mẫu.")
        db.close()
        return

    excel_file = "demofile.xlsx"
    if not os.path.exists(excel_file):
        print(f"[SEED] Không tìm thấy file {excel_file} để khởi tạo mẫu.")
        db.close()
        return

    from backend.config import UPLOAD_DIR
    import shutil
    upload_file_path = UPLOAD_DIR / "demofile.xlsx"
    if not upload_file_path.exists():
        shutil.copyfile(excel_file, upload_file_path)

    print(f"[SEED] Khởi tạo dữ liệu ban đầu từ {excel_file}...")
    import_log = ImportLog(
        file_name=excel_file,
        stored_filename="demofile.xlsx",
        file_size_bytes=os.path.getsize(excel_file),
        is_active=1,
        imported_at=datetime.utcnow(),
        status="PENDING",
        progress_percent=0
    )
    db.add(import_log)
    db.commit()
    db.refresh(import_log)
    import_id = import_log.id
    db.close()

    process_excel_import(import_id, str(upload_file_path))

    db = SessionLocal()
    final_log = db.query(ImportLog).filter(ImportLog.id == import_id).first()
    print(f"[SEED] Hoàn thành: Đã thêm {final_log.inserted_count} công việc (Đã lọc {final_log.filtered_out_count} dòng SPM/SPM_VTNET).")
    db.close()

if __name__ == "__main__":
    seed_if_empty()
