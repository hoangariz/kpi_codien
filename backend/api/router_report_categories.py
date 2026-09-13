from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.schemas.report_category_schema import (
    ReportCategoryResponse,
    ReportCategoryCreate,
    ReportCategoryUpdate
)
from backend.services.report_category_service import (
    get_report_categories,
    get_report_category_by_id,
    create_report_category,
    update_report_category,
    delete_report_category
)

router = APIRouter(prefix="/api/reports/categories", tags=["Report Categories"])


@router.get("", response_model=List[ReportCategoryResponse])
@router.get("/", response_model=List[ReportCategoryResponse], include_in_schema=False)
def list_categories(
    month: Optional[str] = Query(None),
    include_summary: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Get all report categories with optional mini KPI summary."""
    return get_report_categories(db, target_month=month, include_summary=include_summary)


@router.post("", response_model=ReportCategoryResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ReportCategoryResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def add_category(payload: ReportCategoryCreate, db: Session = Depends(get_db)):
    """Create a new report category based on Task.loai_cong_viec."""
    try:
        cat = create_report_category(db, payload)
        return cat
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{cat_id}", response_model=ReportCategoryResponse)
def edit_category(cat_id: int, payload: ReportCategoryUpdate, db: Session = Depends(get_db)):
    """Update a report category."""
    try:
        cat = update_report_category(db, cat_id, payload)
        if not cat:
            raise HTTPException(status_code=404, detail="Không tìm thấy loại báo cáo")
        return cat
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{cat_id}")
def remove_category(cat_id: int, db: Session = Depends(get_db)):
    """Delete a report category (system default cannot be deleted)."""
    try:
        ok = delete_report_category(db, cat_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Không tìm thấy loại báo cáo để xoá")
        return {"message": "Đã xoá loại báo cáo thành công"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =========================================================================
# SUB-CATEGORIES API ENDPOINTS
# =========================================================================

from backend.schemas.report_category_schema import (
    ReportSubCategoryCreate,
    ReportSubCategoryUpdate,
    ReportSubCategoryResponse
)
from backend.services.report_category_service import (
    create_sub_category,
    update_sub_category,
    delete_sub_category
)


@router.post("/{cat_id}/sub-categories", response_model=ReportSubCategoryResponse, status_code=status.HTTP_201_CREATED)
def add_sub_category(cat_id: int, payload: ReportSubCategoryCreate, db: Session = Depends(get_db)):
    """
    Tạo mới đầu việc con (bảng con) gắn với bảng mẹ qua từ khóa.
    Báo lỗi nếu keyword bị trùng với bảng con khác trong cùng danh mục mẹ.
    """
    try:
        sub = create_sub_category(db, cat_id, payload)
        return sub
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/sub-categories/{sub_id}", response_model=ReportSubCategoryResponse)
def edit_sub_category(sub_id: int, payload: ReportSubCategoryUpdate, db: Session = Depends(get_db)):
    """Cập nhật đầu việc con, kiểm tra trùng lặp từ khóa."""
    try:
        sub = update_sub_category(db, sub_id, payload)
        if not sub:
            raise HTTPException(status_code=404, detail="Không tìm thấy đầu việc con")
        return sub
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/sub-categories/{sub_id}")
def remove_sub_category(sub_id: int, db: Session = Depends(get_db)):
    """Xóa một đầu việc con."""
    try:
        ok = delete_sub_category(db, sub_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Không tìm thấy đầu việc con để xoá")
        return {"message": "Đã xoá đầu việc con thành công"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
