import sys
from backend.database import SessionLocal
from backend.services.tracking_service import (
    create_tracking_board,
    get_tracking_boards,
    get_tracking_board_detail,
    add_task_to_board,
    remove_task_from_board,
    delete_tracking_board
)
from backend.services.task_service import add_task_note, get_tasks_paginated
from backend.services.stats_service import get_special_maintenance_stats, get_special_maintenance_tasks
from backend.models.task import Task

def run_tests():
    db = SessionLocal()
    try:
        # 1. Check an existing task
        task = db.query(Task).first()
        if not task:
            print("No tasks in DB to test with.")
            return

        ma_cv = task.ma_cong_viec
        print(f"Testing with task: {ma_cv}")

        # 2. Add a note to this task
        note_content = "Test Ghi Chú Tự Động 123"
        add_task_note(db, ma_cv, note_content, "Admin")
        print("Added note successfully.")

        # 3. Check if get_tasks or get_special_maintenance_tasks returns latest_note
        res = get_special_maintenance_tasks(db, search=ma_cv)
        found = False
        for item in res["items"]:
            if item.ma_cong_viec == ma_cv:
                found = True
                print(f"Task found in maintenance tasks. latest_note = '{item.latest_note}'")
                assert item.latest_note == note_content, f"Expected note '{note_content}', got '{item.latest_note}'"
                break
        if not found:
            print("Note: Task not in active maintenance report, checking general get_tasks...")
            res_all = get_tasks_paginated(db, search=ma_cv)
            for item in res_all["items"]:
                if item.ma_cong_viec == ma_cv:
                    print(f"Task in general list. latest_note = '{item.latest_note}'")
                    assert item.latest_note == note_content
                    break

        # 4. Create a test tracking board
        board_name = "Bảng Tồn Tháng 8 Test"
        board = create_tracking_board(db, board_name, "Bảng theo dõi kiểm tra tự động")
        print(f"Created board: id={board.id}, name='{board.name}'")

        # 5. Add task to tracking board
        added = add_task_to_board(db, board.id, ma_cv, note="Theo dõi gấp")
        print(f"Added task to board: id={added.id}, ma_cv={added.ma_cong_viec}")

        # 6. Get board detail
        detail = get_tracking_board_detail(db, board.id)
        print(f"Board detail task count: {detail['task_count']}")
        assert detail["task_count"] == 1
        assert detail["tasks"][0]["ma_cong_viec"] == ma_cv

        # 7. Get stats filtered by board
        board_stats = get_special_maintenance_stats(db, board_id=board.id)
        print(f"Board stats total_valid_records: {board_stats['total_valid_records']}")
        board_tasks = get_special_maintenance_tasks(db, board_id=board.id)
        print(f"Board drilldown tasks total: {board_tasks['total']}")
        assert board_tasks["total"] == board_stats["total_valid_records"]

        # 8. Clean up test tracking board
        delete_tracking_board(db, board.id)
        print("Cleaned up test board.")

        print("\nALL TRACKING & NOTES BACKEND TESTS PASSED SUCCESSFULLY!")
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
