from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class NoteCreate(BaseModel):
    note_content: str
    created_by: Optional[str] = "User"


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ma_cong_viec: str
    note_content: str
    created_by: str
    created_at: datetime


class HistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ma_cong_viec: str
    field_changed: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    changed_at: datetime
    import_id: Optional[int] = None


class TaskListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ma_cong_viec: str
    ma_cong_viec_cha: Optional[str] = None
    loai_cong_viec: Optional[str] = None
    noi_dung_cong_viec: Optional[str] = None
    ghi_chu: Optional[str] = None
    trang_thai: Optional[str] = None
    trang_thai_hoan_thanh: Optional[str] = None
    thoi_diem_tao: Optional[datetime] = None
    thoi_diem_bat_dau_thuc_hien: Optional[datetime] = None
    thoi_diem_yeu_cau_ket_thuc: Optional[datetime] = None
    thoi_gian_con_lai: Optional[float] = None
    thoi_diem_ft_hoan_thanh: Optional[datetime] = None
    thoi_diem_cd_dong: Optional[datetime] = None
    thue_bao: Optional[str] = None
    loi: Optional[str] = None
    
    # Resolved names from dimensions
    assigned_to_id: Optional[int] = None
    group_id: Optional[int] = None
    employee_assigned_name: Optional[str] = None
    employee_created_name: Optional[str] = None
    group_name: Optional[str] = None
    system_name: Optional[str] = None
    unit_name: Optional[str] = None
    station_code: Optional[str] = None
    
    # Counts & notes
    note_count: int = 0
    history_count: int = 0
    latest_note: Optional[str] = None


class TaskDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ma_cong_viec: str
    ma_cong_viec_cha: Optional[str] = None
    task_type_id: Optional[int] = None
    loai_cong_viec: Optional[str] = None
    noi_dung_cong_viec: Optional[str] = None
    ghi_chu: Optional[str] = None
    trang_thai: Optional[str] = None
    trang_thai_hoan_thanh: Optional[str] = None
    system_id: Optional[int] = None
    created_by_id: Optional[int] = None
    thoi_diem_tao: Optional[datetime] = None
    group_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    loi: Optional[str] = None
    thoi_diem_bat_dau_thuc_hien: Optional[datetime] = None
    thoi_diem_yeu_cau_ket_thuc: Optional[datetime] = None
    thoi_gian_con_lai: Optional[float] = None
    thoi_diem_ft_hoan_thanh: Optional[datetime] = None
    thoi_diem_cd_dong: Optional[datetime] = None
    thoi_diem_ft_tiep_nhan: Optional[datetime] = None
    thue_bao: Optional[str] = None
    unit_id: Optional[int] = None
    worklog: Optional[str] = None
    station_id: Optional[int] = None
    ft_comment: Optional[str] = None
    ft_mobile: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_import_id: Optional[int] = None

    # Joined dimension names
    employee_assigned_name: Optional[str] = None
    employee_created_name: Optional[str] = None
    group_name: Optional[str] = None
    system_name: Optional[str] = None
    unit_name: Optional[str] = None
    station_code: Optional[str] = None

    history: List[HistoryResponse] = []
    notes: List[NoteResponse] = []


class PaginatedTasksResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    items: List[TaskListItem]
