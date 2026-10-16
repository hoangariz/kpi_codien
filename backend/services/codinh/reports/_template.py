"""
Template mẫu để bổ sung báo cáo mới cho phân hệ Cố Định Băng Rộng (CĐBR).

Các bước thêm một báo cáo mới:
1. Tạo file mới trong thư mục backend/services/codinh/reports/ (ví dụ: my_report.py).
2. Kế thừa từ BaseReport và định nghĩa các thuộc tính:
   - key: mã định danh duy nhất (url-friendly, ví dụ: "my_report")
   - title: Tên hiển thị của báo cáo
   - description: Mô tả ngắn gọn
   - task_type: Tên loại công việc trong cột `loai_cong_viec` của codinh_tasks
   - has_cabinets: True nếu báo cáo có liên kết với bảng cabinets (tủ THC con)
   - is_port_kem: True nếu báo cáo phân loại theo Home wifi / Port kém
3. Đăng ký báo cáo mới vào backend/services/codinh/registry.py trong từ điển `REPORTS`.
4. Tạo file component frontend tương ứng trong frontend/src/pages/codinh/reports/ (ví dụ: MyReportTable.jsx)
   và đăng ký vào frontend/src/pages/codinh/reports/index.js.
"""

from backend.services.codinh.base import BaseReport
from backend.models.task_codinh import TaskCodinh


class TemplateReport(BaseReport):
    key: str = "template_report"
    title: str = "Tên Báo Cáo Mới"
    description: str = "Mô tả báo cáo mới"
    task_type: str = "Tên Loại Công Việc Trong DB"
    has_cabinets: bool = False
    is_port_kem: bool = False
    exclude_closed_prior_months: bool = True

    def filter_tasks(self, q):
        # Tùy biến bộ lọc nếu cần
        return q.filter(TaskCodinh.loai_cong_viec == self.task_type)
