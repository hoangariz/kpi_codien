from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.database import Base


class FixedWoReport(Base):
    __tablename__ = "fixed_wo_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    items = relationship(
        "FixedWoItem",
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="FixedWoItem.id.asc()"
    )


class FixedWoItem(Base):
    __tablename__ = "fixed_wo_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(Integer, ForeignKey("fixed_wo_reports.id", ondelete="CASCADE"), index=True, nullable=False)
    ma_cong_viec = Column(String(100), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    report = relationship("FixedWoReport", back_populates="items")

    __table_args__ = (
        UniqueConstraint("report_id", "ma_cong_viec", name="uq_fixed_report_wo"),
        Index("idx_fixed_wo_report_wo", "report_id", "ma_cong_viec"),
    )
