from datetime import datetime, timezone
from typing import Optional, List, Union
from pydantic import BaseModel, ConfigDict, field_serializer


class FixedWoSummary(BaseModel):
    total: int = 0
    closed: int = 0
    pending: int = 0
    overdue: int = 0
    closed_today: int = 0
    closed_last_7_days: int = 0
    cho_cd_tiep_nhan: int = 0
    ft_hoan_thanh: int = 0
    completion_rate: float = 0.0


class FixedWoBreakdownItem(BaseModel):
    id: Optional[int] = None
    key_name: str
    is_other: bool = False
    total: int = 0
    closed: int = 0
    pending: int = 0
    overdue: int = 0
    closed_today: int = 0
    closed_last_7_days: int = 0
    cho_cd_tiep_nhan: int = 0
    ft_hoan_thanh: int = 0
    tu_choi: int = 0
    ft_tu_choi: int = 0
    cd_tu_choi: int = 0
    overdue_tu_choi: int = 0
    completion_rate: float = 0.0
    dong: int = 0
    da_giao_ft: int = 0
    ft_dang_thuc_hien: int = 0
    other: int = 0


class FixedWoReportCreate(BaseModel):
    name: str
    description: Optional[str] = None
    wo_codes: Optional[Union[List[str], str]] = []


class FixedWoReportUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    wo_codes: Optional[Union[List[str], str]] = None  # If given, replaces all WOs
    wo_codes_to_add: Optional[Union[List[str], str]] = None
    wo_codes_to_remove: Optional[Union[List[str], str]] = None


class FixedWoReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    total_wos: int = 0
    matched_wos: int = 0
    summary: Optional[FixedWoSummary] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime, _info):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    @field_serializer("updated_at")
    def serialize_updated_at(self, dt: datetime, _info):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class FixedWoStatsResponse(BaseModel):
    report_id: int
    name: str
    description: Optional[str] = None
    active_month: str
    total_wos: int = 0
    matched_wos: int = 0
    unmatched_wos: int = 0
    summary: FixedWoSummary
    by_employee: List[FixedWoBreakdownItem] = []
    by_group: List[FixedWoBreakdownItem] = []
