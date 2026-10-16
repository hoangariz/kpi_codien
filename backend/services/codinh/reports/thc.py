from backend.services.codinh.base import BaseReport
from backend.models.task_codinh import TaskCodinh


class ThcReport(BaseReport):
    key: str = "thc"
    title: str = "Bảo Dưỡng Tủ Hộp Cáp (THC)"
    description: str = "Báo cáo tiến độ bảo dưỡng tủ hộp cáp theo WO và tủ con"
    task_type: str = "ICMS_Bảo dưỡng THC"
    has_cabinets: bool = True
    is_port_kem: bool = False
    exclude_closed_prior_months: bool = True

    def filter_tasks(self, q):
        # Match 'ICMS_Bảo dưỡng THC' or tasks with 'bảo dưỡng thc'
        return q.filter(TaskCodinh.loai_cong_viec == self.task_type)
