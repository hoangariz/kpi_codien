from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from backend.database import Base


class DeviceRecall(Base):
    __tablename__ = "device_recalls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    so_thue_bao = Column(String(100), nullable=False, index=True)
    dich_vu = Column(String(100), nullable=True, index=True)
    dia_chi_khach_hang = Column(Text, nullable=True)
    muc_thue_bao = Column(String(50), nullable=True)
    muc_thiet_bi = Column(String(50), nullable=True)
    tong_tbi_phai_thu = Column(Integer, nullable=True, default=0)
    loai_thiet_bi = Column(String(50), nullable=True)  # '0' (thường) hoặc 'MESH'
    tuoi_tho_mesh = Column(String(50), nullable=True)
    so_tbi_mesh_phai_thu = Column(String(50), nullable=True)
    cum_xa = Column(String(100), nullable=False, index=True)  # Trung tâm Cụm xã (e.g. HTH-007-SGG)
    ten_ft = Column(String(150), nullable=False, index=True)  # Tên FT (e.g. Đoàn Mạnh Tiến)
    ma_nv = Column(String(50), nullable=True, index=True)      # MNV (e.g. 218964)
    import_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# Composite indices for fast querying by cluster and FT
Index("idx_device_recalls_cum_ft", DeviceRecall.cum_xa, DeviceRecall.ten_ft)
Index("idx_device_recalls_cum_loai", DeviceRecall.cum_xa, DeviceRecall.loai_thiet_bi)
