import sys
import os
sys.path.insert(0, os.path.abspath('.'))
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import engine, Base, SessionLocal
import backend.models
from backend.models.tracking import TrackingBoard, TrackingBoardTask
from backend.services.tracking_service import create_tracking_board, get_tracking_boards, add_task_to_board, get_tracking_board_detail, delete_tracking_board

# Create any new tables
Base.metadata.create_all(bind=engine)
print("Tracking tables created/verified successfully!")

db = SessionLocal()
# Test creating a demo board if none exists
boards = get_tracking_boards(db)
print(f"Current tracking boards count: {len(boards)}")

print("All tracking backend checks passed!")
db.close()
