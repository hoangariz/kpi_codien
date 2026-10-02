from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from sqlalchemy.orm import relationship, foreign
from backend.database import Base


class TaskNote(Base):
    __tablename__ = "task_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ma_cong_viec = Column(String(100), index=True, nullable=False)
    note_content = Column(Text, nullable=False)
    created_by = Column(String(100), default="User", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    task = relationship(
        "Task",
        primaryjoin="foreign(TaskNote.ma_cong_viec) == Task.ma_cong_viec",
        back_populates="notes",
        lazy="select",
        viewonly=True,
    )


Index("idx_notes_task_created", TaskNote.ma_cong_viec, TaskNote.created_at)
