import os
import sys
import math
import json
import threading
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Request
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

from backend.database import get_db, SessionLocal
from backend.models import ImportLog
from backend.services.etl_service import run_import_job, clear_task_tables
from backend.schemas.import_schema import ImportLogResponse
from backend.config import UPLOAD_DIR

router = APIRouter(prefix="/api/imports", tags=["Imports"])

# 8MB chunk size as specified in requirements
UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024

_executor: Optional[ProcessPoolExecutor] = None
_executor_lock = threading.Lock()


def get_executor() -> ProcessPoolExecutor:
    """Lazy initialization of single-worker ProcessPoolExecutor with spawn context."""
    global _executor
    with _executor_lock:
        if _executor is None:
            ctx = multiprocessing.get_context("spawn")
            kwargs = {"max_workers": 1, "mp_context": ctx}
            if sys.version_info >= (3, 11):
                kwargs["max_tasks_per_child"] = 1
            _executor = ProcessPoolExecutor(**kwargs)
        return _executor


def submit_import_job(import_id: int, file_path: str, filter_spm: bool = True):
    """Submit import job to ProcessPoolExecutor with recovery and status update callback."""
    global _executor
    for attempt in range(2):
        try:
            executor = get_executor()
            future = executor.submit(run_import_job, import_id, file_path, filter_spm)

            def on_done(fut):
                try:
                    fut.result()
                except Exception as exc:
                    # Update ImportLog status to FAILED if process crashed or threw exception
                    try:
                        db = SessionLocal()
                        try:
                            log = db.query(ImportLog).filter(ImportLog.id == import_id).first()
                            if log and log.status in ("PENDING", "PROCESSING"):
                                log.status = "FAILED"
                                log.error_message = f"Lỗi tiến trình xử lý import: {str(exc)}"
                                db.commit()
                        finally:
                            db.close()
                    except Exception:
                        pass

            future.add_done_callback(on_done)
            return future
        except BrokenProcessPool:
            with _executor_lock:
                if _executor:
                    try:
                        _executor.shutdown(wait=False, cancel_futures=True)
                    except Exception:
                        pass
                _executor = None
            if attempt == 1:
                raise


def _sanitize_and_validate_filename(original_name: str) -> tuple[str, str, str]:
    """
    Sanitize filename against path traversal, validate extension, and generate safe stored filename.
    Returns: (clean_original_name, safe_stored_filename, ext)
    """
    clean_name = original_name.replace("\\", "/").split("/")[-1].strip()
    if len(clean_name) > 200:
        clean_name = clean_name[:200]

    ext = Path(clean_name).suffix.lower()
    if ext not in (".xlsx", ".xls", ".csv"):
        raise HTTPException(
            status_code=400,
            detail="Định dạng file không hỗ trợ. Vui lòng tải lên file .xlsx, .xls hoặc .csv"
        )

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_stored_name = f"{timestamp}_{uuid4().hex[:10]}{ext}"
    return clean_name, safe_stored_name, ext


def _read_progress_override(log: ImportLog, file_path: Path):
    """If progress file exists, read progress_percent and inserted_count without dirtying DB session."""
    prog_file = Path(f"{file_path}.progress")
    if prog_file.exists():
        try:
            with open(prog_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            pct = data.get("progress_percent")
            ins = data.get("inserted_count")
            if pct is not None:
                log.progress_percent = max(log.progress_percent or 0, int(pct))
            if ins is not None:
                log.inserted_count = max(log.inserted_count or 0, int(ins))
        except Exception:
            pass


@router.post("", response_model=ImportLogResponse)
async def upload_excel_file(
    file: UploadFile = File(...),
    filter_spm: Optional[int] = Form(0),
    db: Session = Depends(get_db)
):
    """
    Upload Excel file (.xlsx, .xls) or CSV via single request.
    Asynchronously parsed in background ProcessPoolExecutor.
    filter_spm: 0 = keep all rows, 1 = filter out SPM/SPM_VTNET rows
    """
    clean_name, safe_name, ext = _sanitize_and_validate_filename(file.filename or "upload.xlsx")
    file_path = UPLOAD_DIR / safe_name

    CHUNK_SIZE = 1024 * 1024  # 1MB
    with open(file_path, "wb") as buffer:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            await run_in_threadpool(buffer.write, chunk)

    file_size = os.path.getsize(file_path) if file_path.exists() else 0

    import_log = ImportLog(
        file_name=clean_name,
        stored_filename=safe_name,
        file_size_bytes=file_size,
        is_active=0,
        imported_at=datetime.utcnow(),
        status="PENDING",
        progress_percent=0,
        filter_spm=1 if filter_spm else 0,
        domain="main"
    )
    db.add(import_log)
    db.commit()
    db.refresh(import_log)

    submit_import_job(import_log.id, str(file_path), bool(filter_spm))
    return import_log


# ---- Chunked upload endpoints for bypassing Cloudflare limits ----

@router.post("/chunked/init")
async def init_chunked_upload(
    file_name: str = Form(...),
    file_size: int = Form(...),
    filter_spm: Optional[int] = Form(0),
    db: Session = Depends(get_db)
):
    """
    Initialize a chunked upload session with server-determined chunk size (8MB).
    Preallocates the file and creates an empty .parts tracker file.
    """
    if file_size <= 0:
        raise HTTPException(
            status_code=400,
            detail="Kích thước file không hợp lệ (phải lớn hơn 0 byte)"
        )

    clean_name, safe_name, ext = _sanitize_and_validate_filename(file_name)
    file_path = UPLOAD_DIR / safe_name
    parts_path = Path(f"{file_path}.parts")

    def preallocate():
        with open(file_path, "wb") as f:
            f.truncate(file_size)
        with open(parts_path, "w", encoding="utf-8") as f:
            pass

    await run_in_threadpool(preallocate)

    total_chunks = math.ceil(file_size / UPLOAD_CHUNK_SIZE)

    import_log = ImportLog(
        file_name=clean_name,
        stored_filename=safe_name,
        file_size_bytes=file_size,
        is_active=0,
        imported_at=datetime.utcnow(),
        status="UPLOADING",
        progress_percent=0,
        filter_spm=1 if filter_spm else 0,
        domain="main"
    )
    db.add(import_log)
    db.commit()
    db.refresh(import_log)

    return {
        "import_id": import_log.id,
        "stored_filename": safe_name,
        "chunk_size": UPLOAD_CHUNK_SIZE,
        "total_chunks": total_chunks,
        "status": "UPLOADING"
    }


@router.put("/chunked/{import_id}/{chunk_index}")
async def upload_chunk(
    import_id: int,
    chunk_index: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Upload a single raw binary chunk (application/octet-stream).
    Writes directly at byte offset using pwrite / r+b inside threadpool.
    """
    import_log = db.query(ImportLog).filter(
        ImportLog.id == import_id,
        or_(ImportLog.domain == "main", ImportLog.domain.is_(None))
    ).first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Upload session không tồn tại")

    if import_log.status != "UPLOADING":
        raise HTTPException(status_code=400, detail="Upload session đã kết thúc hoặc đang xử lý")

    file_size = import_log.file_size_bytes or 0
    total_chunks = math.ceil(file_size / UPLOAD_CHUNK_SIZE)
    if chunk_index < 0 or chunk_index >= total_chunks:
        raise HTTPException(
            status_code=400,
            detail=f"chunk_index {chunk_index} không hợp lệ (tổng số: {total_chunks})"
        )

    offset = chunk_index * UPLOAD_CHUNK_SIZE
    expected = min(UPLOAD_CHUNK_SIZE, file_size - offset)

    file_path = UPLOAD_DIR / import_log.stored_filename
    parts_path = Path(f"{file_path}.parts")

    # Release DB transaction before streaming raw bytes to prevent holding DB locks
    db.rollback()

    # Stream raw body in chunks
    data_blocks = []
    total_received = 0
    async for chunk in request.stream():
        data_blocks.append(chunk)
        total_received += len(chunk)
        if total_received > expected:
            raise HTTPException(
                status_code=400,
                detail=f"Dung lượng chunk {chunk_index} ({total_received} bytes) vượt quá mong đợi ({expected} bytes)"
            )

    if total_received != expected:
        raise HTTPException(
            status_code=400,
            detail=f"Dung lượng chunk {chunk_index} ({total_received} bytes) không khớp với mong đợi ({expected} bytes)"
        )

    def write_and_record():
        if hasattr(os, "pwrite"):
            fd = os.open(str(file_path), os.O_WRONLY)
            try:
                curr = offset
                for block in data_blocks:
                    written = 0
                    while written < len(block):
                        n = os.pwrite(fd, block[written:], curr + written)
                        if n == 0:
                            raise IOError("os.pwrite returned 0 bytes")
                        written += n
                    curr += len(block)
            finally:
                os.close(fd)
        else:
            with open(file_path, "r+b") as f:
                f.seek(offset)
                for block in data_blocks:
                    f.write(block)

        with open(parts_path, "a", encoding="utf-8") as pf:
            pf.write(f"{chunk_index}\n")

    await run_in_threadpool(write_and_record)

    # Update progress every 8 chunks or on the final chunk
    if (chunk_index + 1) % 8 == 0 or (chunk_index + 1) == total_chunks:
        try:
            log = db.query(ImportLog).filter(ImportLog.id == import_id).first()
            if log:
                uploaded_count = 0
                if parts_path.exists():
                    with open(parts_path, "r", encoding="utf-8") as pf:
                        uploaded_count = len(set(line.strip() for line in pf if line.strip()))
                pct = int((uploaded_count / max(1, total_chunks)) * 100)
                log.progress_percent = min(pct, 100)
                db.commit()
        except Exception:
            db.rollback()

    return {
        "status": "ok",
        "import_id": import_id,
        "chunk_index": chunk_index,
        "bytes_received": total_received
    }


@router.post("/chunked/{import_id}/finalize", response_model=ImportLogResponse)
async def finalize_chunked_upload(
    import_id: int,
    db: Session = Depends(get_db)
):
    """
    Finalize chunked upload session: verifies all chunks exist, checks file size, and submits ETL job.
    """
    import_log = db.query(ImportLog).filter(
        ImportLog.id == import_id,
        or_(ImportLog.domain == "main", ImportLog.domain.is_(None))
    ).first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Upload session không tồn tại")

    if import_log.status != "UPLOADING":
        raise HTTPException(status_code=400, detail="Upload session không ở trạng thái UPLOADING hoặc đã được hoàn tất")

    file_path = UPLOAD_DIR / import_log.stored_filename
    parts_path = Path(f"{file_path}.parts")

    if not file_path.exists():
        raise HTTPException(status_code=400, detail="File lưu trữ không tồn tại trên máy chủ")

    file_size = import_log.file_size_bytes or 0
    total_chunks = math.ceil(file_size / UPLOAD_CHUNK_SIZE)

    uploaded_indexes = set()
    if parts_path.exists():
        with open(parts_path, "r", encoding="utf-8") as pf:
            for line in pf:
                s = line.strip()
                if s.isdigit():
                    uploaded_indexes.add(int(s))

    missing_chunks = [i for i in range(total_chunks) if i not in uploaded_indexes]
    if missing_chunks:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Thiếu {len(missing_chunks)} phần tải lên của file",
                "missing_chunks": missing_chunks
            }
        )

    actual_size = os.path.getsize(file_path)
    if actual_size != file_size:
        raise HTTPException(
            status_code=400,
            detail=f"Kích thước file thực tế ({actual_size} bytes) không khớp với khai báo ({file_size} bytes)"
        )

    import_log.status = "PENDING"
    import_log.progress_percent = 0
    db.commit()
    db.refresh(import_log)

    # Clean up .parts file
    try:
        if parts_path.exists():
            parts_path.unlink()
    except Exception:
        pass

    submit_import_job(import_log.id, str(file_path), bool(import_log.filter_spm))
    return import_log


@router.get("", response_model=List[ImportLogResponse])
def list_import_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Get history list of past imports for main system (domain='main')."""
    logs = db.query(ImportLog).filter(
        or_(ImportLog.domain == "main", ImportLog.domain.is_(None))
    ).order_by(desc(ImportLog.imported_at)).limit(limit).all()

    for log in logs:
        if log.status == "PROCESSING" and log.stored_filename:
            db.expunge(log)
            _read_progress_override(log, UPLOAD_DIR / log.stored_filename)

    return logs


@router.get("/{import_id}", response_model=ImportLogResponse)
def get_import_status(import_id: int, db: Session = Depends(get_db)):
    """Check status and live progress of an import."""
    import_log = db.query(ImportLog).filter(
        ImportLog.id == import_id,
        or_(ImportLog.domain == "main", ImportLog.domain.is_(None))
    ).first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử import")

    if import_log.status == "PROCESSING" and import_log.stored_filename:
        db.expunge(import_log)
        _read_progress_override(import_log, UPLOAD_DIR / import_log.stored_filename)

    return import_log


@router.post("/{import_id}/activate")
def activate_import_file(
    import_id: int,
    db: Session = Depends(get_db)
):
    """
    Re-activate an older uploaded file: clears current Task DB and reloads from this file.
    """
    import_log = db.query(ImportLog).filter(
        ImportLog.id == import_id,
        or_(ImportLog.domain == "main", ImportLog.domain.is_(None))
    ).first()
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

    submit_import_job(import_log.id, str(file_path), bool(import_log.filter_spm))
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
    import_log = db.query(ImportLog).filter(
        ImportLog.id == import_id,
        or_(ImportLog.domain == "main", ImportLog.domain.is_(None))
    ).first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Không tìm thấy file cần xoá")

    file_name = import_log.file_name
    is_active = import_log.is_active

    # 1. Delete physical file from disk if exists, along with .parts and .progress files
    if import_log.stored_filename:
        file_path = UPLOAD_DIR / import_log.stored_filename
        parts_path = Path(f"{file_path}.parts")
        prog_path = Path(f"{file_path}.progress")
        prog_tmp = Path(f"{file_path}.progress.tmp")
        for p in (file_path, parts_path, prog_path, prog_tmp):
            if p.exists() and p.is_file():
                try:
                    p.unlink()
                except Exception as e:
                    print(f"Warning deleting file {p}: {e}")

    # 2. If the active file was deleted, clean DB tasks as well
    if is_active == 1:
        clear_task_tables(db)

    # 3. Delete record from ImportLog
    db.delete(import_log)
    db.commit()

    return {
        "status": "ok",
        "message": f"Đã xoá vĩnh viễn file {file_name} và giải phóng bộ nhớ thành công",
        "deleted_id": import_id
    }
