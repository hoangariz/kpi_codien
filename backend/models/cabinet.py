from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from backend.database import Base


class Cabinet(Base):
    __tablename__ = "cabinets"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("report_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    ma_wo = Column(String(100), nullable=False, index=True)
    ma_doi_tuong = Column(String(150), nullable=False, index=True)  # Mã tủ hộp cáp (THC)
    ma_tram = Column(String(100), nullable=True, index=True)        # Mã trạm của THC
    quoc_gia = Column(String(100), nullable=True)
    khu_vuc = Column(String(100), nullable=True)
    tinh = Column(String(100), nullable=True)
    trang_thai_wo = Column(String(100), nullable=True)
    trang_thai_thc = Column(String(100), nullable=True)             # 'Đã hoàn thành bảo dưỡng', 'Đang thực hiện bảo dưỡng'...
    import_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_cabinet_wo_doi_tuong", "ma_wo", "ma_doi_tuong"),
        Index("idx_cabinet_wo", "ma_wo"),
        Index("idx_cabinet_doi_tuong", "ma_doi_tuong"),
        Index("idx_cabinet_tram", "ma_tram"),
    )
