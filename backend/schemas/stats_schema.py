from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class KPIOverview(BaseModel):
    total_tasks: int
    in_progress_count: int
    completed_count: int
    overdue_count: int
    completion_rate: float
    total_groups: int
    total_employees: int
    maintenance_total: int  # Specifically for "Bảo dưỡng cứng cơ điện điều hòa..."
    tu_choi_count: int = 0
    ft_tu_choi_count: int = 0
    cd_tu_choi_count: int = 0
    overdue_tu_choi_count: int = 0
    ft_hoan_thanh_count: int = 0
    cho_cd_tiep_nhan_count: int = 0


class StatusBreakdown(BaseModel):
    status: str
    count: int


class GroupStatItem(BaseModel):
    group_id: Optional[int] = None
    group_name: str
    total: int
    completed: int
    in_progress: int
    overdue: int
    other: int
    completion_rate: float


class EmployeeStatItem(BaseModel):
    employee_id: Optional[int] = None
    employee_name: str
    group_name: Optional[str] = None
    total: int
    completed: int
    in_progress: int
    overdue: int
    other: int
    completion_rate: float


class MaintenanceStatItem(BaseModel):
    key_name: str  # Tên nhân viên hoặc tên nhóm/cụm
    id: Optional[int] = None
    is_other: bool = False  # True nếu là dòng "Khác (Chưa gán/Chưa phân cụm)"
    total: int             # Tổng cộng
    closed: int            # Đóng (hoàn thành)
    pending: int           # Tồn (chưa đóng)
    overdue: int           # Quá hạn
    closed_today: int      # Đóng hôm nay
    closed_last_7_days: int # Đóng tuần vừa qua
    completion_rate: float # Tỉ lệ đóng (%)

    # Tương thích ngược & thống kê trạng thái chi tiết
    dong: int = 0
    da_giao_ft: int = 0
    ft_dang_thuc_hien: int = 0
    cho_cd_tiep_nhan: int = 0
    ft_hoan_thanh: int = 0
    tu_choi: int = 0
    ft_tu_choi: int = 0
    cd_tu_choi: int = 0
    overdue_tu_choi: int = 0
    other: int = 0


class MaintenanceSpecialResponse(BaseModel):
    target_task_type: str
    active_month: str
    total_valid_records: int
    excluded_closed_prior_months: int
    summary: Dict[str, Any]
    by_employee: List[MaintenanceStatItem]
    by_group: List[MaintenanceStatItem]
    sub_categories: Optional[List[Dict[str, Any]]] = []
    sub_categories_stats: Optional[List[Dict[str, Any]]] = []


class TimelineItem(BaseModel):
    date: str
    created_count: int
    completed_count: int


class OverdueSummary(BaseModel):
    total_overdue: int
    by_group: List[Dict[str, Any]]
    by_employee: List[Dict[str, Any]]
