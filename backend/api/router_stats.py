from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.stats_service import (
    get_kpi_overview,
    get_stats_by_group,
    get_stats_by_employee,
    get_special_maintenance_stats,
    get_special_maintenance_tasks,
    get_timeline_stats,
    get_overdue_stats,
    MAINTENANCE_TASK_TYPE,
)
from backend.schemas.stats_schema import (
    KPIOverview,
    GroupStatItem,
    EmployeeStatItem,
    MaintenanceSpecialResponse,
    TimelineItem,
    OverdueSummary,
)
from backend.schemas.task_schema import PaginatedTasksResponse

router = APIRouter(prefix="/api/stats", tags=["Statistics"])


@router.get("/summary", response_model=KPIOverview)
def stats_kpi(db: Session = Depends(get_db)):
    """Summary KPI metrics across the system."""
    return get_kpi_overview(db)


@router.get("/by-group", response_model=List[GroupStatItem])
def stats_by_group(
    task_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    """Aggregated stats grouped by dispatch group."""
    return get_stats_by_group(
        db=db,
        task_type=task_type,
        start_date=start_date,
        end_date=end_date
    )


@router.get("/by-employee", response_model=List[EmployeeStatItem])
def stats_by_employee(
    group_id: Optional[int] = None,
    task_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """Aggregated stats grouped by assigned employee."""
    return get_stats_by_employee(
        db=db,
        group_id=group_id,
        task_type=task_type,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )


@router.get("/maintenance-special", response_model=MaintenanceSpecialResponse)
def stats_maintenance_special(
    task_type: Optional[str] = MAINTENANCE_TASK_TYPE,
    month: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Dedicated report for:
    'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS'
    grouped by Nhân viên thực hiện and Nhóm điều phối.
    Filters out previous month closed tasks according to active month setting.
    """
    return get_special_maintenance_stats(db, target_type=task_type, target_month=month)


@router.get("/maintenance-special/tasks", response_model=PaginatedTasksResponse)
def stats_maintenance_tasks(
    task_type: Optional[str] = MAINTENANCE_TASK_TYPE,
    month: Optional[str] = None,
    metric: str = Query("total"),
    filter_type: Optional[str] = None,
    filter_id: Optional[int] = None,
    is_other: bool = Query(False),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str = Query("thoi_diem_yeu_cau_ket_thuc"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db)
):
    """
    Drilldown list of tasks for the special maintenance report.
    Returns exact tasks matching table number clicked (total, closed, pending, overdue, closed_today, closed_last_7_days).
    """
    return get_special_maintenance_tasks(
        db=db,
        target_type=task_type,
        target_month=month,
        metric=metric,
        filter_type=filter_type,
        filter_id=filter_id,
        is_other=is_other,
        search=search,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )


@router.get("/timeline", response_model=List[TimelineItem])
def stats_timeline(
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db)
):
    """Daily trend of task creation and completion."""
    return get_timeline_stats(db, days=days)


@router.get("/overdue", response_model=OverdueSummary)
def stats_overdue(
    group_id: Optional[int] = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Overdue tasks overview."""
    return get_overdue_stats(db, group_id=group_id, limit=limit)
