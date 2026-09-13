from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship, foreign
from backend.database import Base


class TrackingBoard(Base):
    __tablename__ = "tracking_boards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    loai_cong_viec = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tasks = relationship("TrackingBoardTask", back_populates="board", cascade="all, delete-orphan")


class TrackingBoardTask(Base):
    __tablename__ = "tracking_board_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    board_id = Column(Integer, ForeignKey("tracking_boards.id", ondelete="CASCADE"), index=True, nullable=False)
    ma_cong_viec = Column(String(100), index=True, nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    note = Column(Text, nullable=True)

    board = relationship("TrackingBoard", back_populates="tasks")
    task = relationship(
        "Task",
        primaryjoin="foreign(TrackingBoardTask.ma_cong_viec) == Task.ma_cong_viec",
        lazy="joined",
        viewonly=True,
    )

    __table_args__ = (
        UniqueConstraint("board_id", "ma_cong_viec", name="uq_board_task"),
        Index("idx_tracking_board_task", "board_id", "ma_cong_viec"),
    )
