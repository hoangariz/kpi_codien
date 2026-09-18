from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.tracking import TrackingBoard, TrackingBoardTask
from backend.models.task import Task


CLOSED_STATUSES = ["Đóng", "FT hoàn thành", "FT Hoàn thành", "FT Hoàn Thành"]


def get_matching_tasks_by_type(db: Session, loai_cong_viec: str, target_month: Optional[str] = None) -> List[str]:
    """
    Get list of task codes matching user-specified rule:
    Task.loai_cong_viec == loai_cong_viec
    AND (
        Task.thoi_diem_yeu_cau_ket_thuc IS NULL
        OR Task.thoi_diem_yeu_cau_ket_thuc >= month_start
        OR Task.trang_thai NOT IN CLOSED_STATUSES
    )
    """
    from backend.services.settings_service import get_current_month_setting
    active_month = target_month or get_current_month_setting(db)
    try:
        y_str, m_str = active_month.split("-")
        month_start = datetime(int(y_str), int(m_str), 1, 0, 0, 0)
    except Exception:
        now_dt = datetime.utcnow()
        month_start = datetime(now_dt.year, now_dt.month, 1, 0, 0, 0)

    from sqlalchemy import or_
    matching = db.query(Task.ma_cong_viec).filter(
        Task.loai_cong_viec == loai_cong_viec.strip(),
        or_(
            Task.thoi_diem_yeu_cau_ket_thuc == None,
            Task.thoi_diem_yeu_cau_ket_thuc >= month_start,
            ~Task.trang_thai.in_(CLOSED_STATUSES)
        )
    ).all()
    return [r[0] for r in matching if r[0]]


def get_tracking_boards(db: Session) -> List[Dict[str, Any]]:
    """Get list of tracking boards with task count and task type."""
    boards = db.query(
        TrackingBoard.id,
        TrackingBoard.name,
        TrackingBoard.description,
        TrackingBoard.loai_cong_viec,
        TrackingBoard.created_at,
        TrackingBoard.updated_at,
        func.count(TrackingBoardTask.id).label("task_count")
    ).outerjoin(TrackingBoardTask, TrackingBoard.id == TrackingBoardTask.board_id)\
     .group_by(TrackingBoard.id)\
     .order_by(TrackingBoard.created_at.desc())\
     .all()

    return [
        {
            "id": b.id,
            "name": b.name,
            "description": b.description,
            "loai_cong_viec": b.loai_cong_viec,
            "task_count": b.task_count or 0,
            "created_at": b.created_at,
            "updated_at": b.updated_at
        }
        for b in boards
    ]


def create_tracking_board(
    db: Session, 
    name: str, 
    description: Optional[str] = None,
    loai_cong_viec: Optional[str] = None
) -> TrackingBoard:
    """Create a new tracking board."""
    board = TrackingBoard(
        name=name.strip(),
        description=description.strip() if description else None,
        loai_cong_viec=loai_cong_viec.strip() if loai_cong_viec and loai_cong_viec.strip() else None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(board)
    db.commit()
    db.refresh(board)
    return board


def get_tracking_board_detail(db: Session, board_id: int) -> Optional[Dict[str, Any]]:
    """Get board detail with all tasks inside it."""
    board = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
    if not board:
        return None

    items = db.query(TrackingBoardTask)\
              .filter(TrackingBoardTask.board_id == board_id)\
              .order_by(TrackingBoardTask.added_at.desc())\
              .all()

    # Bulk fetch tasks
    task_codes = [it.ma_cong_viec for it in items]
    tasks_map = {}
    notes_map = {}
    if task_codes:
        tasks = db.query(Task).filter(Task.ma_cong_viec.in_(task_codes)).all()
        tasks_map = {t.ma_cong_viec: t for t in tasks}

        from backend.models.note import TaskNote
        subq = db.query(
            TaskNote.ma_cong_viec,
            func.max(TaskNote.id).label("max_id")
        ).filter(TaskNote.ma_cong_viec.in_(task_codes))\
         .group_by(TaskNote.ma_cong_viec).subquery()

        latest_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content)\
                         .join(subq, (TaskNote.ma_cong_viec == subq.c.ma_cong_viec) & (TaskNote.id == subq.c.max_id))\
                         .all()
        notes_map = {n[0]: n[1] for n in latest_notes}

    tasks_data = []
    for it in items:
        t_obj = tasks_map.get(it.ma_cong_viec)
        tasks_data.append({
            "id": it.id,
            "board_id": it.board_id,
            "ma_cong_viec": it.ma_cong_viec,
            "added_at": it.added_at,
            "note": it.note,
            "latest_note": notes_map.get(it.ma_cong_viec),
            "loai_cong_viec": t_obj.loai_cong_viec if t_obj else None,
            "trang_thai": t_obj.trang_thai if t_obj else "Không tồn tại trong snapshot",
            "employee_assigned_name": t_obj.employee_assigned.name if (t_obj and t_obj.employee_assigned) else None,
            "group_name": t_obj.group.name if (t_obj and t_obj.group) else None,
            "thoi_diem_yeu_cau_ket_thuc": t_obj.thoi_diem_yeu_cau_ket_thuc if t_obj else None,
            "thoi_gian_con_lai": t_obj.thoi_gian_con_lai if t_obj else None,
            "station_code": t_obj.station.code if (t_obj and t_obj.station) else None
        })

    return {
        "id": board.id,
        "name": board.name,
        "description": board.description,
        "loai_cong_viec": board.loai_cong_viec,
        "task_count": len(tasks_data),
        "created_at": board.created_at,
        "updated_at": board.updated_at,
        "tasks": tasks_data
    }


def update_tracking_board(
    db: Session, 
    board_id: int, 
    name: Optional[str] = None, 
    description: Optional[str] = None,
    loai_cong_viec: Optional[str] = None
) -> Optional[TrackingBoard]:
    """Update tracking board name, description, and task type."""
    board = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
    if not board:
        return None
    if name is not None and name.strip():
        board.name = name.strip()
    if description is not None:
        board.description = description.strip() if description.strip() else None
    if loai_cong_viec is not None:
        board.loai_cong_viec = loai_cong_viec.strip() if loai_cong_viec.strip() else None
    board.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(board)
    return board


def sync_board_tasks_by_type(db: Session, board_id: int) -> int:
    """Sync tasks into board based on its configured loai_cong_viec and default time rule."""
    board = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
    if not board:
        raise ValueError("Không tìm thấy bảng theo dõi")
    if not board.loai_cong_viec:
        raise ValueError("Bảng này không cấu hình Loại công việc để đồng bộ tự động")
    codes = get_matching_tasks_by_type(db, board.loai_cong_viec)
    added = bulk_add_tasks_to_board(db, board_id=board.id, task_codes=codes)
    return added


def delete_tracking_board(db: Session, board_id: int) -> bool:
    """Delete tracking board and its task references."""
    board = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
    if not board:
        return False
    db.delete(board)
    db.commit()
    return True


def clear_all_tasks_from_board(db: Session, board_id: int) -> int:
    """Remove all tasks from a tracking board."""
    deleted_count = db.query(TrackingBoardTask).filter(TrackingBoardTask.board_id == board_id).delete()
    db.commit()
    return deleted_count


def update_task_note_in_board(db: Session, board_id: int, ma_cong_viec: str, note: str) -> bool:
    """Update tracking note for a task in a specific board."""
    item = db.query(TrackingBoardTask).filter(
        TrackingBoardTask.board_id == board_id,
        TrackingBoardTask.ma_cong_viec == ma_cong_viec
    ).first()
    if not item:
        return False
    item.note = note.strip() if note else None
    db.commit()
    return True


def bulk_add_tasks_to_board(db: Session, board_id: int, task_codes: List[str], note: Optional[str] = None) -> int:
    """Bulk add multiple tasks to a tracking board, skipping existing ones."""
    board = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
    if not board:
        raise ValueError(f"Không tìm thấy bảng theo dõi có ID {board_id}")

    clean_codes = list(dict.fromkeys([c.strip() for c in task_codes if c and c.strip()]))
    if not clean_codes:
        return 0

    existing_codes = set(
        r[0] for r in db.query(TrackingBoardTask.ma_cong_viec).filter(
            TrackingBoardTask.board_id == board_id,
            TrackingBoardTask.ma_cong_viec.in_(clean_codes)
        ).all()
    )

    new_items = [
        TrackingBoardTask(
            board_id=board_id,
            ma_cong_viec=code,
            note=note,
            added_at=datetime.utcnow()
        )
        for code in clean_codes if code not in existing_codes
    ]

    if new_items:
        db.add_all(new_items)
        board.updated_at = datetime.utcnow()
        db.commit()

    return len(new_items)


def add_task_to_board(db: Session, board_id: int, ma_cong_viec: str, note: Optional[str] = None) -> TrackingBoardTask:
    """Add a task to a tracking board or update its note if already exists."""
    board = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
    if not board:
        raise ValueError(f"Không tìm thấy bảng theo dõi có ID {board_id}")

    existing = db.query(TrackingBoardTask).filter(
        TrackingBoardTask.board_id == board_id,
        TrackingBoardTask.ma_cong_viec == ma_cong_viec
    ).first()

    if existing:
        if note is not None:
            existing.note = note
            db.commit()
            db.refresh(existing)
        return existing

    item = TrackingBoardTask(
        board_id=board_id,
        ma_cong_viec=ma_cong_viec,
        note=note,
        added_at=datetime.utcnow()
    )
    db.add(item)
    board.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


def remove_task_from_board(db: Session, board_id: int, ma_cong_viec: str) -> bool:
    """Remove a task from a tracking board."""
    item = db.query(TrackingBoardTask).filter(
        TrackingBoardTask.board_id == board_id,
        TrackingBoardTask.ma_cong_viec == ma_cong_viec
    ).first()

    if not item:
        return False

    db.delete(item)
    board = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
    if board:
        board.updated_at = datetime.utcnow()
    db.commit()
    return True


def get_task_boards(db: Session, ma_cong_viec: str) -> List[Dict[str, Any]]:
    """Get list of tracking boards that currently contain this task."""
    rows = db.query(
        TrackingBoard.id,
        TrackingBoard.name,
        TrackingBoardTask.added_at,
        TrackingBoardTask.note
    ).join(TrackingBoardTask, TrackingBoard.id == TrackingBoardTask.board_id)\
     .filter(TrackingBoardTask.ma_cong_viec == ma_cong_viec)\
     .all()

    return [
        {
            "id": r.id,
            "name": r.name,
            "added_at": r.added_at,
            "note": r.note
        }
        for r in rows
    ]


def get_board_task_codes(db: Session, board_id: int) -> List[str]:
    """Get list of task codes in a board."""
    rows = db.query(TrackingBoardTask.ma_cong_viec)\
             .filter(TrackingBoardTask.board_id == board_id)\
             .all()
    return [r[0] for r in rows]
