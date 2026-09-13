from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


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
    loai_cong_viec: str
    description: Optional[str] = None
    icon: Optional[str] = None
    exclude_closed_prior_months: bool = True
    sort_order: Optional[int] = 0


class ReportCategoryUpdate(BaseModel):
    name: Optional[str] = None
    loai_cong_viec: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    exclude_closed_prior_months: Optional[bool] = None
    sort_order: Optional[int] = None


class ReportCategoryResponse(BaseModel):
    id: int
    name: str
    loai_cong_viec: str
    description: Optional[str] = None
    icon: Optional[str] = None
    is_default: bool = False
    exclude_closed_prior_months: bool = True
    sort_order: int = 0
    summary: Optional[ReportCategorySummary] = None
    sub_categories: List[ReportSubCategoryResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

