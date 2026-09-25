from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Index
from backend.database import Base


class TaskCodinh(Base):
    __tablename__ = "codinh_tasks"

    ma_cong_viec = Column(String(100), primary_key=True)
    ma_cong_viec_cha = Column(String(100), nullable=True, index=True)
    loai_cong_viec = Column(String(255), nullable=True, index=True)
    noi_dung_cong_viec = Column(Text, nullable=True)
    ghi_chu = Column(Text, nullable=True)
    trang_thai = Column(String(100), nullable=True, index=True)
    trang_thai_hoan_thanh = Column(String(100), nullable=True)
    he_thong = Column(String(100), nullable=True, index=True)
    nhan_vien = Column(String(255), nullable=True, index=True)   # FT / Assigned employee
    nhom = Column(String(255), nullable=True, index=True)        # Group / Cluster
    don_vi = Column(String(255), nullable=True)
    ma_tram = Column(String(100), nullable=True, index=True)     # Station code
    thoi_diem_tao = Column(DateTime, nullable=True, index=True)
    thoi_diem_yeu_cau_ket_thuc = Column(DateTime, nullable=True, index=True)
    thoi_gian_con_lai = Column(Float, nullable=True)
    thoi_diem_ft_hoan_thanh = Column(DateTime, nullable=True)
    thoi_diem_cd_dong = Column(DateTime, nullable=True)
    import_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_codinh_tasks_loai", "loai_cong_viec"),
        Index("idx_codinh_tasks_status", "trang_thai"),
        Index("idx_codinh_tasks_nhom", "nhom"),
        Index("idx_codinh_tasks_nhan_vien", "nhan_vien"),
        Index("idx_codinh_tasks_he_thong", "he_thong"),
    )
