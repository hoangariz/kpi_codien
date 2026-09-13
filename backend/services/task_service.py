from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import desc, asc, or_, and_, func
from sqlalchemy.orm import Session, joinedload

from backend.models import Task, TaskHistory, TaskNote, Employee, Group, SystemModel, Unit, Station
from backend.schemas.task_schema import TaskListItem, PaginatedTasksResponse, TaskDetailResponse, NoteResponse, HistoryResponse


def get_tasks_paginated(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    group_id: Optional[int] = None,
    assigned_to_id: Optional[int] = None,
    trang_thai: Optional[str] = None,
    loai_cong_viec: Optional[str] = None,
    system_id: Optional[int] = None,
    is_overdue: Optional[bool] = None,
    sort_by: str = "thoi_diem_tao",
    sort_order: str = "desc"
) -> Dict[str, Any]:
    """Search and paginate tasks with joined dimensions."""
    query = db.query(Task)

    filters = []

    if search:
        search_pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Task.ma_cong_viec.ilike(search_pattern),
                Task.noi_dung_cong_viec.ilike(search_pattern),
                Task.thue_bao.ilike(search_pattern),
                Task.ghi_chu.ilike(search_pattern),
            )
        )

    if group_id:
        filters.append(Task.group_id == group_id)
    if assigned_to_id:
        filters.append(Task.assigned_to_id == assigned_to_id)
    if trang_thai:
        filters.append(Task.trang_thai == trang_thai)
    if loai_cong_viec:
        filters.append(Task.loai_cong_viec == loai_cong_viec)
    if system_id:
        filters.append(Task.system_id == system_id)

    if is_overdue is not None:
        now = datetime.utcnow()
        completed = ["Đóng", "Hoàn thành", "Đã hoàn thành", "Thành công"]
        if is_overdue:
            filters.append(
                and_(
                    ~Task.trang_thai.in_(completed),
                    or_(
                        Task.thoi_gian_con_lai < 0,
                        and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                    )
                )
            )
        else:
            filters.append(
                or_(
                    Task.trang_thai.in_(completed),
                    and_(
                        or_(Task.thoi_gian_con_lai == None, Task.thoi_gian_con_lai >= 0),
                        or_(Task.thoi_diem_yeu_cau_ket_thuc == None, Task.thoi_diem_yeu_cau_ket_thuc >= now)
                    )
                )
            )

    if filters:
        query = query.filter(and_(*filters))

    total = query.count()

    # Sorting
    sort_column = getattr(Task, sort_by, Task.thoi_diem_tao)
    if sort_order.lower() == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    # Pagination
    offset = (page - 1) * page_size
    items_raw = query.offset(offset).limit(page_size).all()

    # Pre-fetch counts of notes and history for these tasks
    task_keys = [t.ma_cong_viec for t in items_raw]
    note_counts = {}
    history_counts = {}
    latest_notes = {}
    if task_keys:
        nc = db.query(TaskNote.ma_cong_viec, func.count(TaskNote.id))\
            .filter(TaskNote.ma_cong_viec.in_(task_keys))\
            .group_by(TaskNote.ma_cong_viec).all()
        note_counts = {k: v for k, v in nc}

        hc = db.query(TaskHistory.ma_cong_viec, func.count(TaskHistory.id))\
            .filter(TaskHistory.ma_cong_viec.in_(task_keys))\
            .group_by(TaskHistory.ma_cong_viec).all()
        history_counts = {k: v for k, v in hc}

        all_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content)\
            .filter(TaskNote.ma_cong_viec.in_(task_keys))\
            .order_by(TaskNote.created_at.desc())\
            .all()
        for k, content in all_notes:
            if k not in latest_notes:
                latest_notes[k] = content

    items = []
    for t in items_raw:
        item = TaskListItem(
            ma_cong_viec=t.ma_cong_viec,
            ma_cong_viec_cha=t.ma_cong_viec_cha,
            loai_cong_viec=t.loai_cong_viec,
            noi_dung_cong_viec=t.noi_dung_cong_viec,
            ghi_chu=t.ghi_chu,
            trang_thai=t.trang_thai,
            trang_thai_hoan_thanh=t.trang_thai_hoan_thanh,
            thoi_diem_tao=t.thoi_diem_tao,
            thoi_diem_bat_dau_thuc_hien=t.thoi_diem_bat_dau_thuc_hien,
            thoi_diem_yeu_cau_ket_thuc=t.thoi_diem_yeu_cau_ket_thuc,
            thoi_gian_con_lai=t.thoi_gian_con_lai,
            thoi_diem_ft_hoan_thanh=t.thoi_diem_ft_hoan_thanh,
            thoi_diem_cd_dong=t.thoi_diem_cd_dong,
            thue_bao=t.thue_bao,
            loi=t.loi,
            assigned_to_id=t.assigned_to_id,
            group_id=t.group_id,
            employee_assigned_name=t.employee_assigned.name if t.employee_assigned else None,
            employee_created_name=t.employee_created.name if t.employee_created else None,
            group_name=t.group.name if t.group else None,
            system_name=t.system.name if t.system else None,
            unit_name=t.unit.name if t.unit else None,
            station_code=t.station.code if t.station else None,
            note_count=note_counts.get(t.ma_cong_viec, 0),
            history_count=history_counts.get(t.ma_cong_viec, 0),
            latest_note=latest_notes.get(t.ma_cong_viec),
        )
        items.append(item)

    total_pages = max(1, (total + page_size - 1) // page_size)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": items,
    }


def get_task_detail(db: Session, ma_cong_viec: str) -> Optional[TaskDetailResponse]:
    """Get full task details including history timeline and notes."""
    task = db.query(Task).filter(Task.ma_cong_viec == ma_cong_viec).first()
    if not task:
        return None

    history_list = db.query(TaskHistory)\
        .filter(TaskHistory.ma_cong_viec == ma_cong_viec)\
        .order_by(desc(TaskHistory.changed_at)).all()

    notes_list = db.query(TaskNote)\
        .filter(TaskNote.ma_cong_viec == ma_cong_viec)\
        .order_by(desc(TaskNote.created_at)).all()

    return TaskDetailResponse(
        ma_cong_viec=task.ma_cong_viec,
        ma_cong_viec_cha=task.ma_cong_viec_cha,
        task_type_id=task.task_type_id,
        loai_cong_viec=task.loai_cong_viec,
        noi_dung_cong_viec=task.noi_dung_cong_viec,
        ghi_chu=task.ghi_chu,
        trang_thai=task.trang_thai,
        trang_thai_hoan_thanh=task.trang_thai_hoan_thanh,
        system_id=task.system_id,
        created_by_id=task.created_by_id,
        thoi_diem_tao=task.thoi_diem_tao,
        group_id=task.group_id,
        assigned_to_id=task.assigned_to_id,
        loi=task.loi,
        thoi_diem_bat_dau_thuc_hien=task.thoi_diem_bat_dau_thuc_hien,
        thoi_diem_yeu_cau_ket_thuc=task.thoi_diem_yeu_cau_ket_thuc,
        thoi_gian_con_lai=task.thoi_gian_con_lai,
        thoi_diem_ft_hoan_thanh=task.thoi_diem_ft_hoan_thanh,
        thoi_diem_cd_dong=task.thoi_diem_cd_dong,
        thoi_diem_ft_tiep_nhan=task.thoi_diem_ft_tiep_nhan,
        thue_bao=task.thue_bao,
        unit_id=task.unit_id,
        worklog=task.worklog,
        station_id=task.station_id,
        ft_comment=task.ft_comment,
        ft_mobile=task.ft_mobile,
        created_at=task.created_at,
        updated_at=task.updated_at,
        last_import_id=task.last_import_id,
        employee_assigned_name=task.employee_assigned.name if task.employee_assigned else None,
        employee_created_name=task.employee_created.name if task.employee_created else None,
        group_name=task.group.name if task.group else None,
        system_name=task.system.name if task.system else None,
        unit_name=task.unit.name if task.unit else None,
        station_code=task.station.code if task.station else None,
        history=[HistoryResponse.model_validate(h) for h in history_list],
        notes=[NoteResponse.model_validate(n) for n in notes_list],
    )


def add_task_note(db: Session, ma_cong_viec: str, content: str, created_by: str = "User") -> TaskNote:
    """Add a permanent note to a task."""
    note = TaskNote(
        ma_cong_viec=ma_cong_viec,
        note_content=content.strip(),
        created_by=created_by.strip() or "User",
        created_at=datetime.utcnow()
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_task_notes(db: Session, ma_cong_viec: str) -> List[TaskNote]:
    """Get all notes for a task ordered by created date."""
    return db.query(TaskNote).filter(TaskNote.ma_cong_viec == ma_cong_viec).order_by(desc(TaskNote.created_at)).all()


def get_task_history(db: Session, ma_cong_viec: str) -> List[TaskHistory]:
    """Get all change history for a task ordered by changed date."""
    return db.query(TaskHistory).filter(TaskHistory.ma_cong_viec == ma_cong_viec).order_by(desc(TaskHistory.changed_at)).all()
