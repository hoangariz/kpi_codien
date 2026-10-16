# TÀI LIỆU CHỈ MỤC TOÀN BỘ CODEBASE & DANH MỤC HÀM (CODEBASE INDEX FOR AI & DEVELOPERS)

> **Mục đích tài liệu:** Tài liệu này tổng hợp toàn bộ cấu trúc thư mục, kiến trúc hệ thống, danh sách Model, Service, Function, API Endpoint, Component và Utility của dự án **KPI Cơ Điện & Cố Định Băng Rộng (VCC)**.
> Khi lập trình hoặc prompt cho AI, AI có thể đọc file này để nắm ngay toàn bộ hàm cần dùng mà không cần quét lại hàng chục file nguồn.

---

## 1. TỔNG QUAN HỆ THỐNG & CÔNG NGHỆ (TECH STACK)

- **Ngôn ngữ & Nền tảng:**
  - **Backend:** Python 3.10+, FastAPI, SQLAlchemy 2.0 ORM, Pydantic v2, Pandas, OpenPyXL, SQLite (WAL mode tối ưu) / MySQL (MariaDB aaPanel).
  - **Frontend:** React 18, Vite, TanStack Query (@tanstack/react-query v5), Lucide React (Icons), Axios, CSS Variables thuần (Modern Responsive UI, Light/Dark theme).
- **Cơ sở dữ liệu:**
  - Môi trường Local: SQLite `kpi_codien.db` chạy chế độ WAL (`PRAGMA journal_mode=WAL`, `busy_timeout=30000`, `cache_size=-32000`, `mmap_size=256MB`).
  - Môi trường Production: MySQL / MariaDB cấu hình qua `DATABASE_URL` trong file `.env`.
- **Khởi chạy hệ thống:**
  - File chạy 1-click: `run.bat` -> kích hoạt `run.py`.
  - Backend API: `http://localhost:8000` (Swagger docs: `/api/docs`).
  - Frontend React: `http://localhost:3000`.

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN (PROJECT STRUCTURE)

```
KpiCoDien/
├── backend/
│   ├── api/                           # FastAPI Router Endpoints
│   │   ├── router_codinh.py           # API Cố định băng rộng (CĐBR) & Tủ THC
│   │   ├── router_device_recall.py    # API Thu hồi thiết bị FT / mesh
│   │   ├── router_fixed_wo.py         # API Báo cáo danh sách WO cố định
│   │   ├── router_imports.py          # API Upload Excel chunked 8MB & ETL Cơ điện
│   │   ├── router_meta.py             # API Danh mục dropdown bộ lọc
│   │   ├── router_report_categories.py# API Cấu hình danh mục báo cáo & đầu việc con
│   │   ├── router_settings.py         # API Cấu hình hệ thống (tháng hiện tại...)
│   │   ├── router_stats.py            # API Thống kê KPI, bảo dưỡng cơ điện, timeline
│   │   ├── router_tasks.py            # API Danh sách công việc, chi tiết, ghi chú, lịch sử
│   │   └── router_tracking.py         # API Bảng theo dõi tiến độ công việc tuỳ chỉnh
│   ├── models/                        # SQLAlchemy ORM Models
│   │   ├── cabinet.py                 # Model Cabinet (Tủ Hộp Cáp THC - CĐBR)
│   │   ├── device_recall.py           # Model DeviceRecall (Thu hồi thiết bị)
│   │   ├── dimensions.py              # Dimension Models: Employee, Group, System, Unit, Station...
│   │   ├── fixed_wo_report.py         # Model FixedWoReport & FixedWoItem
│   │   ├── history.py                 # Model TaskHistory (Lịch sử biến động trường dữ liệu)
│   │   ├── import_log.py              # Model ImportLog (Lịch sử nạp file & trạng thái)
│   │   ├── note.py                    # Model TaskNote (Ghi chú nghiệp vụ vĩnh viễn)
│   │   ├── report_category.py         # Model ReportCategory & ReportSubCategory
│   │   ├── settings.py                # Model SystemSetting (Key-value config)
│   │   ├── task.py                    # Model Task (Công việc cơ điện chính)
│   │   ├── task_codinh.py             # Model TaskCodinh (Công việc Cố định băng rộng)
│   │   └── tracking.py                # Model TrackingBoard & TrackingBoardTask
│   ├── schemas/                       # Pydantic Schemas (Request/Response)
│   │   ├── fixed_wo_schema.py
│   │   ├── import_schema.py
│   │   ├── report_category_schema.py
│   │   ├── stats_schema.py
│   │   ├── task_schema.py
│   │   └── tracking_schema.py
│   ├── services/                      # Nghiệp vụ xử lý (Business Logic)
│   │   ├── codinh_service.py          # Xử lý CĐBR, nạp WO CĐBR, nạp tủ THC, tính stats CĐBR
│   │   ├── device_recall_service.py   # Xử lý file thu hồi thiết bị .txt, lọc cụm, xuất CSV
│   │   ├── etl_service.py             # ETL Excel Cơ điện, vectorization, nạp batch, diff log
│   │   ├── fixed_wo_service.py        # Thống kê & drilldown báo cáo danh sách WO cố định
│   │   ├── report_category_service.py # Quản lý danh mục báo cáo & từ khóa danh mục con
│   │   ├── settings_service.py        # Đọc / ghi SystemSetting
│   │   ├── stats_service.py           # Tính toán ma trận KPI Bảo dưỡng Cơ điện & drilldown
│   │   ├── task_service.py            # Phân trang, tìm kiếm công việc, ghi chú, lịch sử
│   │   ├── tracking_service.py        # Quản lý bảng theo dõi tiến độ, bulk add, auto sync
│   │   └── user_mapping.py            # Ánh xạ username (mã nhân viên) sang Họ tên đầy đủ tiếng Việt
│   ├── config.py                      # Cấu hình biến môi trường, đường dẫn upload, database
│   ├── database.py                    # Kết nối database, PRAGMA SQLite WAL, get_db() dependency
│   └── main.py                        # Khởi tạo FastAPI app, middleware CORS, auto migrate DB, mount static
├── frontend/
│   ├── src/
│   │   ├── api/                       # Axios Client API Modules
│   │   │   ├── client.js              # Instance Axios cấu hình baseURL='/api'
│   │   │   ├── codinhApi.js           # Gọi API CĐBR, tủ THC, upload CĐBR
│   │   │   ├── deviceRecallApi.js     # Gọi API Thu hồi thiết bị
│   │   │   ├── fixedWoApi.js          # Gọi API Báo cáo danh sách WO cố định
│   │   │   ├── importsApi.js          # Gọi API Upload file 8MB chunked & lịch sử import
│   │   │   ├── metaApi.js             # Gọi API Dropdown bộ lọc
│   │   │   ├── reportCategoryApi.js   # Gọi API Danh mục báo cáo & đầu việc con
│   │   │   ├── settingsApi.js         # Gọi API Cài đặt tháng báo cáo
│   │   │   ├── statsApi.js            # Gọi API Thống kê bảo dưỡng, KPI tổng quan, drilldown
│   │   │   ├── tasksApi.js            # Gọi API Danh sách công việc, ghi chú, lịch sử
│   │   │   └── trackingApi.js         # Gọi API Bảng theo dõi tiến độ
│   │   ├── components/                # Giao diện thành phần dùng chung
│   │   │   ├── dashboard/             # Thành phần trang Dashboard
│   │   │   │   ├── DynamicCategoryReport.jsx  # Bảng ma trận báo cáo động theo danh mục
│   │   │   │   ├── HighPriorityBoardSection.jsx# Khung bảng theo dõi trọng điểm trên Dashboard
│   │   │   │   ├── OverallKpiSection.jsx       # Thanh KPI tổng quan (Tổng, Đang xử lý, Đã đóng...)
│   │   │   │   ├── OverviewChartsSection.jsx   # Biểu đồ xu hướng ngày & phân bổ nhóm
│   │   │   │   └── ReportSelectorCards.jsx     # Thẻ chọn danh mục báo cáo trên Dashboard
│   │   │   ├── CodinhDrilldownModal.jsx        # Modal chi tiết WO CĐBR kèm danh sách Tủ THC con
│   │   │   ├── DhPortKemTable.jsx              # Bảng Điều hòa / Port kém GPON (CĐBR)
│   │   │   ├── Header.jsx                      # Thanh điều hướng trên cùng, chuyển tab & theme
│   │   │   ├── KpiCard.jsx                     # Thẻ số liệu KPI đơn lẻ
│   │   │   ├── MaintenanceSpecialWidget.jsx    # Widget bảo dưỡng đặc biệt
│   │   │   ├── MaintenanceSpreadsheetTable.jsx # Bảng tính ma trận ngày 1-31 theo nhân viên/nhóm
│   │   │   ├── Sidebar.jsx                     # Thanh sidebar phụ (nếu dùng)
│   │   │   ├── TaskDetailModal.jsx             # Modal xem chi tiết công việc, worklog, ghi chú
│   │   │   └── TaskDrilldownModal.jsx          # Modal drilldown khi click số liệu bảng bảo dưỡng/WO cố định
│   │   ├── pages/                     # Các màn hình chính
│   │   │   ├── AdminCodinhPage.jsx    # Quản trị CĐBR (Upload WO CĐBR, Tủ THC, Thu hồi TB)
│   │   │   ├── AdminPage.jsx          # Quản trị Cơ điện (Cấu hình tháng, Upload file, Bảng theo dõi, Danh mục)
│   │   │   ├── CodinhPage.jsx         # Báo cáo & Thống kê Cố Định Băng Rộng (CĐBR)
│   │   │   ├── CsdbPage.jsx           # CSDL Trạm / MPĐ (Đang phát triển)
│   │   │   ├── DashboardPage.jsx      # Dashboard tổng quan Cơ điện & Báo cáo bảo dưỡng
│   │   │   ├── SearchPage.jsx         # Tra cứu công việc nâng cao (gợi ý FT, bộ lọc đa chiều)
│   │   │   └── ThuHoiThietBiPage.jsx  # Tra cứu & xuất CSV danh sách thu hồi thiết bị FT
│   │   ├── utils/                     # Tiện ích định dạng
│   │   │   ├── dateFormat.js          # Định dạng ngày giờ tiếng Việt
│   │   │   ├── groupFormat.js         # Chuẩn hoá tên cụm/nhóm điều phối
│   │   │   └── userMapping.js         # Ánh xạ username -> Họ tên nhân viên tiếng Việt
│   │   ├── App.jsx                    # Routing tab, error boundary, chuyển trang
│   │   ├── index.css                  # Toàn bộ CSS hệ thống (Tokens, Cards, Tables, Themes)
│   │   └── main.jsx                   # React DOM Entrypoint
│   └── package.json                   # Thư viện frontend (React 18, Vite, TanStack Query...)
├── deployment/                        # Hướng dẫn & cấu hình triển khai aaPanel (Nginx, Supervisord)
├── run.py                             # Script khởi chạy tự động backend + frontend + seed demo
├── run.bat                            # Phím tắt 1-click trên Windows
└── README.md                          # Tài liệu hướng dẫn sử dụng và triển khai
```

---

## 3. DANH MỤC CÁC MODEL DATABASE (`backend/models/`)

### 3.1. `Task` (`backend/models/task.py`) - Bảng `tasks`
Công việc Cơ điện chính nạp từ file Excel nguồn:
- `ma_cong_viec` (String(100), PK): Mã công việc (WO code).
- `ma_cong_viec_cha` (String(100)): Mã WO cha (nếu có).
- `task_type_id` (Integer, FK `task_types.id`): Phân loại việc.
- `loai_cong_viec` (String(255), Index): Tên loại công việc chuẩn.
- `noi_dung_cong_viec`, `ghi_chu`, `worklog`, `ft_comment`: Nội dung và nhật ký công việc.
- `trang_thai` (String(100), Index): Trạng thái (Đã đóng, Đang thực hiện, Chưa tiếp nhận...).
- `trang_thai_hoan_thanh`: Đánh giá hoàn thành.
- `system_id` (Integer, FK `systems.id`): Hệ thống (SPM, ICMS...).
- `group_id` (Integer, FK `groups.id`): Nhóm / Cụm điều phối.
- `assigned_to_id` (Integer, FK `employees.id`): Nhân viên được giao.
- `created_by_id` (Integer, FK `employees.id`): Nhân viên tạo WO.
- `thoi_diem_tao`, `thoi_diem_bat_dau_thuc_hien`, `thoi_diem_yeu_cau_ket_thuc`, `thoi_gian_con_lai`: Mốc thời gian & thời hạn KPI.
- `thoi_diem_ft_hoan_thanh`, `thoi_diem_cd_dong`, `thoi_diem_ft_tiep_nhan`: Mốc xử lý của FT và Cơ điện.
- `station_id` (Integer, FK `stations.id`): Trạm BTS.
- `unit_id` (Integer, FK `units.id`): Đơn vị phụ trách.
- `last_import_id` (Integer, FK `import_logs.id`): ID lần nạp gần nhất.
- *Quan hệ:* `employee_assigned`, `employee_created`, `group`, `system`, `station`, `history`, `notes`.

### 3.2. `TaskCodinh` (`backend/models/task_codinh.py`) - Bảng `codinh_tasks`
Bảng công việc riêng biệt dành cho **Cố Định Băng Rộng (CĐBR)**:
- `ma_cong_viec` (String(100), PK): Mã WO CĐBR.
- `loai_cong_viec`, `noi_dung_cong_viec`, `ghi_chu`: Chi tiết WO.
- `trang_thai`, `trang_thai_hoan_thanh`: Trạng thái thực hiện.
- `he_thong`: Hệ thống phát sinh WO.
- `nhan_vien`: Username FT thực hiện.
- `nhom`: Tên Cụm / Nhóm phụ trách.
- `ma_tram`: Mã trạm phát sinh WO.
- `thoi_diem_tao`, `thoi_diem_bat_dau_thuc_hien`, `thoi_diem_yeu_cau_ket_thuc`, `thoi_gian_con_lai`, `thoi_diem_ft_hoan_thanh`, `thoi_diem_cd_dong`.
- `import_filename`: Tên file Excel import nạp WO này.

### 3.3. `Cabinet` (`backend/models/cabinet.py`) - Bảng `cabinets`
Tủ Hộp Cáp (THC) gắn kèm WO của CĐBR:
- `id` (Integer, PK): Khóa chính tự tăng.
- `category_id` (Integer, FK `report_categories.id`): Danh mục áp dụng.
- `ma_wo` (String(100), Index): Mã WO liên kết tới `TaskCodinh`.
- `ma_doi_tuong` (String(150), Index): Mã tủ hộp cáp (THC).
- `ma_tram`: Mã trạm của tủ cáp.
- `trang_thai_wo`, `trang_thai_thc`: Trạng thái bảo dưỡng tủ cáp ('Đã hoàn thành bảo dưỡng', 'Đang thực hiện...').
- `import_filename`: File danh sách tủ cáp đã import.

### 3.4. `ReportCategory` & `ReportSubCategory` (`backend/models/report_category.py`)
Cấu hình danh mục báo cáo động & đầu việc con:
- `ReportCategory`:
  - `id`, `name`, `loai_cong_viec`, `description`, `icon`, `sort_order`, `is_default`.
  - `exclude_closed_prior_months` (Boolean): Có loại bỏ việc đã đóng tháng trước không (mặc định: True).
  - `filter_mode` ('by_loai' | 'by_system'): Lọc theo loại công việc hay lọc theo hệ thống.
  - `filter_values` (Text JSON): Mảng giá trị lọc, ví dụ `["SPM", "ICMS"]`.
  - `domain` ('codien' | 'codinh'): Áp dụng cho phân hệ Cơ điện hay Cố định.
  - `other_sub_category_name`: Tên bảng con tự động gom việc còn lại (mặc định: "Còn lại / Khác").
- `ReportSubCategory`:
  - `id`, `category_id`, `name`, `keyword`, `description`, `sort_order`.

### 3.5. `FixedWoReport` & `FixedWoItem` (`backend/models/fixed_wo_report.py`)
Báo cáo theo danh sách mã WO cố định (danh sách đích danh):
- `FixedWoReport`: `id`, `name`, `description`, `created_at`, `updated_at`.
- `FixedWoItem`: `id`, `report_id`, `ma_cong_viec`.

### 3.6. `TrackingBoard` & `TrackingBoardTask` (`backend/models/tracking.py`)
Bảng theo dõi tiến độ công việc tuỳ chỉnh:
- `TrackingBoard`: `id`, `name`, `description`, `loai_cong_viec`.
- `TrackingBoardTask`: `id`, `board_id`, `ma_cong_viec`, `added_at`, `note`.

### 3.7. `DeviceRecall` (`backend/models/device_recall.py`) - Bảng `device_recalls`
Dữ liệu thu hồi thiết bị khách hàng (Modem / Thiết bị Mesh):
- `so_thue_bao`, `dich_vu`, `dia_chi_khach_hang`, `tong_tbi_phai_thu`, `loai_thiet_bi`, `tuoi_tho_mesh`, `so_tbi_mesh_phai_thu`, `cum_xa`, `ten_ft`, `ma_nv`.

### 3.8. Các model phụ trợ khác:
- `ImportLog` (`backend/models/import_log.py`): Ghi nhận file tải lên, dung lượng, số dòng, trạng thái nạp, tiến độ %, domain (`main` / `codinh`).
- `TaskNote` (`backend/models/note.py`): Ghi chú nghiệp vụ gắn theo `ma_cong_viec` (bảo toàn vĩnh viễn khi nạp đè file mới).
- `TaskHistory` (`backend/models/history.py`): Lưu vết lịch sử thay đổi trường dữ liệu giữa các lần import.
- `SystemSetting` (`backend/models/settings.py`): Lưu cấu hình hệ thống (ví dụ `current_month = "2026-09"`).
- `Employee`, `Group`, `SystemModel`, `Unit`, `Station`, `TaskType` (`backend/models/dimensions.py`).

---

## 4. CHI TIẾT CÁC SERVICE BACKEND & HÀM CẦN DÙNG (`backend/services/`)

### 4.1. `etl_service.py` - Xử lý Nạp File Excel & Đồng Bộ Dữ Liệu Cơ Điện
Quản lý nạp file Excel dung lượng lớn (20.000 - 100.000+ dòng):
- `run_import_job(import_id: int, file_path: str, filter_spm: bool = True)`:
  - Hàm entrypoint chạy trong process riêng (`ProcessPoolExecutor`) để không block API server.
- `process_excel_import(import_id: int, file_path: str, filter_spm: bool = True)`:
  - Đọc file Excel chunk theo chunk (openpyxl read_only), lọc bỏ SPM/SPM_VTNET nếu `filter_spm=True`.
  - Gọi `resolve_dimensions_in_bulk()` để nạp cache các bảng dimension (`Group`, `Employee`, `SystemModel`...).
  - Bulk insert / update công việc vào bảng `tasks`, so khớp diff và ghi nhận vào `task_history`.
  - Cập nhật tiến độ % vào file `.progress` và bảng `import_logs`.
- `clear_task_tables(db: Session)`:
  - Xoá sạch dữ liệu bảng `tasks` và `task_history`, nhưng giữ nguyên `task_notes` và `tracking_boards`.
- Vectorization functions:
  - `_vectorize_str_col(series, n)`: Chuẩn hoá chuỗi an toàn từ Pandas.
  - `_vectorize_float_col(series, n)`: Ép kiểu float an toàn.
  - `_vectorize_dt_col(series, n)`: Chuyển đổi datetime nhiều định dạng ngày giờ Việt Nam.
  - `_vectorize_fk_col(series, dim_map, n)`: Ánh xạ khoá ngoại nhanh qua Dict lookup.

### 4.2. `stats_service.py` - Thống Kê Ma Trận KPI & Báo Cáo Bảo Dưỡng Cơ Điện
Tính toán các chỉ số KPI và ma trận phân tích:
- `get_kpi_overview(db: Session) -> Dict[str, Any]`:
  - Trả về: Tổng số việc, Đang xử lý, Đã hoàn thành/đóng, Quá hạn, Tỷ lệ hoàn thành %, Phân loại theo trạng thái.
- `get_stats_by_group(db: Session, task_type: Optional[str] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[GroupStatItem]`:
  - Thống kê tổng số, hoàn thành, tồn đọng, quá hạn theo từng Nhóm điều phối.
- `get_stats_by_employee(db: Session, group_id: Optional[int] = None, task_type: Optional[str] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, limit: int = 100) -> List[EmployeeStatItem]`:
  - Thống kê năng suất thực hiện theo từng Nhân viên được gán.
- `get_special_maintenance_stats(db: Session, target_type: Optional[str] = None, target_month: Optional[str] = None, board_id: Optional[int] = None, exclude_tu_choi: bool = False) -> Dict[str, Any]`:
  - **Hàm cốt lõi** sinh dữ liệu cho bảng tính Bảo Dưỡng Cơ Điện ICMS (hoặc danh mục tuỳ chọn).
  - Tự động loại bỏ các công việc đã đóng từ các tháng trước nếu có thiết lập `current_month`.
  - Trả về dữ liệu ma trận hoàn thành từ **ngày 1 đến ngày 31** của tháng, số việc hoàn thành hôm nay, 7 ngày qua, quá hạn, tồn.
  - Phân tách theo từng danh mục con (Điều hòa, Máy phát điện, Thông gió lọc bụi...).
  - Trả về 2 bảng: `by_employee` và `by_group`.
- `get_special_maintenance_tasks(db: Session, target_type: Optional[str] = None, target_month: Optional[str] = None, board_id: Optional[int] = None, sub_category_id: Optional[int] = None, metric: str = "total", filter_type: Optional[str] = None, filter_id: Optional[int] = None, is_other: bool = False, search: Optional[str] = None, day: Optional[int] = None, max_day: Optional[int] = None, page: int = 1, page_size: int = 10000, sort_by: str = "thoi_diem_yeu_cau_ket_thuc", sort_order: str = "desc", exclude_tu_choi: bool = False) -> PaginatedTasksResponse`:
  - **Hàm drilldown** danh sách công việc khi người dùng click vào bất kỳ ô số liệu nào trên bảng tính.
  - Hỗ trợ metric: `total`, `closed`, `pending`, `overdue`, `closed_today`, `closed_last_7_days`, `closed_day` (ngày cụ thể), `closed_up_to_max`.
- `get_timeline_stats(db: Session, days: int = 14) -> List[TimelineItem]`:
  - Xu hướng tạo mới và đóng việc theo từng ngày trong N ngày gần nhất.
- `get_overdue_stats(db: Session, group_id: Optional[int] = None, limit: int = 20) -> Dict[str, Any]`:
  - Danh sách và tỷ lệ quá hạn theo nhóm.

### 4.3. `codinh_service.py` - Nghiệp Vụ Cố Định Băng Rộng (CĐBR) & Tủ Hộp Cáp (THC)
Quản lý toàn bộ chức năng liên quan đến CĐBR:
- `run_codinh_import_job(import_id: int, file_path: str)`:
  - Entrypoint chạy trong process riêng nạp file Excel danh sách WO CĐBR.
- `import_codinh_wos_from_excel(db: Session, file_path: Union[str, Path], filename: str, import_id: Optional[int] = None)`:
  - Nạp dữ liệu WO CĐBR trực tiếp vào bảng `codinh_tasks`.
- `import_cabinets_from_excel(db: Session, file_path: Union[str, Path], filename: str, category_id: Optional[int] = None) -> Dict[str, Any]`:
  - Nạp danh sách Tủ Hộp Cáp (THC) gắn theo mã WO vào bảng `cabinets`.
  - Nhận diện cột mã WO, mã đối tượng tủ cáp, mã trạm, trạng thái bảo dưỡng tủ cáp.
- `get_codinh_stats(db: Session, category_id: Optional[int] = None, target_month: Optional[str] = None) -> Dict[str, Any]`:
  - Tính toán ma trận thống kê CĐBR, bao gồm số tủ cáp THC hoàn thành, tồn, quá hạn; các chỉ số KPI hoàn thành trong 24h, 72h; tồn <24h, <72h; phân tích Home wifi thu kém và Port kém GPON.
  - Có cơ chế cache in-memory đa luồng `_CODINH_STATS_CACHE` để phản hồi tức thì.
- `clear_codinh_stats_cache()`:
  - Xóa cache thống kê CĐBR khi có dữ liệu mới.
- `get_codinh_drilldown_tasks(db: Session, category_id: Optional[int] = None, target_month: Optional[str] = None, metric: str = "total", filter_type: Optional[str] = None, target_name: Optional[str] = None, search: Optional[str] = None, sort_by: Optional[str] = None, sort_order: str = "asc", page: int = 1, page_size: int = 50) -> Dict[str, Any]`:
  - Lấy danh sách công việc drilldown chi tiết kèm toàn bộ danh sách Tủ Hộp Cáp (THC) con thuộc từng WO.
- `get_codinh_import_logs(db: Session, limit: int = 50) -> List[ImportLog]`:
  - Lấy lịch sử các lần nạp file CĐBR (`domain='codinh'`).
- `activate_codinh_import(db: Session, import_id: int) -> ImportLog`:
  - Kích hoạt lại một file CĐBR đã nạp trong quá khứ.
- `delete_codinh_import(db: Session, import_id: int) -> bool`:
  - Xoá file vật lý và dữ liệu nạp của file CĐBR.

### 4.4. `fixed_wo_service.py` - Báo Cáo Danh Sách WO Cố Định (Fixed WO Reports)
- `create_fixed_wo_report(db: Session, data: FixedWoReportCreate) -> FixedWoReport`:
  - Tạo bộ báo cáo mới từ danh sách mã WO paste vào (hỗ trợ nhập theo dòng, dấu phẩy, khoảng trắng).
- `update_fixed_wo_report(db: Session, report_id: int, data: FixedWoReportUpdate) -> FixedWoReport`:
  - Cập nhật tên, mô tả hoặc thay thế / bổ sung danh sách mã WO.
- `delete_fixed_wo_report(db: Session, report_id: int) -> bool`:
  - Xoá báo cáo WO cố định.
- `get_fixed_wo_reports(db: Session) -> List[Dict[str, Any]]`:
  - Danh sách tất cả báo cáo cố định kèm số lượng mã WO đã khớp / chưa khớp trong hệ thống.
- `get_fixed_wo_stats(db: Session, report_id: int, target_month: Optional[str] = None, exclude_tu_choi: bool = False) -> Dict[str, Any]`:
  - Tính toán ma trận ngày 1-31, hoàn thành, tồn, quá hạn riêng cho tập WO cố định.
- `get_fixed_wo_tasks(db: Session, report_id: int, metric: str = "total", filter_type: Optional[str] = None, filter_id: Optional[int] = None, is_other: bool = False, search: Optional[str] = None, day: Optional[int] = None, max_day: Optional[int] = None, target_month: Optional[str] = None, page: int = 1, page_size: int = 10000, sort_by: str = "thoi_diem_yeu_cau_ket_thuc", sort_order: str = "desc", exclude_tu_choi: bool = False) -> PaginatedTasksResponse`:
  - Drilldown chi tiết các WO trong báo cáo cố định khi click vào số liệu.

### 4.5. `device_recall_service.py` - Thu Hồi Thiết Bị Khách Hàng (FT Device Recall)
- `import_device_recall_content(db: Session, content: str, filename: str) -> dict`:
  - Phân tích file văn bản `.txt` phân tách bằng tab/dấu phân cách, nạp vào bảng `device_recalls`.
- `get_device_recall_meta(db: Session) -> dict`:
  - Lấy metadata file nạp gần nhất (tên file, thời điểm nạp, tổng số bản ghi).
- `get_device_recall_clusters(db: Session) -> List[dict]`:
  - Lấy danh sách các cụm duy nhất (Trung tâm Cụm xã).
- `get_device_recall_fts_by_cluster(db: Session, cluster: str) -> List[dict]`:
  - Lấy danh sách FT và mã nhân viên thuộc cụm được chọn.
- `get_device_recall_items(db: Session, cluster: str, ft_name: Optional[str] = None, search: Optional[str] = None) -> List[dict]`:
  - Lấy chi tiết danh sách thuê bao, địa chỉ, loại thiết bị cần thu hồi.
- `export_device_recall_csv(db: Session, cluster: str, ft_name: Optional[str] = None, search: Optional[str] = None) -> str`:
  - Xuất file CSV định dạng chuẩn tiếng Việt (UTF-8 with BOM `utf-8-sig`) để mở trực tiếp trên Excel không bị lỗi font.

### 4.6. `task_service.py` - Tra Cứu Công Việc, Ghi Chú & Lịch Sử
- `get_tasks_paginated(db: Session, page: int = 1, page_size: int = 25, search: Optional[str] = None, group_id: Optional[int] = None, assigned_to_id: Optional[int] = None, trang_thai: Optional[str] = None, loai_cong_viec: Optional[str] = None, system_id: Optional[int] = None, is_overdue: Optional[bool] = None, station_code: Optional[str] = None, ft_username: Optional[str] = None, sort_by: str = "thoi_diem_tao", sort_order: str = "desc") -> PaginatedTasksResponse`:
  - Phân trang và lọc công việc nâng cao theo nhiều tiêu chí.
- `get_task_detail(db: Session, ma_cong_viec: str) -> Optional[TaskDetailResponse]`:
  - Chi tiết công việc kèm lịch sử biến động và danh sách ghi chú.
- `add_task_note(db: Session, ma_cong_viec: str, content: str, created_by: str = "User") -> TaskNote`:
  - Thêm ghi chú nghiệp vụ vĩnh viễn cho WO.
- `get_task_notes(db: Session, ma_cong_viec: str) -> List[TaskNote]`:
  - Lấy toàn bộ ghi chú của WO.
- `get_task_history(db: Session, ma_cong_viec: str) -> List[TaskHistory]`:
  - Lấy toàn bộ lịch sử các lần thay đổi giá trị trường của WO.

### 4.7. `tracking_service.py` - Bảng Theo Dõi Tiến Độ Tuỳ Chỉnh
- `get_tracking_boards(db: Session) -> List[Dict[str, Any]]`: Danh sách bảng theo dõi.
- `create_tracking_board(db: Session, name: str, description: Optional[str] = None, loai_cong_viec: Optional[str] = None) -> TrackingBoard`: Tạo bảng theo dõi mới.
- `get_tracking_board_detail(db: Session, board_id: int) -> Optional[Dict[str, Any]]`: Xem chi tiết bảng và các công việc bên trong.
- `update_tracking_board(...)`: Cập nhật tên, mô tả, loại công việc.
- `delete_tracking_board(db: Session, board_id: int) -> bool`: Xoá bảng theo dõi.
- `add_task_to_board(db: Session, board_id: int, ma_cong_viec: str, note: Optional[str] = None)`: Gán 1 WO vào bảng.
- `bulk_add_tasks_to_board(db: Session, board_id: int, task_codes: List[str], note: Optional[str] = None) -> int`: Gán hàng loạt WO vào bảng.
- `sync_board_tasks_by_type(db: Session, board_id: int) -> int`: Tự động quét và bổ sung các WO mới có `loai_cong_viec` trùng khớp vào bảng.
- `remove_task_from_board(db: Session, board_id: int, ma_cong_viec: str) -> bool`: Gỡ WO khỏi bảng.
- `clear_all_tasks_from_board(db: Session, board_id: int) -> int`: Dọn sạch công việc khỏi bảng.
- `get_task_boards(db: Session, ma_cong_viec: str) -> List[Dict[str, Any]]`: Kiểm tra WO đang thuộc những bảng theo dõi nào.

### 4.8. `report_category_service.py` - Cấu Hình Danh Mục Báo Cáo
- `get_report_categories(db: Session, target_month: Optional[str] = None, include_summary: bool = True, domain: Optional[str] = None) -> List[Dict[str, Any]]`:
  - Trả về danh sách danh mục báo cáo kèm tóm tắt KPI nhanh và danh sách đầu việc con.
- `create_report_category(db: Session, payload: ReportCategoryCreate) -> ReportCategory`: Tạo mới danh mục báo cáo.
- `update_report_category(db: Session, cat_id: int, payload: ReportCategoryUpdate) -> ReportCategory`: Cập nhật cấu hình danh mục.
- `delete_report_category(db: Session, cat_id: int) -> bool`: Xoá danh mục (không xoá danh mục mặc định của hệ thống).
- `create_sub_category(db: Session, cat_id: int, payload: ReportSubCategoryCreate) -> ReportSubCategory`: Thêm đầu việc con (bảng con) gắn từ khóa lọc.
- `update_sub_category(db: Session, sub_id: int, payload: ReportSubCategoryUpdate) -> ReportSubCategory`: Sửa đầu việc con.
- `delete_sub_category(db: Session, sub_id: int) -> bool`: Xoá đầu việc con.

### 4.9. `settings_service.py` - Cấu Hình Hệ Thống
- `get_setting(db: Session, key: str, default: str = "") -> str`: Đọc giá trị setting.
- `set_setting(db: Session, key: str, value: str, description: str = "") -> str`: Lưu giá trị setting.
- `get_current_month_setting(db: Session) -> str`: Lấy tháng báo cáo hiện tại (mặc định lấy tháng từ dữ liệu gần nhất, ví dụ "2026-09").

### 4.10. `user_mapping.py` - Ánh Xạ Nhân Viên
- `get_user_full_name(user: str) -> str`:
  - Chuyển đổi username (ví dụ: `d00170579` -> `Phan Văn Thọ`, `hiennv41` -> `Nguyễn Văn Hiền`).
  - Trả về chính username gốc nếu không tìm thấy trong từ điển ánh xạ.
- `get_usernames_by_name(name: str) -> List[str]`:
  - Tìm tất cả các username tương ứng với một họ tên tiếng Việt.

---

## 5. DANH SÁCH REST API ENDPOINTS TỔNG HỢP (`backend/api/`)

| Method | Endpoint | Router File | Mô tả chức năng |
|---|---|---|---|
| **GET** | `/api/health` | `main.py` | Kiểm tra tình trạng hoạt động backend |
| **GET** | `/api/meta/filters` | `router_meta.py` | Lấy danh sách dropdown bộ lọc (Nhóm, NV, Hệ thống, Loại việc, Trạng thái) |
| **GET** | `/api/settings` | `router_settings.py` | Lấy cấu hình hệ thống (tháng hiện tại) |
| **POST** | `/api/settings` | `router_settings.py` | Cập nhật cấu hình hệ thống |
| **GET** | `/api/stats/summary` | `router_stats.py` | Thẻ số liệu KPI tổng quan hệ thống |
| **GET** | `/api/stats/by-group` | `router_stats.py` | Thống kê số lượng theo nhóm điều phối |
| **GET** | `/api/stats/by-employee` | `router_stats.py` | Thống kê số lượng theo nhân viên thực hiện |
| **GET** | `/api/stats/maintenance-special`| `router_stats.py` | Ma trận báo cáo bảo dưỡng cơ điện ICMS theo ngày 1-31 |
| **GET** | `/api/stats/maintenance-special/tasks`| `router_stats.py` | Drilldown chi tiết công việc của ô số liệu trên bảng bảo dưỡng |
| **GET** | `/api/stats/timeline` | `router_stats.py` | Xu hướng tạo mới và hoàn thành theo ngày |
| **GET** | `/api/stats/overdue` | `router_stats.py` | Tổng hợp công việc quá hạn |
| **GET** | `/api/tasks` | `router_tasks.py` | Phân trang danh sách công việc theo bộ lọc đa chiều |
| **GET** | `/api/tasks/{ma_cong_viec}` | `router_tasks.py` | Chi tiết công việc kèm ghi chú và lịch sử |
| **GET** | `/api/tasks/{ma_cong_viec}/history` | `router_tasks.py` | Lịch sử biến động trường dữ liệu của công việc |
| **GET** | `/api/tasks/{ma_cong_viec}/notes` | `router_tasks.py` | Danh sách ghi chú của công việc |
| **POST** | `/api/tasks/{ma_cong_viec}/notes` | `router_tasks.py` | Thêm ghi chú mới cho công việc |
| **POST** | `/api/imports` | `router_imports.py` | Tải lên file Excel Cơ điện đơn lẻ |
| **POST** | `/api/imports/chunked/init` | `router_imports.py` | Khởi tạo phiên tải lên file Excel chia nhỏ (8MB/chunk) |
| **PUT** | `/api/imports/chunked/{id}/{idx}` | `router_imports.py` | Gửi từng phần nhị phân (chunk) của file |
| **POST** | `/api/imports/chunked/{id}/finalize` | `router_imports.py` | Ghép file hoàn tất và bắt đầu ETL Cơ điện chạy ngầm |
| **GET** | `/api/imports` | `router_imports.py` | Lịch sử 50 lần tải file Cơ điện gần nhất |
| **GET** | `/api/imports/{id}` | `router_imports.py` | Trạng thái và % tiến độ xử lý của file đang nạp |
| **POST** | `/api/imports/{id}/activate` | `router_imports.py` | Kích hoạt lại / nạp đè dữ liệu từ một file đã upload cũ |
| **DELETE**| `/api/imports/{id}` | `router_imports.py` | Xoá file vật lý trên đĩa và giải phóng bộ nhớ |
| **GET** | `/api/reports/categories` | `router_report_categories.py` | Danh sách danh mục báo cáo & đầu việc con |
| **POST** | `/api/reports/categories` | `router_report_categories.py` | Tạo danh mục báo cáo mới |
| **PUT** | `/api/reports/categories/{id}` | `router_report_categories.py` | Cập nhật cấu hình danh mục báo cáo |
| **DELETE**| `/api/reports/categories/{id}` | `router_report_categories.py` | Xoá danh mục báo cáo |
| **POST** | `/api/reports/categories/{id}/sub-categories` | `router_report_categories.py` | Tạo mới đầu việc con gắn từ khóa |
| **PUT** | `/api/reports/categories/sub-categories/{sub_id}` | `router_report_categories.py` | Cập nhật đầu việc con |
| **DELETE**| `/api/reports/categories/sub-categories/{sub_id}` | `router_report_categories.py` | Xoá đầu việc con |
| **GET** | `/api/fixed-wo-reports` | `router_fixed_wo.py` | Danh sách báo cáo danh sách WO cố định |
| **POST** | `/api/fixed-wo-reports` | `router_fixed_wo.py` | Tạo mới báo cáo WO cố định |
| **GET** | `/api/fixed-wo-reports/{id}` | `router_fixed_wo.py` | Chi tiết báo cáo WO cố định |
| **PUT** | `/api/fixed-wo-reports/{id}` | `router_fixed_wo.py` | Cập nhật tên / danh sách mã WO cố định |
| **DELETE**| `/api/fixed-wo-reports/{id}` | `router_fixed_wo.py` | Xoá báo cáo WO cố định |
| **GET** | `/api/fixed-wo-reports/{id}/wo-codes` | `router_fixed_wo.py` | Kiểm tra WO nào đã khớp / chưa khớp trong dữ liệu |
| **GET** | `/api/fixed-wo-reports/{id}/stats` | `router_fixed_wo.py` | Thống kê số liệu ma trận ngày của báo cáo cố định |
| **GET** | `/api/fixed-wo-reports/{id}/tasks` | `router_fixed_wo.py` | Drilldown chi tiết công việc của báo cáo cố định |
| **GET** | `/api/tracking-boards` | `router_tracking.py` | Danh sách các bảng theo dõi tiến độ |
| **POST** | `/api/tracking-boards` | `router_tracking.py` | Tạo bảng theo dõi mới (hỗ trợ auto-match theo loại việc) |
| **GET** | `/api/tracking-boards/{id}` | `router_tracking.py` | Chi tiết bảng theo dõi kèm danh sách công việc |
| **PUT** | `/api/tracking-boards/{id}` | `router_tracking.py` | Cập nhật thông tin bảng theo dõi |
| **DELETE**| `/api/tracking-boards/{id}` | `router_tracking.py` | Xoá bảng theo dõi |
| **POST** | `/api/tracking-boards/{id}/tasks` | `router_tracking.py` | Thêm 1 công việc vào bảng theo dõi |
| **POST** | `/api/tracking-boards/{id}/bulk-tasks` | `router_tracking.py` | Thêm nhiều công việc vào bảng theo dõi |
| **PUT** | `/api/tracking-boards/{id}/tasks/{code}` | `router_tracking.py` | Cập nhật ghi chú của công việc trong bảng theo dõi |
| **DELETE**| `/api/tracking-boards/{id}/tasks/{code}` | `router_tracking.py` | Xoá công việc khỏi bảng theo dõi |
| **DELETE**| `/api/tracking-boards/{id}/tasks` | `router_tracking.py` | Xoá toàn bộ công việc trong bảng theo dõi |
| **POST** | `/api/tracking-boards/{id}/sync` | `router_tracking.py` | Đồng bộ tự động các công việc mới phát sinh vào bảng |
| **GET** | `/api/tracking-boards/task/{code}` | `router_tracking.py` | Kiểm tra công việc đang nằm ở các bảng theo dõi nào |
| **GET** | `/api/codinh/categories` | `router_codinh.py` | Danh mục báo cáo CĐBR |
| **POST** | `/api/codinh/wos/chunked/init` | `router_codinh.py` | Khởi tạo phiên nạp WO CĐBR chunked 8MB |
| **PUT** | `/api/codinh/wos/chunked/{id}/{idx}` | `router_codinh.py` | Gửi chunk nhị phân file WO CĐBR |
| **POST** | `/api/codinh/wos/chunked/{id}/finalize` | `router_codinh.py` | Ghép file WO CĐBR và bắt đầu nạp ngầm |
| **POST** | `/api/codinh/wos/upload` | `router_codinh.py` | Upload file WO CĐBR trực tiếp đơn lẻ |
| **GET** | `/api/codinh/import-logs` | `router_codinh.py` | Lịch sử nạp file WO CĐBR |
| **POST** | `/api/codinh/import-logs/{id}/activate` | `router_codinh.py` | Kích hoạt lại file CĐBR cũ |
| **DELETE**| `/api/codinh/import-logs/{id}` | `router_codinh.py` | Xoá file CĐBR cũ |
| **POST** | `/api/codinh/cabinets/upload` | `router_codinh.py` | Upload file Excel danh sách Tủ Hộp Cáp (THC) |
| **GET** | `/api/codinh/stats` | `router_codinh.py` | Thống kê số liệu CĐBR (THC, KPI 24h/72h, tồn...) |
| **GET** | `/api/codinh/meta/options` | `router_codinh.py` | Danh sách loại việc & hệ thống có trong CĐBR |
| **GET** | `/api/codinh/drilldown` | `router_codinh.py` | Drilldown công việc CĐBR kèm danh sách tủ cáp con |
| **GET** | `/api/device-recall/meta` | `router_device_recall.py` | Thông tin file thu hồi thiết bị đang kích hoạt |
| **GET** | `/api/device-recall/clusters` | `router_device_recall.py` | Danh sách các Trung tâm Cụm xã thu hồi thiết bị |
| **GET** | `/api/device-recall/fts` | `router_device_recall.py` | Danh sách FT thuộc Cụm xã |
| **GET** | `/api/device-recall/items` | `router_device_recall.py` | Chi tiết danh sách thiết bị cần thu hồi |
| **GET** | `/api/device-recall/export` | `router_device_recall.py` | Xuất CSV UTF-8 BOM danh sách thu hồi thiết bị |
| **POST** | `/api/device-recall/upload` | `router_device_recall.py` | Nạp file `.txt` thu hồi thiết bị hàng tháng |
| **POST** | `/api/device-recall/reload-default` | `router_device_recall.py` | Nạp lại file mẫu `thuhoithietbi.txt` trên máy chủ |

---

## 6. DANH MỤC CÁC TRANG & COMPONENT FRONTEND (`frontend/src/`)

### 6.1. Các Trang Chính (`pages/`):
1. **`DashboardPage.jsx`**:
   - Trang chủ hiển thị:
     - Thẻ chỉ số KPI chung (`OverallKpiSection`).
     - Khung bảng theo dõi công việc trọng điểm (`HighPriorityBoardSection`).
     - Chọn danh mục báo cáo (`ReportSelectorCards`): Bảo Dưỡng Cơ Điện ICMS, Các danh mục tuỳ chỉnh, Báo cáo WO Cố định, Biểu đồ trực quan (`OverviewChartsSection`).
     - Bảng ma trận ngày 1-31 chi tiết theo Nhân viên hoặc Nhóm điều phối (`MaintenanceSpreadsheetTable` / `DynamicCategoryReport`).
     - Modal drilldown xem danh sách việc (`TaskDrilldownModal`) và modal chi tiết việc (`TaskDetailModal`).
2. **`AdminPage.jsx`**:
   - Trang quản trị trung tâm dành cho Cơ Điện:
     - Tab `month`: Cài đặt tháng báo cáo hiện tại (loại bỏ việc đóng tháng trước).
     - Tab `categories`: Quản lý danh mục báo cáo động & thêm/sửa/xoá đầu việc con theo từ khóa.
     - Tab `boards`: Quản lý bảng theo dõi tiến độ công việc tuỳ chỉnh, thêm việc thủ công, tự động đồng bộ theo loại việc.
     - Tab `files`: Tải lên file Excel nguồn mới (kéo thả, thanh tiến trình real-time, chia chunk 8MB vượt giới hạn Cloudflare), kích hoạt lại file cũ, xoá file giải phóng dung lượng.
     - Tab `fixed_wo`: Quản lý danh sách báo cáo WO cố định, nhập danh sách mã WO, kiểm tra tỷ lệ khớp.
3. **`CodinhPage.jsx`**:
   - Trang chuyên biệt cho **Cố Định Băng Rộng (CĐBR)**:
     - Phân tích theo Nhân viên hoặc Nhóm điều phối.
     - Thống kê tiến độ bảo dưỡng Tủ Hộp Cáp (THC) hoàn thành / tồn / quá hạn.
     - Bảng tiến độ xử lý trong 24h, 72h.
     - Bảng riêng biệt theo dõi Home Wifi thu kém và Port kém GPON (`DhPortKemTable`).
     - Drilldown xem từng WO và danh sách các tủ cáp con bên trong (`CodinhDrilldownModal`).
4. **`AdminCodinhPage.jsx`**:
   - Quản trị CĐBR:
     - Nạp file Excel WO CĐBR (chia nhỏ 8MB chunked).
     - Nạp file Excel danh sách Tủ Hộp Cáp THC (`cabinets/upload`).
     - Quản lý danh mục báo cáo CĐBR.
     - Nạp file danh sách thu hồi thiết bị `.txt`.
5. **`ThuHoiThietBiPage.jsx`**:
   - Tra cứu thiết bị thu hồi hàng tháng của FT:
     - Lọc theo Trung tâm Cụm xã và Nhân viên FT.
     - Phân loại rõ thiết bị thường và thiết bị MESH, tuổi thọ mesh.
     - Nút 1-click sao chép số thuê bao.
     - Xuất danh sách ra file CSV định dạng tiếng Việt mở bằng Excel.
6. **`SearchPage.jsx`**:
   - Tra cứu công việc nâng cao toàn hệ thống:
     - Gợi ý nhanh các tài khoản FT thường dùng (`FT_SUGGESTION_LIST`).
     - Bộ lọc đa chiều: Từ khóa, Nhóm, Nhân viên, Hệ thống, Loại việc, Trạng thái, Quá hạn, Khoảng ngày tạo.
     - Xem chi tiết công việc và thêm ghi chú trực tiếp.
7. **`CsdbPage.jsx`**:
   - Trang giới thiệu CSDL Trạm BTS & Máy Phát Điện (Đang phát triển).

### 6.2. Các Component Dùng Chung (`components/`):
- **`Header.jsx`**: Thanh menu điều hướng chính, chuyển đổi qua lại giữa Dashboard, Cố Định BR, Tra Cứu, Quản Trị, Thu Hồi Thiết Bị; công tắc chuyển Light/Dark mode; nút làm mới dữ liệu.
- **`TaskDrilldownModal.jsx`**: Modal hiển thị bảng danh sách công việc khi nhấp vào ô số liệu ma trận. Hỗ trợ tìm kiếm, phân trang, xuất Excel/CSV, xem chi tiết công việc.
- **`CodinhDrilldownModal.jsx`**: Modal drilldown của CĐBR, hiển thị trạng thái hoàn thành kèm danh sách tủ THC con của từng WO.
- **`TaskDetailModal.jsx`**: Modal xem thông tin chi tiết của 1 WO (thông tin trạm, FT, thời hạn, worklog, comment FT, lịch sử các lần import thay đổi dữ liệu, danh sách ghi chú nghiệp vụ và form thêm ghi chú mới).
- **`MaintenanceSpreadsheetTable.jsx`**: Bảng tính ma trận bảo dưỡng gồm các cột tổng, tồn, quá hạn, đóng hôm nay, 7 ngày qua, và các cột ngày từ 1 đến 31.
- **`DhPortKemTable.jsx`**: Bảng tính chuyên biệt cho việc Home Wifi thu kém & Port kém GPON của CĐBR.
- **`KpiCard.jsx`**: Thẻ số liệu chỉ số KPI giao diện hiện đại.

---

## 7. CÁC MODULE TIỆN ÍCH FRONTEND (`frontend/src/utils/`)

1. **`userMapping.js`**: dùng cho /codinh
   - `getUserFullName(username)`: Chuyển mã nhân viên (ví dụ `d00170579`, `hiennv41`) sang tên tiếng Việt (ví dụ `Phan Văn Thọ`, `Nguyễn Văn Hiền`).
   - `getUserInitials(username)`: Lấy chữ cái viết tắt đại diện avatar.
2. **`groupFormat.js`**:
   - `formatGroupName(groupName)`: Rút gọn và chuẩn hoá chuỗi tên nhóm điều phối (bỏ tiền tố thừa, chuẩn hoá tên cụm huyện/xã).
3. **`dateFormat.js`**:
   - `formatDateTime(dateStr)`: Định dạng ngày giờ chuẩn `DD/MM/YYYY HH:mm`.
   - `formatDate(dateStr)`: Định dạng ngày `DD/MM/YYYY`.
   - `formatDataTimestamp(isoStr)`: Hiển thị thời điểm dữ liệu được nạp để báo tính "tươi mới" của số liệu.

---

## 8. HƯỚNG DẪN PROMPT CHO AI CHO CÁC TÁC VỤ SAU NÀY (PROMPTING CHEATSHEET)

Khi bạn muốn yêu cầu AI chỉnh sửa hay thêm tính năng mới, bạn có thể tham chiếu ngay các thành phần sau:

1. **Thêm hoặc sửa logic tính toán bảo dưỡng Cơ điện:**
   - Xem hàm `get_special_maintenance_stats()` và `get_special_maintenance_tasks()` trong [stats_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/stats_service.py).
   - Component hiển thị: [MaintenanceSpreadsheetTable.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/components/MaintenanceSpreadsheetTable.jsx).
2. **Thêm hoặc sửa logic Cố Định Băng Rộng (CĐBR) và Tủ THC:**
   - Xem hàm `get_codinh_stats()` và `get_codinh_drilldown_tasks()` trong [codinh_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/codinh_service.py).
   - Trang hiển thị: [CodinhPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/CodinhPage.jsx) và modal [CodinhDrilldownModal.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/components/CodinhDrilldownModal.jsx).
3. **Sửa quy trình nạp file Excel dung lượng lớn (Chunked Upload / ETL):**
   - API upload: [router_imports.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_imports.py) (Chunk 8MB).
   - Quá trình ETL ngầm: `process_excel_import()` trong [etl_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/etl_service.py).
   - Quản trị upload trên giao diện: [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `files`).
4. **Sửa logic Báo cáo danh sách WO Cố định (Fixed WO):**
   - Service: [fixed_wo_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/fixed_wo_service.py).
   - Router: [router_fixed_wo.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_fixed_wo.py).
   - Quản trị trên giao diện: [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `fixed_wo`).
5. **Sửa tính năng Thu hồi thiết bị:**
   - Service: [device_recall_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/device_recall_service.py).
   - Trang hiển thị: [ThuHoiThietBiPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/ThuHoiThietBiPage.jsx).
6. **Thêm hoặc sửa Danh mục báo cáo & Từ khóa đầu việc con:**
   - Service: [report_category_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/report_category_service.py).
   - Router: [router_report_categories.py](file:///e:/CodeVCC2/KpiCoDien/backend/api/router_report_categories.py).
   - Quản trị trên giao diện: [AdminPage.jsx](file:///e:/CodeVCC2/KpiCoDien/frontend/src/pages/AdminPage.jsx) (tab `categories`).
7. **Thêm trường dữ liệu mới vào công việc:**
   - Cập nhật model: [task.py](file:///e:/CodeVCC2/KpiCoDien/backend/models/task.py) hoặc [task_codinh.py](file:///e:/CodeVCC2/KpiCoDien/backend/models/task_codinh.py).
   - Thêm câu lệnh `ALTER TABLE` vào `auto_migrate_db()` trong [main.py](file:///e:/CodeVCC2/KpiCoDien/backend/main.py).
   - Thêm ánh xạ cột trong `process_excel_import()` ([etl_service.py](file:///e:/CodeVCC2/KpiCoDien/backend/services/etl_service.py)).
