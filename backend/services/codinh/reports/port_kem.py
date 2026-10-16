from backend.services.codinh.base import BaseReport
from backend.models.task_codinh import TaskCodinh


class PortKemReport(BaseReport):
    key: str = "port_kem"
    title: str = "ĐH Port Kém"
    description: str = "Báo cáo điều hành và xử lý port kém, Home wifi"
    task_type: str = "Chủ động xử lý port kém"
    has_cabinets: bool = False
    is_port_kem: bool = True
    exclude_closed_prior_months: bool = True

    def filter_tasks(self, q):
        return q.filter(TaskCodinh.loai_cong_viec == self.task_type)
