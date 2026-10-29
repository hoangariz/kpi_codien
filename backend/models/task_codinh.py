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
    thoi_diem_bat_dau_thuc_hien = Column(DateTime, nullable=True, index=True)
    thoi_diem_yeu_cau_ket_thuc = Column(DateTime, nullable=True, index=True)
    thoi_gian_con_lai = Column(Float, nullable=True)
    thoi_diem_ft_hoan_thanh = Column(DateTime, nullable=True)
    thoi_diem_cd_dong = Column(DateTime, nullable=True)
    muc_do_uu_tien = Column(String(100), nullable=True)
    is_su_co = Column(Integer, default=0, nullable=False, index=True)
    is_hot = Column(Integer, default=0, nullable=False, index=True)
    is_tam_dung = Column(Integer, default=0, nullable=False, index=True)
    is_open = Column(Integer, default=1, nullable=False, index=True)
    closed_time = Column(DateTime, nullable=True, index=True)
    thoi_gian_con_lai_num = Column(Float, nullable=True)
    is_soc_mat_tin_hieu = Column(Integer, default=0, nullable=False, index=True)
    is_ho_tro_dich_vu = Column(Integer, default=0, nullable=False, index=True)
    import_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_codinh_tasks_loai", "loai_cong_viec"),
        Index("idx_codinh_tasks_status", "trang_thai"),
        Index("idx_codinh_tasks_nhom", "nhom"),
        Index("idx_codinh_tasks_nhan_vien", "nhan_vien"),
        Index("idx_codinh_tasks_he_thong", "he_thong"),
        Index("idx_codinh_tasks_is_su_co", "is_su_co"),
        Index("idx_codinh_tasks_is_hot", "is_hot"),
        Index("idx_codinh_tasks_is_tam_dung", "is_tam_dung"),
        Index("idx_codinh_tasks_is_open", "is_open"),
        Index("idx_codinh_tasks_closed_time", "closed_time"),
        Index("idx_codinh_tasks_is_soc_mat_tin_hieu", "is_soc_mat_tin_hieu"),
        Index("idx_codinh_tasks_is_ho_tro_dich_vu", "is_ho_tro_dich_vu"),
    )
