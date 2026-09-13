from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class TrackingBoardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    loai_cong_viec: Optional[str] = None
    task_codes: Optional[List[str]] = None
    note: Optional[str] = None


class TrackingBoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    loai_cong_viec: Optional[str] = None
    task_codes_to_add: Optional[List[str]] = None
    note: Optional[str] = None


class TrackingBoardTaskAdd(BaseModel):
    ma_cong_viec: str
    note: Optional[str] = None


class TrackingBoardTaskNoteUpdate(BaseModel):
    note: str


class TrackingBoardBulkAdd(BaseModel):
    ma_cong_viec_list: List[str]
    note: Optional[str] = None


class TrackingBoardTaskItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    board_id: int
    ma_cong_viec: str
    added_at: datetime
    note: Optional[str] = None
    loai_cong_viec: Optional[str] = None
    trang_thai: Optional[str] = None
    employee_assigned_name: Optional[str] = None
    group_name: Optional[str] = None
    thoi_diem_yeu_cau_ket_thuc: Optional[datetime] = None
    thoi_gian_con_lai: Optional[float] = None
    station_code: Optional[str] = None
    latest_note: Optional[str] = None


class TrackingBoardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    loai_cong_viec: Optional[str] = None
    task_count: int = 0
    created_at: datetime
    updated_at: datetime


class TrackingBoardDetailResponse(TrackingBoardResponse):
    tasks: List[TrackingBoardTaskItem] = []
