from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from backend.database import Base


class TaskHistory(Base):
    __tablename__ = "task_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ma_cong_viec = Column(String(100), ForeignKey("tasks.ma_cong_viec"), index=True, nullable=False)
    field_changed = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    import_id = Column(Integer, ForeignKey("import_logs.id"), nullable=True)

    task = relationship("Task", back_populates="history")


Index("idx_history_task_changed", TaskHistory.ma_cong_viec, TaskHistory.changed_at)
