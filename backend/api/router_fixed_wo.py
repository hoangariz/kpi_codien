from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.fixed_wo_report import FixedWoReport, FixedWoItem
from backend.models.task import Task
from backend.schemas.fixed_wo_schema import (
    FixedWoReportCreate,
    FixedWoReportUpdate,
    FixedWoReportResponse,
    FixedWoStatsResponse,
)
from backend.schemas.task_schema import PaginatedTasksResponse
from backend.services.fixed_wo_service import (
    create_fixed_wo_report,
    update_fixed_wo_report,
    delete_fixed_wo_report,
    get_fixed_wo_reports,
    get_fixed_wo_stats,
    get_fixed_wo_tasks,
)

router = APIRouter(prefix="/api/fixed-wo-reports", tags=["Fixed WO Reports"])


@router.get("", response_model=List[FixedWoReportResponse])
def list_reports(db: Session = Depends(get_db)):
    """List all Fixed WO Reports with summary statistics."""
    return get_fixed_wo_reports(db)


@router.post("", response_model=FixedWoReportResponse)
def create_report(data: FixedWoReportCreate, db: Session = Depends(get_db)):
    """Create a new Fixed WO Report with bulk imported WO codes."""
    try:
        report = create_fixed_wo_report(db, data)
        # Fetch formatted response
        reports = get_fixed_wo_reports(db)
        created = next((r for r in reports if r["id"] == report.id), None)
        if not created:
            return report
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo báo cáo cố định: {str(e)}")


@router.get("/{report_id}", response_model=FixedWoReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get single Fixed WO Report details."""
    reports = get_fixed_wo_reports(db)
    found = next((r for r in reports if r["id"] == report_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo cố định")
    return found


@router.put("/{report_id}", response_model=FixedWoReportResponse)
def update_report(report_id: int, data: FixedWoReportUpdate, db: Session = Depends(get_db)):
    """Update name, description or update/replace WO codes."""
    try:
        update_fixed_wo_report(db, report_id, data)
        reports = get_fixed_wo_reports(db)
        updated = next((r for r in reports if r["id"] == report_id), None)
        if not updated:
            raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo sau khi cập nhật")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi cập nhật báo cáo: {str(e)}")


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    """Delete a Fixed WO Report."""
    success = delete_fixed_wo_report(db, report_id)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo để xóa")
    return {"message": "Đã xóa báo cáo cố định thành công"}


@router.get("/{report_id}/wo-codes")
def list_wo_codes(
    report_id: int,
    search: Optional[str] = None,
    matched_only: Optional[bool] = None,
    limit: int = 1000,
    db: Session = Depends(get_db)
):
    """
    Get list of WO codes in this report, indicating whether each WO exists in current tasks data.
    """
    report = db.query(FixedWoReport).filter(FixedWoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo")

    query = db.query(FixedWoItem.ma_cong_viec).filter(FixedWoItem.report_id == report_id)
    if search:
        query = query.filter(FixedWoItem.ma_cong_viec.ilike(f"%{search.strip()}%"))

    all_wos = [row[0] for row in query.all()]
    total_count = len(all_wos)

    # Check which ones are in tasks
    matched_tasks = {
        row.ma_cong_viec: {"trang_thai": row.trang_thai, "ghi_chu": row.ghi_chu}
        for row in db.query(Task.ma_cong_viec, Task.trang_thai, Task.ghi_chu).filter(Task.ma_cong_viec.in_(all_wos)).all()
    }

    items = []
    for wo in all_wos:
        is_matched = wo in matched_tasks
        if matched_only is True and not is_matched:
            continue
        if matched_only is False and is_matched:
            continue
        
        info = matched_tasks.get(wo)
        trang_thai = info["trang_thai"] if is_matched and info else "Đã giao FT"
        ghi_chu = info["ghi_chu"] if is_matched and info and info.get("ghi_chu") else ("(IS KL)" if not is_matched else None)

        items.append({
            "ma_cong_viec": wo,
            "is_matched": is_matched,
            "trang_thai": trang_thai,
            "ghi_chu": ghi_chu,
        })
        if len(items) >= limit:
            break

    return {
        "report_id": report_id,
        "total_wos": total_count,
        "matched_count": len(matched_tasks),
        "unmatched_count": max(0, total_count - len(matched_tasks)),
        "items": items,
    }


@router.get("/{report_id}/stats", response_model=FixedWoStatsResponse)
def get_stats(
    report_id: int,
    month: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get detailed KPI statistics for this Fixed WO Report:
    Overall summary, breakdown by Employee, and breakdown by Group/Cluster.
    """
    try:
        return get_fixed_wo_stats(db, report_id, target_month=month)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tính toán thống kê báo cáo cố định: {str(e)}")


@router.get("/{report_id}/tasks", response_model=PaginatedTasksResponse)
def get_tasks(
    report_id: int,
    metric: str = Query("total"),
    filter_type: Optional[str] = None,
    filter_id: Optional[int] = None,
    is_other: bool = Query(False),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10000, ge=1, le=50000),
    sort_by: str = Query("thoi_diem_yeu_cau_ket_thuc"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db)
):
    """
    Get tasks drilldown list for modal when clicking a cell on the Fixed WO Report table.
    """
    try:
        return get_fixed_wo_tasks(
            db,
            report_id=report_id,
            metric=metric,
            filter_type=filter_type,
            filter_id=filter_id,
            is_other=is_other,
            search=search,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lấy danh sách công việc drilldown: {str(e)}")
