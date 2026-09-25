from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from backend.database import Base


class ReportCategory(Base):
    __tablename__ = "report_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    loai_cong_viec = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0)
    is_default = Column(Boolean, default=False)
    exclude_closed_prior_months = Column(Boolean, default=True, nullable=False)
    # Multi-filter support: 'by_loai' (lọc theo loai_cong_viec) | 'by_system' (lọc theo hệ thống)
    filter_mode = Column(String(20), default="by_loai", nullable=False)
    # JSON array string, VD: '["SPM", "ICMS"]' hoặc '["VCC_CD_LDTB Lắp đặt tủ nguồn DC"]'
    filter_values = Column(Text, nullable=True)
    # Phân hệ / domain: 'codien' (Cơ điện di động) | 'codinh' (Cố định băng rộng)
    domain = Column(String(50), default="codien", nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sub_categories = relationship(
        "ReportSubCategory",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="ReportSubCategory.sort_order.asc(), ReportSubCategory.id.asc()"
    )


class ReportSubCategory(Base):
    __tablename__ = "report_sub_categories"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("report_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    keyword = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("ReportCategory", back_populates="sub_categories")

    __table_args__ = (
        UniqueConstraint("category_id", "keyword", name="uq_cat_keyword"),
    )
