# Hệ Thống Thống Kê & Theo Dõi Tiến Độ Công Việc Cơ Điện & Cố Định Băng Rộng (VCC)

Hệ thống quản lý và phân tích KPI chuyên dụng theo dõi tiến độ công việc định kỳ từ các file Excel dữ liệu nguồn dung lượng lớn (20.000 – 100.000+ dòng). Hệ thống bao gồm hai phân hệ chính: **Cơ Điện Di Động** và **Cố Định Băng Rộng (CĐBR - Tủ Hộp Cáp THC & Thu Hồi Thiết Bị)**.

---

## 🚀 Cách Khởi Chạy Nhanh (1-Click)

Chỉ cần **nhấp đúp chuột vào file:**
👉 **`run.bat`**

File script tự động thực hiện:
1. Nạp và đồng bộ dữ liệu ban đầu từ `demofile.xlsx` vào cơ sở dữ liệu (tự động lọc bỏ dữ liệu SPM/SPM_VTNET nếu có).
2. Tự động kiểm tra và cài đặt thư viện frontend nếu chưa có.
3. Khởi động Backend FastAPI trên cổng 8000 (`http://localhost:8000`).
4. Khởi động Giao diện Frontend React Vite trên cổng 3000 (`http://localhost:3000`).
5. Tự động bật trình duyệt web tới địa chỉ: **`http://localhost:3000`**

---

## 🌐 Triển Khai Lên Máy Chủ aaPanel (Production)

Xem tài liệu hướng dẫn từng bước chi tiết tại:
👉 **[deployment/AAPANEL_DEPLOY.md](deployment/AAPANEL_DEPLOY.md)**

---

## 🌟 Các Phân Hệ & Tính Năng Chính

### 1. Phân Hệ Cơ Điện (Mobile / BTS Maintenance)
- **Dashboard Tổng Quan**:
  - Thẻ số liệu KPI thời gian thực: Tổng việc, Đang thực hiện, Đã đóng, Quá hạn, Tỷ lệ hoàn thành.
  - **Khung bảng theo dõi trọng điểm (High-Priority Boards)**: Ghim các bảng theo dõi đặc biệt lên đầu Dashboard.
  - **Báo cáo chuyên biệt Bảo Dưỡng Cơ Điện ICMS**: Thống kê loại công việc *"Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS"* theo **Nhân viên thực hiện** và **Nhóm điều phối**.
  - **Bảng ma trận hoàn thành ngày 1 đến 31**: Theo dõi chi tiết tiến độ từng ngày trong tháng, số việc hoàn thành hôm nay, hoàn thành 7 ngày qua.
  - **Tự động loại bỏ công việc đã đóng tháng trước**: Dựa theo cấu hình tháng làm việc tại trang Quản trị.
  - **Đầu việc con gắn từ khóa**: Tự động phân tách danh mục mẹ thành các bảng con (ví dụ: Bảo dưỡng điều hòa, Máy phát điện, Thông gió lọc bụi) và bảng tự động gom "Còn lại / Khác".
  - **Biểu đồ phân bổ & Xu hướng ngày**: Biểu đồ Recharts xu hướng tiến độ và khối lượng công việc.

### 2. Phân Hệ Cố Định Băng Rộng (CĐBR & Tủ Hộp Cáp THC)
- **Quản lý WO CĐBR**: Bảng công việc riêng biệt theo dõi tiến độ theo Nhân viên FT và Cụm điều phối.
- **Tiến độ Tủ Hộp Cáp (THC)**: Nhập danh sách tủ cáp con theo mã WO, theo dõi tỷ lệ hoàn thành, tồn, quá hạn của từng tủ cáp.
- **Chỉ số KPI thời gian cam kết**: Thống kê số lượng hoàn thành trong 24h, hoàn thành trong 72h; số lượng tồn đọng dưới 24h và dưới 72h.
- **Bảng chuyên biệt Điều hòa / Port kém**: Phân tích riêng các WO phản ánh "Home Wifi thu kém" và "Port kém GPON".
- **Modal Drilldown Tủ Cáp**: Click vào bất kỳ số liệu nào để mở popup danh sách WO kèm toàn bộ danh sách Tủ THC con bên trong.

### 3. Phân Hệ Thu Hồi Thiết Bị Khách Hàng (FT Device Recall)
- **Nạp file danh sách thu hồi**: Nhập file văn bản `.txt` định kỳ hàng tháng.
- **Phân nhóm thông minh**: Lọc danh sách theo từng **Trung tâm Cụm xã** và **Nhân viên FT** phụ trách.
- **Phân loại thiết bị**: Tách bạch Modem thường và Thiết bị Mesh, hiển thị tuổi thọ Mesh.
- **Nút 1-click Copy**: Sao chép nhanh số thuê bao để tra cứu trên hệ thống quản lý thuê bao.
- **Xuất file CSV chuẩn Tiếng Việt**: Xuất file CSV định dạng UTF-8 BOM (`utf-8-sig`) mở trực tiếp trên Excel không bị lỗi font.

### 4. Báo Cáo Theo Danh Sách WO Cố Định (Fixed WO Reports)
- Cho phép tạo các bộ báo cáo tuỳ chỉnh bằng cách dán trực tiếp danh sách mã WO (hỗ trợ phân cách bằng dòng mới, dấu phẩy, khoảng trắng).
- Kiểm tra ngay tỷ lệ mã WO khớp với dữ liệu hệ thống hiện tại.
- Tự động sinh bảng tính ma trận ngày 1-31, hoàn thành theo nhân viên và nhóm điều phối riêng cho danh sách WO này.

### 5. Bảng Theo Dõi Tiến Độ Tuỳ Chỉnh (Custom Tracking Boards)
- Tạo bảng theo dõi tiến độ theo nhu cầu nghiệp vụ (ví dụ: việc trọng điểm tuần, xử lý tồn...).
- Hỗ trợ gán công việc thủ công hoặc cấu hình `loai_cong_viec` để tự động đồng bộ việc mới khi import dữ liệu.

### 6. Tra Cứu Nâng Cao & Ghi Chú Nghiệp Vụ
- **Bộ lọc đa chiều**: Lọc theo từ khóa, nhóm điều phối, nhân viên, trạng thái, hệ thống, loại việc, quá hạn, khoảng thời gian.
- **Gợi ý nhanh FT**: Chip gợi ý các tài khoản FT hay dùng.
- **Ghi chú vĩnh viễn (Permanent Notes)**: Ghi chú lưu trong bảng riêng, được bảo toàn 100% không bị mất khi nạp đè file Excel mới.
- **Lịch sử biến động**: Tự động so khớp diff và lưu vết từng lần thay đổi trạng thái, nhân viên, thời hạn của công việc giữa các lần import.

### 7. Quản Trị Tải File & Cơ Chế Chunked Upload 8MB
- Upload file kéo thả trực quan kèm thanh tiến trình real-time.
- **Vượt giới hạn dung lượng Cloudflare**: Hỗ trợ cơ chế Chunked Upload (chia nhỏ file thành các phần 8MB), ghép trực tiếp trên máy chủ bằng offset `pwrite`.
- **Quản lý lịch sử nạp**: Lưu vết 50 lần import gần nhất, cho phép kích hoạt lại (nạp đè) từ file cũ hoặc xoá hẳn file trên đĩa để giải phóng bộ nhớ.

---

## 📁 BẢN ĐỒ CẤU TRÚC CODEBASE & DANH MỤC HÀM (FOR AI & DEVELOPERS)

> 💡 **LƯU Ý QUAN TRỌNG KHI PROMPT CHO AI:**
> Toàn bộ chi tiết kỹ thuật về kiểu dữ liệu, tham số và logic nghiệp vụ được lập chỉ mục đầy đủ tại file:
> 👉 **[`CODEBASE_INDEX.md`](CODEBASE_INDEX.md)**
> Khi prompt, bạn chỉ cần nhắc AI tham chiếu tới file này và file chức năng tương ứng!

### Sơ Đồ Ánh Xạ Chức Năng - File Code:

| Nghiệp vụ | Backend Router | Backend Service | Model liên quan | Frontend Page / Component |
|---|---|---|---|---|
| **KPI & Bảo Dưỡng Cơ Điện** | [router_stats.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_stats.py) | [stats_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/stats_service.py) | `Task`, `ReportCategory` | [DashboardPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/DashboardPage.jsx), [MaintenanceSpreadsheetTable.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/components/MaintenanceSpreadsheetTable.jsx) |
| **Cố Định Băng Rộng (CĐBR)** | [router_codinh.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_codinh.py) | [codinh_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/codinh_service.py) | `TaskCodinh`, `Cabinet` | [CodinhPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/CodinhPage.jsx), [AdminCodinhPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminCodinhPage.jsx), [CodinhDrilldownModal.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/components/CodinhDrilldownModal.jsx) |
| **Thu Hồi Thiết Bị FT** | [router_device_recall.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_device_recall.py) | [device_recall_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/device_recall_service.py) | `DeviceRecall` | [ThuHoiThietBiPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/ThuHoiThietBiPage.jsx) |
| **Báo Cáo WO Cố Định** | [router_fixed_wo.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_fixed_wo.py) | [fixed_wo_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/fixed_wo_service.py) | `FixedWoReport`, `FixedWoItem` | [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `fixed_wo`), [DashboardPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/DashboardPage.jsx) |
| **Upload Excel 8MB & ETL** | [router_imports.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_imports.py) | [etl_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/etl_service.py) | `ImportLog`, `Task` | [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `files`) |
| **Bảng Theo Dõi Tiến Độ** | [router_tracking.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_tracking.py) | [tracking_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/tracking_service.py) | `TrackingBoard`, `TrackingBoardTask` | [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `boards`), [HighPriorityBoardSection.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/components/dashboard/HighPriorityBoardSection.jsx) |
| **Danh Mục Báo Cáo Động** | [router_report_categories.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_report_categories.py) | [report_category_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/report_category_service.py) | `ReportCategory`, `ReportSubCategory`| [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `categories`) |
| **Tra Cứu Nâng Cao & Ghi Chú**| [router_tasks.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_tasks.py) | [task_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/task_service.py) | `Task`, `TaskNote`, `TaskHistory` | [SearchPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/SearchPage.jsx), [TaskDetailModal.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/components/TaskDetailModal.jsx) |
| **Cài Đặt Tháng Báo Cáo** | [router_settings.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_settings.py) | [settings_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/settings_service.py) | `SystemSetting` | [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `month`) |
| **Ánh Xạ Tên Nhân Viên** | — | [user_mapping.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/user_mapping.py) | — | [userMapping.js](file:///e:/CodeVCC2/KpiCoDien/frontend/src/utils/userMapping.js) |

---

## 🛠️ CÁC HÀM CỐT LÕI CẦN BIẾT THEO TỪNG FILE

### 1. `backend/services/stats_service.py`:
- `get_kpi_overview(db)`: Tính thẻ số liệu KPI tổng quan.
- `get_special_maintenance_stats(db, target_type, target_month, board_id, exclude_tu_choi)`: Tính ma trận hoàn thành từ ngày 1 đến 31 của tháng cho báo cáo bảo dưỡng theo nhân viên và nhóm điều phối.
- `get_special_maintenance_tasks(db, ...)`: Trả về danh sách công việc khi người dùng click vào bất kỳ ô số liệu nào trên bảng ma trận bảo dưỡng.
- `get_stats_by_group(db, ...)`: Thống kê tổng hợp theo nhóm điều phối.
- `get_stats_by_employee(db, ...)`: Thống kê năng suất theo nhân viên.
- `get_timeline_stats(db, days)`: Xu hướng tạo/đóng việc N ngày gần nhất.

### 2. `backend/services/codinh_service.py`:
- `get_codinh_stats(db, category_id, target_month)`: Thống kê số liệu CĐBR (Tủ cáp THC, KPI 24h/72h, Tồn <24h/<72h, Phân tích Home wifi / Port kém). Có cache in-memory.
- `get_codinh_drilldown_tasks(db, ...)`: Drilldown công việc CĐBR kèm danh sách chi tiết các Tủ Hộp Cáp (THC) con.
- `import_codinh_wos_from_excel(db, file_path, filename, import_id)`: Nạp dữ liệu WO CĐBR vào bảng `codinh_tasks`.
- `import_cabinets_from_excel(db, file_path, filename, category_id)`: Nạp file danh sách Tủ Hộp Cáp (THC) vào bảng `cabinets`.
- `clear_codinh_stats_cache()`: Xóa cache thống kê CĐBR khi có dữ liệu mới.

### 3. `backend/services/etl_service.py`:
- `process_excel_import(import_id, file_path, filter_spm=True)`: Pipeline ETL nạp file Excel Cơ điện dung lượng lớn, bulk insert vào `tasks`, tính diff vào `task_history`.
- `clear_task_tables(db)`: Dọn dẹp bảng `tasks` và `task_history` (giữ nguyên ghi chú và bảng theo dõi).

### 4. `backend/services/fixed_wo_service.py`:
- `create_fixed_wo_report(db, data)`: Tạo báo cáo danh sách WO cố định mới.
- `get_fixed_wo_stats(db, report_id, target_month, exclude_tu_choi)`: Thống kê ma trận ngày 1-31 cho báo cáo WO cố định.
- `get_fixed_wo_tasks(db, ...)`: Lấy danh sách việc drilldown cho báo cáo cố định.

### 5. `backend/services/device_recall_service.py`:
- `import_device_recall_content(db, content, filename)`: Nạp file `.txt` danh sách thu hồi thiết bị.
- `get_device_recall_items(db, cluster, ft_name, search)`: Lấy chi tiết danh sách thiết bị cần thu hồi.
- `export_device_recall_csv(db, cluster, ft_name, search)`: Xuất danh sách ra file CSV chuẩn UTF-8 BOM.

### 6. `backend/services/task_service.py`:
- `get_tasks_paginated(db, ...)`: Phân trang và lọc công việc đa chiều.
- `get_task_detail(db, ma_cong_viec)`: Chi tiết công việc, lịch sử và ghi chú.
- `add_task_note(db, ma_cong_viec, content, created_by)`: Thêm ghi chú vĩnh viễn cho WO.

### 7. `backend/services/tracking_service.py`:
- `create_tracking_board(db, name, description, loai_cong_viec)`: Tạo bảng theo dõi mới.
- `bulk_add_tasks_to_board(db, board_id, task_codes, note)`: Gán nhiều WO vào bảng.
- `sync_board_tasks_by_type(db, board_id)`: Tự động bổ sung WO mới vào bảng theo `loai_cong_viec`.

### 8. `backend/services/report_category_service.py`:
- `get_report_categories(db, target_month, include_summary, domain)`: Lấy danh mục báo cáo & đầu việc con.
- `create_sub_category(db, cat_id, payload)`: Tạo đầu việc con kèm từ khóa lọc.

---

## 💡 MẪU CÂU PROMPT HỮU ÍCH KHI LÀM VIỆC VỚI AI

Khi yêu cầu AI thực hiện tác vụ, bạn có thể copy các mẫu prompt dưới đây:

- **Sửa giao diện hoặc bổ sung cột trong bảng Bảo Dưỡng Cơ Điện:**
  > *"Xem file [stats_service.py](backend/services/stats_service.py) và [MaintenanceSpreadsheetTable.jsx](frontend/src/components/MaintenanceSpreadsheetTable.jsx), tôi muốn bổ sung thêm cột [...] vào bảng ma trận. Hãy cập nhật hàm `get_special_maintenance_stats()` và bảng hiển thị tương ứng."*

- **Sửa logic chỉ số KPI hoặc tủ cáp trong Cố Định Băng Rộng:**
  > *"Xem file [codinh_service.py](backend/services/codinh_service.py) và [CodinhPage.jsx](frontend/src/pages/CodinhPage.jsx), tôi muốn điều chỉnh cách tính chỉ số KPI [...] trong hàm `get_codinh_stats()` và modal [CodinhDrilldownModal.jsx](frontend/src/components/CodinhDrilldownModal.jsx)."*

- **Bổ sung trường dữ liệu mới từ file Excel import:**
  > *"Tôi cần thêm cột [...] vào bảng công việc. Hãy xem [task.py](backend/models/task.py), thêm ALTER TABLE vào `auto_migrate_db()` trong [main.py](backend/main.py) và cập nhật ánh xạ đọc cột trong hàm `process_excel_import()` của [etl_service.py](backend/services/etl_service.py)."*

---
*Hệ thống được phát triển chuyên biệt cho đội ngũ Cơ điện & CĐBR Viettel Construction (VCC).*
