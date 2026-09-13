from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.schemas.tracking_schema import (
    TrackingBoardCreate,
    TrackingBoardUpdate,
    TrackingBoardResponse,
    TrackingBoardDetailResponse,
    TrackingBoardTaskAdd,
    TrackingBoardTaskNoteUpdate,
    TrackingBoardBulkAdd,
    TrackingBoardTaskItem
)
from backend.services.tracking_service import (
    get_tracking_boards,
    create_tracking_board,
    update_tracking_board,
    get_tracking_board_detail,
    delete_tracking_board,
    add_task_to_board,
    bulk_add_tasks_to_board,
    update_task_note_in_board,
    remove_task_from_board,
    clear_all_tasks_from_board,
    get_task_boards,
    get_matching_tasks_by_type,
    sync_board_tasks_by_type
)

router = APIRouter(prefix="/api/tracking-boards", tags=["Tracking Boards"])


@router.get("", response_model=List[TrackingBoardResponse])
@router.get("/", response_model=List[TrackingBoardResponse], include_in_schema=False)
def list_boards(db: Session = Depends(get_db)):
    """Get all custom tracking boards."""
    return get_tracking_boards(db)


@router.post("", response_model=TrackingBoardResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=TrackingBoardResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_board(payload: TrackingBoardCreate, db: Session = Depends(get_db)):
    """Create a new tracking board and optionally bulk add tasks / auto-match by loai_cong_viec."""
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Tên bảng theo dõi không được để trống")
    board = create_tracking_board(db, name=payload.name, description=payload.description, loai_cong_viec=payload.loai_cong_viec)
    
    all_codes = list(payload.task_codes or [])
    if payload.loai_cong_viec and payload.loai_cong_viec.strip():
        matched = get_matching_tasks_by_type(db, payload.loai_cong_viec.strip())
        all_codes.extend(matched)

    added_count = 0
    if all_codes:
        added_count = bulk_add_tasks_to_board(db, board_id=board.id, task_codes=all_codes, note=payload.note)

    return {
        "id": board.id,
        "name": board.name,
        "description": board.description,
        "loai_cong_viec": board.loai_cong_viec,
        "task_count": added_count,
        "created_at": board.created_at,
        "updated_at": board.updated_at
    }


@router.get("/{board_id}", response_model=TrackingBoardDetailResponse)
def get_board(board_id: int, db: Session = Depends(get_db)):
    """Get detail of a tracking board with its task list."""
    board_data = get_tracking_board_detail(db, board_id)
    if not board_data:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng theo dõi")
    return board_data


@router.put("/{board_id}", response_model=TrackingBoardResponse)
def edit_board(board_id: int, payload: TrackingBoardUpdate, db: Session = Depends(get_db)):
    """Update tracking board name, description, loai_cong_viec and optionally add tasks."""
    board = update_tracking_board(
        db, 
        board_id=board_id, 
        name=payload.name, 
        description=payload.description,
        loai_cong_viec=payload.loai_cong_viec
    )
    if not board:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng theo dõi để cập nhật")
    if payload.task_codes_to_add:
        bulk_add_tasks_to_board(db, board_id=board.id, task_codes=payload.task_codes_to_add, note=payload.note)
    
    from backend.models.tracking import TrackingBoardTask
    task_count = db.query(TrackingBoardTask).filter(TrackingBoardTask.board_id == board.id).count()
    return {
        "id": board.id,
        "name": board.name,
        "description": board.description,
        "loai_cong_viec": board.loai_cong_viec,
        "task_count": task_count,
        "created_at": board.created_at,
        "updated_at": board.updated_at
    }


@router.delete("/{board_id}")
def remove_board(board_id: int, db: Session = Depends(get_db)):
    """Delete a tracking board."""
    ok = delete_tracking_board(db, board_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng theo dõi để xoá")
    return {"message": "Đã xoá bảng theo dõi thành công"}


@router.delete("/{board_id}/tasks")
def clear_tasks(board_id: int, db: Session = Depends(get_db)):
    """Remove all tasks from a tracking board."""
    count = clear_all_tasks_from_board(db, board_id=board_id)
    return {"message": f"Đã xoá {count} công việc khỏi bảng theo dõi"}


@router.get("/task/{ma_cong_viec}")
def get_boards_for_task(ma_cong_viec: str, db: Session = Depends(get_db)):
    """Get list of tracking boards that currently track this specific task."""
    return get_task_boards(db, ma_cong_viec)


@router.post("/{board_id}/tasks")
def add_task(board_id: int, payload: TrackingBoardTaskAdd, db: Session = Depends(get_db)):
    """Add a task to a tracking board."""
    try:
        item = add_task_to_board(db, board_id=board_id, ma_cong_viec=payload.ma_cong_viec, note=payload.note)
        return {
            "id": item.id,
            "board_id": item.board_id,
            "ma_cong_viec": item.ma_cong_viec,
            "note": item.note,
            "added_at": item.added_at,
            "message": "Đã thêm công việc vào bảng theo dõi thành công"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{board_id}/bulk-tasks")
def bulk_add(board_id: int, payload: TrackingBoardBulkAdd, db: Session = Depends(get_db)):
    """Bulk add multiple tasks to a tracking board."""
    try:
        added_count = bulk_add_tasks_to_board(db, board_id=board_id, task_codes=payload.ma_cong_viec_list, note=payload.note)
        return {
            "added_count": added_count,
            "message": f"Đã thêm thành công {added_count} công việc vào bảng theo dõi"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{board_id}/tasks/{ma_cong_viec}")
def edit_task_note(board_id: int, ma_cong_viec: str, payload: TrackingBoardTaskNoteUpdate, db: Session = Depends(get_db)):
    """Update tracking note for a task in a specific board."""
    ok = update_task_note_in_board(db, board_id=board_id, ma_cong_viec=ma_cong_viec, note=payload.note)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc trong bảng theo dõi")
    return {"message": "Đã cập nhật ghi chú theo dõi"}


@router.delete("/{board_id}/tasks/{ma_cong_viec}")
def remove_task(board_id: int, ma_cong_viec: str, db: Session = Depends(get_db)):
    """Remove a task from a tracking board."""
    ok = remove_task_from_board(db, board_id=board_id, ma_cong_viec=ma_cong_viec)
    if not ok:
        raise HTTPException(status_code=404, detail="Công việc không có trong bảng theo dõi này")
    return {"message": "Đã gỡ công việc khỏi bảng theo dõi thành công"}


@router.post("/{board_id}/sync")
def sync_board_tasks(board_id: int, db: Session = Depends(get_db)):
    """Synchronize tasks for a tracking board based on its configured loai_cong_viec."""
    try:
        added_count = sync_board_tasks_by_type(db, board_id=board_id)
        return {
            "board_id": board_id,
            "added_count": added_count,
            "message": f"Đã đồng bộ thành công, thêm {added_count} công việc mới vào bảng theo dõi"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

