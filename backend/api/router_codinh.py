import os
import shutil
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.config import UPLOAD_DIR
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
    import_cabinets_from_excel,
    get_codinh_stats,
    get_codinh_meta_options,
    seed_default_codinh_if_needed,
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
