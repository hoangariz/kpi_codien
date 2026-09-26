from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, BackgroundTasks, Request, status
from sqlalchemy.orm import Session

from backend.database import get_db
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
)

router = APIRouter(prefix="/api/codinh", tags=["Cố Định Băng Rộng"])



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
        return {"status": "success", "message": "Đã xóa bảng báo cáo thành công"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wos/chunked/init")
async def init_codinh_chunked_upload(
    file_name: str = Form(...),
    file_size: int = Form(0),
    db: Session = Depends(get_db)
):
    """
    Khởi tạo phiên chunked upload cho file WO CĐBR (bỏ qua giới hạn Cloudflare / timeout).
    """
    valid_exts = (".xlsx", ".xls", ".csv")
    if not any(file_name.lower().endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400,
            detail="Định dạng file không hỗ trợ. Vui lòng tải lên file .xlsx, .xls hoặc .csv"
        )

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"codinh_{timestamp}_{file_name}"
    file_path = UPLOAD_DIR / safe_filename

    with open(file_path, "wb") as f:
        pass

    import_log = ImportLog(
        file_name=file_name,
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

    return {
        "import_id": import_log.id,
        "stored_filename": safe_filename,
        "status": "UPLOADING"
    }


@router.post("/wos/chunked/{import_id}")
async def upload_codinh_chunk(
    import_id: int,
    request: Request,
    chunk_index: int = Form(0),
    total_chunks: int = Form(1),
    chunk: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Tải lên từng chunk cho file CĐBR (mỗi chunk được nối vào file trên đĩa).
    """
    import_log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Upload session CĐBR không tồn tại")

    if import_log.status not in ("UPLOADING",):
        raise HTTPException(status_code=400, detail="Upload session đã kết thúc hoặc đang xử lý")

    file_path = UPLOAD_DIR / import_log.stored_filename
    chunk_data = await chunk.read()
    with open(file_path, "ab") as f:
        f.write(chunk_data)

    upload_progress = int(((chunk_index + 1) / total_chunks) * 100)
    import_log.progress_percent = min(upload_progress, 100)
    import_log.file_size_bytes = file_path.stat().st_size if file_path.exists() else 0
    db.commit()

    return {
        "import_id": import_id,
        "chunk_index": chunk_index,
        "received": len(chunk_data),
        "upload_progress": upload_progress
    }


@router.post("/wos/chunked/{import_id}/finalize", response_model=ImportLogResponse)
async def finalize_codinh_chunked_upload(
    import_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Hoàn tất tải các chunk: chuyển trạng thái sang PENDING và chạy ETL ngầm.
    """
    import_log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not import_log:
        raise HTTPException(status_code=404, detail="Upload session CĐBR không tồn tại")

    file_path = UPLOAD_DIR / import_log.stored_filename
    if not file_path.exists() or file_path.stat().st_size == 0:
        raise HTTPException(status_code=400, detail="File rỗng hoặc chưa được upload chunk nào")

    import_log.status = "PENDING"
    import_log.progress_percent = 0
    import_log.file_size_bytes = file_path.stat().st_size
    db.commit()
    db.refresh(import_log)

    background_tasks.add_task(process_codinh_wos_import, import_log.id, str(file_path))
    return import_log


@router.post("/wos/upload", response_model=ImportLogResponse)
async def upload_codinh_wos_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Tải lên file gốc công việc (WO) riêng biệt cho Cố Định Băng Rộng (CĐBR).
    Chạy background ETL với theo dõi tiến độ và lưu lịch sử ImportLog.
    """
    valid_exts = (".xlsx", ".xls", ".csv")
    if not any(file.filename.lower().endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400,
            detail="Định dạng file không hỗ trợ. Vui lòng tải lên file .xlsx, .xls hoặc .csv"
        )

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = f"codinh_{timestamp}_{file.filename}"
    temp_path = UPLOAD_DIR / safe_name

    CHUNK_SIZE = 1024 * 1024
    with open(temp_path, "wb") as buffer:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            buffer.write(chunk)

    file_size = temp_path.stat().st_size if temp_path.exists() else 0

    import_log = ImportLog(
        file_name=file.filename,
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

    background_tasks.add_task(process_codinh_wos_import, import_log.id, str(temp_path))
    return import_log


@router.get("/import-logs", response_model=List[ImportLogResponse])
def list_codinh_import_logs(limit: int = 50, db: Session = Depends(get_db)):
    """Lấy danh sách lịch sử nạp file Excel của riêng CĐBR."""
    return get_codinh_import_logs(db, limit)


@router.get("/import-logs/{import_id}", response_model=ImportLogResponse)
def get_codinh_import_status(import_id: int, db: Session = Depends(get_db)):
    """Kiểm tra tiến độ live của file CĐBR đang nạp."""
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử import CĐBR")
    return log


@router.post("/import-logs/{import_id}/activate", response_model=ImportLogResponse)
def activate_codinh_file(
    import_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Kích hoạt nạp lại file cũ của CĐBR và chạy background ETL."""
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử import CĐBR")
    from backend.config import UPLOAD_DIR
    file_path = UPLOAD_DIR / log.stored_filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File vật lý {log.stored_filename} không còn tồn tại trên máy chủ")

    log.status = "PROCESSING"
    log.progress_percent = 5
    db.commit()
    db.refresh(log)

    background_tasks.add_task(process_codinh_wos_import, log.id, str(file_path))
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

    # Save temp file
    safe_name = f"cabinet_{file.filename}"
    temp_path = UPLOAD_DIR / safe_name
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi xử lý file tủ cáp: {str(e)}")


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
