from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, Index
from backend.database import Base


class TaskQlctkt(Base):
    __tablename__ = "qlctkt_tasks"

    task_id = Column(String(100), primary_key=True)
    loai_yeu_cau = Column(String(255), nullable=True)
    dich_vu = Column(String(255), nullable=True)
    account = Column(String(255), nullable=True)
    ten_khach_hang = Column(String(255), nullable=True)
    dia_chi_lap_dat = Column(Text, nullable=True)
    to_doi_raw = Column(String(255), nullable=True)
    nv_thuc_hien = Column(String(255), nullable=True)
    nv_key = Column(String(255), nullable=True, index=True)
    tram = Column(String(100), nullable=True)
    tien_do = Column(String(100), nullable=True, index=True)
    ngay_tao = Column(DateTime, nullable=True, index=True)
    ngay_giao = Column(DateTime, nullable=True)
    ngay_ket_thuc_du_kien = Column(DateTime, nullable=True)
    ngay_cap_nhat = Column(DateTime, nullable=True)
    ngay_ket_thuc_thuc_te = Column(DateTime, nullable=True, index=True)
    so_gio_ton = Column(Float, nullable=True)
    ghi_chu_dau_moi = Column(Text, nullable=True)
    ly_do_tich_huy = Column(Text, nullable=True)
    ngay_tich_huy = Column(String(100), nullable=True)
    tich_hen = Column(String(255), nullable=True)
    trang_thai_gpon = Column(String(255), nullable=True)
    import_id = Column(Integer, nullable=True, index=True)
    import_filename = Column(String(255), nullable=True)

    # Precomputed flags at import time
    is_huy = Column(Boolean, default=False, nullable=False, index=True)
    is_duong_day_moi = Column(Boolean, default=False, nullable=False)
    is_tich_hen_ok = Column(Boolean, default=False, nullable=False)
    cmtasktypename = Column(String(255), nullable=True)
    is_cskh_2022 = Column(Boolean, default=False, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_qlctkt_nv_key", "nv_key"),
        Index("idx_qlctkt_tien_do", "tien_do"),
        Index("idx_qlctkt_ngay_tao", "ngay_tao"),
        Index("idx_qlctkt_ngay_kt_tt", "ngay_ket_thuc_thuc_te"),
        Index("idx_qlctkt_is_huy", "is_huy"),
        Index("idx_qlctkt_is_cskh", "is_cskh_2022"),
    )
