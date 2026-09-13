from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from backend.database import Base


class TaskNote(Base):
    __tablename__ = "task_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ma_cong_viec = Column(String(100), ForeignKey("tasks.ma_cong_viec"), index=True, nullable=False)
    note_content = Column(Text, nullable=False)
    created_by = Column(String(100), default="User", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    task = relationship("Task", back_populates="notes")


Index("idx_notes_task_created", TaskNote.ma_cong_viec, TaskNote.created_at)
