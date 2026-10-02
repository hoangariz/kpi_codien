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
from typing import Optional, List
from uuid import uuid4
import shutil
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request, status
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from backend.database import get_db, SessionLocal
from backend.config import UPLOAD_DIR
from backend.models.import_log import ImportLog
from backend.schemas.import_schema import ImportLogResponse
from backend.schemas.report_category_schema import (
    ReportCategoryResponse,
    ReportCategoryCreate,
    ReportCategoryUpdate,
)
from backend.services.report_category_service import (
    get_report_categories,
    create_report_category,
    update_report_category,
    delete_report_category,
)
from backend.services.codinh_service import (
    run_codinh_import_job,
    import_codinh_wos_from_excel,
    process_codinh_wos_import,
    import_cabinets_from_excel,
    get_codinh_stats,
    get_codinh_meta_options,
    seed_default_codinh_if_needed,
    get_codinh_drilldown_tasks,
    get_codinh_import_logs,
    activate_codinh_import,
    delete_codinh_import,
    clear_codinh_stats_cache,
)

router = APIRouter(prefix="/api/codinh", tags=["Cố Định Băng Rộng"])

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


def submit_codinh_import_job(import_id: int, file_path: str):
    """Submit CĐBR import job to ProcessPoolExecutor with recovery and status update callback."""
    global _executor
    for attempt in range(2):
        try:
            executor = get_executor()
            future = executor.submit(run_codinh_import_job, import_id, file_path)

            def on_done(fut):
                try:
                    fut.result()
                    clear_codinh_stats_cache()
                except Exception as exc:
                    try:
                        db = SessionLocal()
                        try:
                            log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
                            if log and log.status in ("PENDING", "PROCESSING"):
                                log.status = "FAILED"
                                log.error_message = f"Lỗi tiến trình xử lý import CĐBR: {str(exc)}"
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
    safe_stored = f"codinh_{timestamp}_{uuid4().hex[:10]}{ext}"
    return clean_name, safe_stored, ext


def _read_parts_file(parts_path: Path) -> set[int]:
    """Read recorded chunk indices from .parts file."""
    if not parts_path.exists():
        return set()
    try:
        content = parts_path.read_text(encoding="utf-8").strip()
        if not content:
            return set()
        return {int(line.strip()) for line in content.splitlines() if line.strip().isdigit()}
    except Exception:
        return set()


def _pwrite_block(file_path: Path, offset: int, data: bytes):
    """Write data to specific byte offset supporting both Linux (pwrite) and Windows (seek)."""
    if hasattr(os, "pwrite"):
        fd = os.open(str(file_path), os.O_WRONLY)
        try:
            total_written = 0
            while total_written < len(data):
                written = os.pwrite(fd, data[total_written:], offset + total_written)
                if written == 0:
                    break
                total_written += written
        finally:
            os.close(fd)
    else:
        with open(file_path, "r+b") as f:
            f.seek(offset)
            f.write(data)




@router.get("/categories", response_model=List[ReportCategoryResponse])
def list_codinh_categories(
    month: Optional[str] = Query(None),
    include_summary: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Lấy danh sách tất cả các bảng báo cáo thuộc phân hệ Cố Định Băng Rộng (domain='codinh')."""
    seed_default_codinh_if_needed(db)
    return get_report_categories(db, target_month=month, include_summary=include_summary, domain="codinh")


@router.post("/categories", response_model=ReportCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_codinh_category(payload: ReportCategoryCreate, db: Session = Depends(get_db)):
    """Tạo bảng báo cáo mới cho Cố Định Băng Rộng (theo đầu việc hoặc theo hệ thống)."""
    try:
        # Enforce domain = 'codinh'
        payload.domain = "codinh"
        cat = create_report_category(db, payload)
        clear_codinh_stats_cache()
        return cat
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/categories/{cat_id}", response_model=ReportCategoryResponse)
def edit_codinh_category(cat_id: int, payload: ReportCategoryUpdate, db: Session = Depends(get_db)):
    """Cập nhật thông tin bảng báo cáo Cố Định Băng Rộng."""
    try:
        payload.domain = "codinh"
        cat = update_report_category(db, cat_id, payload)
        if not cat:
            raise HTTPException(status_code=404, detail="Không tìm thấy bảng báo cáo")
        clear_codinh_stats_cache()
        return cat
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/categories/{cat_id}")
def remove_codinh_category(cat_id: int, db: Session = Depends(get_db)):
    """Xóa bảng báo cáo Cố Định Băng Rộng."""
    try:
        ok = delete_report_category(db, cat_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Không tìm thấy hoặc không thể xóa")
        clear_codinh_stats_cache()
        return {"status": "success", "message": "Đã xóa bảng báo cáo thành công"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wos/chunked/init")
async def init_codinh_chunked_upload(
    file_name: str = Form(...),
    file_size: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Khởi tạo phiên chunked upload cho file WO CĐBR (bỏ qua giới hạn Cloudflare / timeout).
    """
    if file_size <= 0:
        raise HTTPException(status_code=400, detail="Kích thước file không hợp lệ (file_size phải > 0)")

    clean_name, safe_filename, ext = _sanitize_and_validate_filename(file_name)
    file_path = UPLOAD_DIR / safe_filename
    parts_path = UPLOAD_DIR / f"{safe_filename}.parts"

    import_log = ImportLog(
        file_name=clean_name,
        stored_filename=safe_filename,
        file_size_bytes=file_size,
        is_active=0,
        imported_at=datetime.utcnow(),
        status="UPLOADING",
        progress_percent=0,
        domain="codinh"
    )
    db.add(import_log)
    db.commit()
    db.refresh(import_log)

    def _preallocate():
        with open(file_path, "wb") as f:
            f.truncate(file_size)
        parts_path.write_text("", encoding="utf-8")

    await run_in_threadpool(_preallocate)

    total_chunks = math.ceil(file_size / UPLOAD_CHUNK_SIZE)
    return {
        "import_id": import_log.id,
        "stored_filename": safe_filename,
        "status": "UPLOADING",
        "chunk_size": UPLOAD_CHUNK_SIZE,
        "total_chunks": total_chunks,
    }


@router.put("/wos/chunked/{import_id}/{chunk_index}")
async def upload_codinh_chunk(
    import_id: int,
    chunk_index: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Tải lên từng chunk binary cho file CĐBR (raw octet-stream). Ghi vào đúng byte offset.
    """
    import_log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Upload session CĐBR không tồn tại")

    if import_log.status != "UPLOADING":
        raise HTTPException(status_code=400, detail="Upload session CĐBR đã kết thúc hoặc không ở trạng thái UPLOADING")

    file_size = import_log.file_size_bytes or 0
    offset = chunk_index * UPLOAD_CHUNK_SIZE
    if offset >= file_size or offset < 0:
        raise HTTPException(status_code=400, detail=f"Chỉ số chunk {chunk_index} vượt quá giới hạn file")

    expected_bytes = min(UPLOAD_CHUNK_SIZE, file_size - offset)
    file_path = UPLOAD_DIR / import_log.stored_filename
    parts_path = UPLOAD_DIR / f"{import_log.stored_filename}.parts"

    # Nhả lock DB trước khi nhận stream mạng
    db.rollback()

    chunks_data = bytearray()
    async for chunk in request.stream():
        chunks_data.extend(chunk)

    if len(chunks_data) != expected_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Kích thước chunk {chunk_index} không khớp: nhận {len(chunks_data)} bytes, mong đợi {expected_bytes} bytes"
        )

    # Ghi khối byte dùng pwrite / seek qua threadpool
    await run_in_threadpool(_pwrite_block, file_path, offset, bytes(chunks_data))

    # Ghi nhận chunk vào .parts
    def _record_part():
        with open(parts_path, "a", encoding="utf-8") as f:
            f.write(f"{chunk_index}\n")

    await run_in_threadpool(_record_part)

    # Cập nhật tiến độ DB mỗi 8 chunks hoặc ở chunk cuối
    total_chunks = math.ceil(file_size / UPLOAD_CHUNK_SIZE)
    if chunk_index % 8 == 0 or chunk_index == total_chunks - 1:
        try:
            db_log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
            if db_log and db_log.status == "UPLOADING":
                pct = int(((chunk_index + 1) / max(1, total_chunks)) * 100)
                db_log.progress_percent = min(pct, 99)
                db.commit()
        except Exception:
            db.rollback()

    return {"import_id": import_id, "chunk_index": chunk_index, "status": "ok"}


@router.post("/wos/chunked/{import_id}/finalize", response_model=ImportLogResponse)
async def finalize_codinh_chunked_upload(
    import_id: int,
    db: Session = Depends(get_db)
):
    """
    Hoàn tất tải các chunk: kiểm tra tính toàn vẹn, chuyển trạng thái sang PENDING và nạp ngầm qua ProcessPoolExecutor.
    """
    import_log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Upload session CĐBR không tồn tại")

    if import_log.status != "UPLOADING":
        raise HTTPException(status_code=400, detail="Upload session CĐBR không ở trạng thái UPLOADING hoặc đã finalize")

    file_path = UPLOAD_DIR / import_log.stored_filename
    parts_path = UPLOAD_DIR / f"{import_log.stored_filename}.parts"

    if not file_path.exists():
        raise HTTPException(status_code=400, detail="File vật lý không tồn tại trên máy chủ")

    file_size = import_log.file_size_bytes or 0
    total_chunks = math.ceil(file_size / UPLOAD_CHUNK_SIZE)

    parts_uploaded = await run_in_threadpool(_read_parts_file, parts_path)
    missing = [i for i in range(total_chunks) if i not in parts_uploaded]

    if missing:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Thiếu {len(missing)} phần tải lên",
                "missing_chunks": missing
            }
        )

    actual_size = file_path.stat().st_size
    if actual_size != file_size:
        raise HTTPException(
            status_code=400,
            detail=f"Kích thước file thực tế ({actual_size} bytes) không khớp với khai báo ({file_size} bytes)"
        )

    # Clean up parts file
    if parts_path.exists():
        try:
            parts_path.unlink()
        except Exception:
            pass

    import_log.status = "PENDING"
    import_log.progress_percent = 0
    db.commit()
    db.refresh(import_log)

    submit_codinh_import_job(import_log.id, str(file_path))
    return import_log


@router.post("/wos/upload", response_model=ImportLogResponse)
async def upload_codinh_wos_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Tải lên file gốc công việc (WO) riêng biệt cho Cố Định Băng Rộng (CĐBR).
    Chạy ETL ngầm qua ProcessPoolExecutor với theo dõi tiến độ.
    """
    clean_name, safe_name, ext = _sanitize_and_validate_filename(file.filename or "upload.xlsx")
    temp_path = UPLOAD_DIR / safe_name

    block_size = 1024 * 1024
    with open(temp_path, "wb") as buffer:
        while True:
            chunk = await file.read(block_size)
            if not chunk:
                break
            await run_in_threadpool(buffer.write, chunk)

    file_size = temp_path.stat().st_size if temp_path.exists() else 0

    import_log = ImportLog(
        file_name=clean_name,
        stored_filename=safe_name,
        file_size_bytes=file_size,
        is_active=0,
        imported_at=datetime.utcnow(),
        status="PENDING",
        progress_percent=0,
        domain="codinh"
    )
    db.add(import_log)
    db.commit()
    db.refresh(import_log)

    submit_codinh_import_job(import_log.id, str(temp_path))
    return import_log


@router.get("/import-logs", response_model=List[ImportLogResponse])
def list_codinh_import_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Lấy danh sách lịch sử nạp file Excel của riêng CĐBR."""
    logs = get_codinh_import_logs(db, limit)
    for log in logs:
        if log.status == "PROCESSING":
            prog_file = UPLOAD_DIR / f"{log.stored_filename}.progress"
            if prog_file.exists():
                try:
                    data = json.loads(prog_file.read_text(encoding="utf-8"))
                    db.expunge(log)
                    log.progress_percent = max(log.progress_percent or 0, data.get("progress_percent", 0))
                    if "inserted_count" in data:
                        log.inserted_count = data["inserted_count"]
                except Exception:
                    pass
    return logs


@router.get("/import-logs/{import_id}", response_model=ImportLogResponse)
def get_codinh_import_status(import_id: int, db: Session = Depends(get_db)):
    """Kiểm tra tiến độ live của file CĐBR đang nạp."""
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử import CĐBR")
    if log.status == "PROCESSING":
        prog_file = UPLOAD_DIR / f"{log.stored_filename}.progress"
        if prog_file.exists():
            try:
                data = json.loads(prog_file.read_text(encoding="utf-8"))
                db.expunge(log)
                log.progress_percent = max(log.progress_percent or 0, data.get("progress_percent", 0))
                if "inserted_count" in data:
                    log.inserted_count = data["inserted_count"]
            except Exception:
                pass
    return log


@router.post("/import-logs/{import_id}/activate", response_model=ImportLogResponse)
def activate_codinh_file(
    import_id: int,
    db: Session = Depends(get_db)
):
    """Kích hoạt nạp lại file cũ của CĐBR và chạy background ETL qua ProcessPoolExecutor."""
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử import CĐBR")
    file_path = UPLOAD_DIR / log.stored_filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File vật lý {log.stored_filename} không còn tồn tại trên máy chủ")

    log.status = "PROCESSING"
    log.progress_percent = 5
    db.commit()
    db.refresh(log)

    submit_codinh_import_job(log.id, str(file_path))
    return log


@router.delete("/import-logs/{import_id}")
def delete_codinh_file(import_id: int, db: Session = Depends(get_db)):
    """Xóa file và log của CĐBR."""
    try:
        delete_codinh_import(db, import_id)
        return {"status": "success", "message": "Đã xóa file thành công"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cabinets/upload")
async def upload_cabinets_file(
    file: UploadFile = File(...),
    category_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Tải lên file Excel chi tiết Tủ cáp / THC theo mã WO (ví dụ: demo_tu_theo_ma_wo_demo.xlsx).
    Hệ thống tự động nhận diện dòng tiêu đề và liên kết với mã WO.
    """
    valid_exts = (".xlsx", ".xls", ".csv")
    if not any(file.filename.lower().endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400,
            detail="Định dạng file không hỗ trợ. Vui lòng tải lên file .xlsx, .xls hoặc .csv"
        )

    temp_path = None
    try:
        # Save temp file
        safe_name = f"cabinet_{int(datetime.utcnow().timestamp())}_{file.filename}"
        temp_path = UPLOAD_DIR / safe_name
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = import_cabinets_from_excel(
            db=db,
            file_path=temp_path,
            filename=file.filename,
            category_id=category_id
        )
        return {
            "status": "success",
            "message": f"Nạp thành công {result['total_cabinets']} tủ cáp của {result['unique_wos']} WO!",
            **result
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Lỗi xử lý file tủ cáp: {str(e)}")
    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass


@router.get("/stats")
def get_stats(
    category_id: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Lấy số liệu thống kê chi tiết cho bảng báo cáo Cố Định Băng Rộng (theo WO và Tủ con).
    """
    try:
        return get_codinh_stats(db, category_id=category_id, target_month=month)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tính toán số liệu CĐBR: {str(e)}")


@router.get("/meta/options")
def get_meta_options(db: Session = Depends(get_db)):
    """Lấy danh sách các loại công việc và hệ thống có sẵn trong DB để hỗ trợ tạo báo cáo mới."""
    return get_codinh_meta_options(db)


@router.get("/drilldown")
def get_drilldown_tasks(
    category_id: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    metric: str = Query("total"),
    filter_type: Optional[str] = Query(None),
    target_name: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: str = Query("asc"),
    page: int = Query(1),
    page_size: int = Query(20000),
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách công việc chi tiết khi nhấp vào ô số liệu trong bảng CĐBR (kèm danh sách tủ THC con).
    """
    try:
        return get_codinh_drilldown_tasks(
            db=db,
            category_id=category_id,
            target_month=month,
            metric=metric,
            filter_type=filter_type,
            target_name=target_name,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lấy danh sách chi tiết: {str(e)}")
