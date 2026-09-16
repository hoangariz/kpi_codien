from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.task_service import (
    get_tasks_paginated,
    get_task_detail,
    add_task_note,
    get_task_notes,
    get_task_history,
)
from backend.schemas.task_schema import (
    PaginatedTasksResponse,
    TaskDetailResponse,
    NoteCreate,
    NoteResponse,
    HistoryResponse,
)

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.get("", response_model=PaginatedTasksResponse)
def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: Optional[str] = None,
    group_id: Optional[int] = None,
    assigned_to_id: Optional[int] = None,
    trang_thai: Optional[str] = None,
    loai_cong_viec: Optional[str] = None,
    system_id: Optional[int] = None,
    is_overdue: Optional[bool] = None,
    station_code: Optional[str] = None,
    ft_username: Optional[str] = None,
    sort_by: str = Query("thoi_diem_tao"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db)
):
    """Get paginated tasks with full filter and search capabilities."""
    return get_tasks_paginated(
        db=db,
        page=page,
        page_size=page_size,
        search=search,
        group_id=group_id,
        assigned_to_id=assigned_to_id,
        trang_thai=trang_thai,
        loai_cong_viec=loai_cong_viec,
        system_id=system_id,
        is_overdue=is_overdue,
        station_code=station_code,
        ft_username=ft_username,
        sort_by=sort_by,
        sort_order=sort_order
    )


@router.get("/{ma_cong_viec}", response_model=TaskDetailResponse)
def task_detail(ma_cong_viec: str, db: Session = Depends(get_db)):
    """Get complete task detail, history timeline, and notes."""
    task = get_task_detail(db, ma_cong_viec)
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")
    return task


@router.get("/{ma_cong_viec}/history", response_model=list[HistoryResponse])
def task_history(ma_cong_viec: str, db: Session = Depends(get_db)):
    """Get task change history timeline."""
    return get_task_history(db, ma_cong_viec)


@router.get("/{ma_cong_viec}/notes", response_model=list[NoteResponse])
def list_task_notes(ma_cong_viec: str, db: Session = Depends(get_db)):
    """Get notes list for a specific task."""
    return get_task_notes(db, ma_cong_viec)


@router.post("/{ma_cong_viec}/notes", response_model=NoteResponse)
def create_task_note(
    ma_cong_viec: str,
    payload: NoteCreate,
    db: Session = Depends(get_db)
):
    """Add a permanent note to a task (persists across file imports)."""
    if not payload.note_content.strip():
        raise HTTPException(status_code=400, detail="Nội dung ghi chú không được để trống")
    return add_task_note(
        db=db,
        ma_cong_viec=ma_cong_viec,
        content=payload.note_content,
        created_by=payload.created_by or "User"
    )
