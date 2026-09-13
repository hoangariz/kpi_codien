from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Float, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from backend.database import Base


class Task(Base):
    __tablename__ = "tasks"

    ma_cong_viec = Column(String(100), primary_key=True)
    ma_cong_viec_cha = Column(String(100), nullable=True, index=True)
    task_type_id = Column(Integer, ForeignKey("task_types.id"), nullable=True, index=True)
    loai_cong_viec = Column(String(255), nullable=True, index=True)
    noi_dung_cong_viec = Column(Text, nullable=True)
    ghi_chu = Column(Text, nullable=True)
    trang_thai = Column(String(100), nullable=True, index=True)
    trang_thai_hoan_thanh = Column(String(100), nullable=True)
    system_id = Column(Integer, ForeignKey("systems.id"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    thoi_diem_tao = Column(DateTime, nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    assigned_to_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    loi = Column(String(255), nullable=True)  # Mức độ ưu tiên / Lỗi
    thoi_diem_bat_dau_thuc_hien = Column(DateTime, nullable=True)
    thoi_diem_yeu_cau_ket_thuc = Column(DateTime, nullable=True, index=True)
    thoi_gian_con_lai = Column(Float, nullable=True)
    thoi_diem_ft_hoan_thanh = Column(DateTime, nullable=True)
    thoi_diem_cd_dong = Column(DateTime, nullable=True)
    thoi_diem_ft_tiep_nhan = Column(DateTime, nullable=True)
    thue_bao = Column(String(255), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True, index=True)
    worklog = Column(Text, nullable=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True, index=True)
    ft_comment = Column(Text, nullable=True)
    ft_mobile = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_import_id = Column(Integer, ForeignKey("import_logs.id"), nullable=True)

    # Relationships
    employee_assigned = relationship("Employee", foreign_keys=[assigned_to_id], lazy="joined")
    employee_created = relationship("Employee", foreign_keys=[created_by_id], lazy="joined")
    group = relationship("Group", foreign_keys=[group_id], lazy="joined")
    system = relationship("SystemModel", foreign_keys=[system_id], lazy="joined")
    unit = relationship("Unit", foreign_keys=[unit_id], lazy="joined")
    station = relationship("Station", foreign_keys=[station_id], lazy="joined")
    task_type = relationship("TaskType", foreign_keys=[task_type_id], lazy="joined")

    history = relationship("TaskHistory", back_populates="task", cascade="all, delete-orphan")
    notes = relationship("TaskNote", back_populates="task", cascade="all, delete-orphan")


# Composite index for faster status & assignment queries
Index("idx_tasks_group_status", Task.group_id, Task.trang_thai)
Index("idx_tasks_assigned_status", Task.assigned_to_id, Task.trang_thai)
Index("idx_tasks_loai_group", Task.loai_cong_viec, Task.group_id)
Index("idx_tasks_loai_assigned", Task.loai_cong_viec, Task.assigned_to_id)
