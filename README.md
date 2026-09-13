# Hệ Thống Thống Kê & Theo Dõi Tiến Độ Công Việc Cơ Điện VCC

Hệ thống chuyên dụng theo dõi tiến độ công việc được cập nhật định kỳ từ file Excel nguồn (20.000 - 100.000+ dòng).

---

## Cách Khởi Chạy Nhanh (1-Click)

Chỉ cần **nhấp đúp chuột vào file:**
👉 **`run.bat`**

File script sẽ tự động thực hiện:
1. Nạp và đồng bộ dữ liệu ban đầu từ `demofile.xlsx` vào cơ sở dữ liệu (tự động loại bỏ SPM/SPM_VTNET).
2. Tự động cài đặt thư viện frontend nếu chưa có.
3. Khởi động Backend API (Port 8000).
4. Khởi động Giao diện Frontend (Port 3000).
5. Tự động bật trình duyệt web tới địa chỉ: **`http://localhost:3000`**

---

## Tính Năng Chính

1. **Dashboard Tổng Quan**:
   - Thẻ số liệu KPI thời gian thực.
   - **Báo cáo chuyên biệt**: Thống kê loại công việc *"Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS"* theo **Nhân viên thực hiện** và **Nhóm điều phối**.
   - Biểu đồ phân bổ theo Nhóm điều phối và năng suất Nhân viên thực hiện.
   - Biểu đồ xu hướng tiến độ theo ngày.
2. **Bảo Dưỡng Cơ Điện**: Màn hình dành riêng cho việc phân tích, theo dõi hạng mục bảo dưỡng cơ điện định kỳ tại nhà trạm.
3. **Danh Sách Công Việc (Tasks)**:
   - Bộ lọc nhiều chiều (Nhóm, Nhân viên, Trạng thái, Loại việc, Trễ hạn, Từ khóa).
   - Nút 1-click lọc nhanh Bảo dưỡng cơ điện ICMS.
   - Xem chi tiết công việc, xem lịch sử biến động dữ liệu giữa các lần import, và thêm ghi chú nghiệp vụ riêng (bảo toàn không mất khi upload file mới).
4. **Import File Mới**: Kéo thả file Excel, thanh tiến trình real-time, báo cáo số dòng thêm mới, cập nhật, giữ nguyên và lọc bỏ.
5. **Lịch Sử Import**: Lưu vết chi tiết 50 lần đồng bộ gần nhất.

---

## Triển Khai Lên Máy Chủ aaPanel
Xem tài liệu hướng dẫn từng bước tại:
👉 **[deployment/AAPANEL_DEPLOY.md](deployment/AAPANEL_DEPLOY.md)**
# kpi_codien
