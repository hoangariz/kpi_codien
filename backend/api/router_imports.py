import os
import shutil
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.database import get_db
from backend.models import ImportLog
from backend.services.etl_service import process_excel_import
from backend.schemas.import_schema import ImportLogResponse
from backend.config import UPLOAD_DIR

router = APIRouter(prefix="/api/imports", tags=["Imports"])


@router.post("", response_model=ImportLogResponse)
async def upload_excel_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload Excel file (.xlsx, .xls) or CSV.
    Asynchronously parses in background with live progress tracking.
    """
    valid_exts = (".xlsx", ".xls", ".csv")
    if not any(file.filename.lower().endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400,
            detail="Định dạng file không hỗ trợ. Vui lòng tải lên file .xlsx, .xls hoặc .csv"
        )

    # Save file to disk
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

    # Create ImportLog entry
    import_log = ImportLog(
        file_name=file.filename,
        stored_filename=safe_filename,
        file_size_bytes=file_size,
        is_active=0,
        imported_at=datetime.utcnow(),
        status="PENDING",
        progress_percent=0
    )
    db.add(import_log)
    db.commit()
    db.refresh(import_log)

    # Launch background ETL processing task
    background_tasks.add_task(process_excel_import, import_log.id, str(file_path))

    return import_log


@router.get("", response_model=List[ImportLogResponse])
def list_import_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Get history list of past imports."""
    return db.query(ImportLog).order_by(desc(ImportLog.imported_at)).limit(limit).all()


@router.get("/{import_id}", response_model=ImportLogResponse)
def get_import_status(import_id: int, db: Session = Depends(get_db)):
    """Check status and live progress of an import."""
    import_log = db.query(ImportLog).filter(ImportLog.id == import_id).first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử import")
    return import_log


@router.post("/{import_id}/activate")
def activate_import_file(
    import_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Re-activate an older uploaded file: clears current Task DB and reloads from this file.
    """
    import_log = db.query(ImportLog).filter(ImportLog.id == import_id).first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Không tìm thấy file này")

    if not import_log.stored_filename:
        raise HTTPException(status_code=400, detail="Không tìm thấy đường dẫn lưu trữ của file này")

    file_path = UPLOAD_DIR / import_log.stored_filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File vật lý {import_log.stored_filename} không còn tồn tại trên máy chủ")

    import_log.status = "PROCESSING"
    import_log.progress_percent = 5
    db.commit()

    background_tasks.add_task(process_excel_import, import_log.id, str(file_path))
    return {
        "status": "processing",
        "message": f"Đang nạp lại dữ liệu từ file {import_log.file_name}...",
        "import_id": import_id
    }


@router.delete("/{import_id}")
def delete_import_file(import_id: int, db: Session = Depends(get_db)):
    """
    Delete an uploaded file from disk and remove its ImportLog record to free up storage.
    """
    from backend.models import Task, TaskHistory

    import_log = db.query(ImportLog).filter(ImportLog.id == import_id).first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Không tìm thấy file cần xoá")

    file_name = import_log.file_name
    is_active = import_log.is_active

    # 1. Delete physical file from disk if exists
    if import_log.stored_filename:
        file_path = UPLOAD_DIR / import_log.stored_filename
        if file_path.exists() and file_path.is_file():
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Warning deleting file from disk: {e}")

    # 2. If the active file was deleted, clean DB tasks as well
    if is_active == 1:
        db.query(TaskHistory).delete()
        db.query(Task).delete()

    # 3. Delete record from ImportLog
    db.delete(import_log)
    db.commit()

    return {
        "status": "ok",
        "message": f"Đã xoá vĩnh viễn file {file_name} và giải phóng bộ nhớ thành công",
        "deleted_id": import_id
    }
