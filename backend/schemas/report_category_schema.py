from typing import Optional, List
from datetime import datetime
import json
from pydantic import BaseModel, field_validator


class ReportCategorySummary(BaseModel):
    total: int = 0
    closed: int = 0
    pending: int = 0
    overdue: int = 0
    completion_rate: float = 0.0


class ReportSubCategoryBase(BaseModel):
    name: str
    keyword: str
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class ReportSubCategoryCreate(ReportSubCategoryBase):
    pass


class ReportSubCategoryUpdate(BaseModel):
    name: Optional[str] = None
    keyword: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class ReportSubCategoryResponse(ReportSubCategoryBase):
    id: int
    category_id: int
    summary: Optional[ReportCategorySummary] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReportCategoryCreate(BaseModel):
    name: str
    loai_cong_viec: str = ""
    description: Optional[str] = None
    icon: Optional[str] = None
    exclude_closed_prior_months: bool = True
    sort_order: Optional[int] = 0
    # Multi-filter fields
    filter_mode: Optional[str] = "by_loai"   # "by_loai" | "by_system"
    filter_values: Optional[List[str]] = []   # list of selected values
    domain: Optional[str] = "codien"         # "codien" | "codinh"


class ReportCategoryUpdate(BaseModel):
    name: Optional[str] = None
    loai_cong_viec: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    exclude_closed_prior_months: Optional[bool] = None
    sort_order: Optional[int] = None
    # Multi-filter fields
    filter_mode: Optional[str] = None
    filter_values: Optional[List[str]] = None
    domain: Optional[str] = None


class ReportCategoryResponse(BaseModel):
    id: int
    name: str
    loai_cong_viec: str
    description: Optional[str] = None
    icon: Optional[str] = None
    is_default: bool = False
    exclude_closed_prior_months: bool = True
    sort_order: int = 0
    # Multi-filter fields
    filter_mode: str = "by_loai"
    filter_values: List[str] = []
    domain: str = "codien"
    summary: Optional[ReportCategorySummary] = None
    sub_categories: List[ReportSubCategoryResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator("filter_values", mode="before")
    @classmethod
    def parse_filter_values(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(x) for x in parsed]
                return [v] if v else []
            except Exception:
                return [v] if v else []
        elif isinstance(v, list):
            return [str(x) for x in v]
        return []

    class Config:
        from_attributes = True

