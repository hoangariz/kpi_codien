# Hướng Dẫn Triển Khai Hệ Thống KPI Cơ Điện Trên aaPanel

Tài liệu này hướng dẫn chi tiết từng bước đưa ứng dụng lên máy chủ chạy **aaPanel** với stack: **FastAPI + Gunicorn + Supervisor + Nginx + MySQL / MariaDB + React Vite Frontend**.

---

## 1. Chuẩn Bị Môi Trường Trên aaPanel

Vào mục **App Store** trên thanh menu trái của aaPanel và cài đặt các thành phần sau (nếu chưa có):
1. **Nginx** (phiên bản 1.22 hoặc mới hơn).
2. **MySQL** hoặc **MariaDB** (phiên bản MySQL 5.7/8.0 hoặc MariaDB 10.4+).
3. **Supervisor Manager** (trong App Store, hỗ trợ quản lý tiến trình Gunicorn).
4. **Node.js Version Manager** (cài Node.js LTS v18/v20 nếu build frontend trực tiếp trên server).

---

## 2. Tạo Cơ Sở Dữ Liệu MySQL Trên aaPanel

1. Vào menu **Databases** -> Click **Add Database**.
2. Thiết lập thông tin:
   - **Database name**: `kpi_codien`
   - **Username**: `kpi_user` (hoặc tên tùy chọn)
   - **Password**: `MatKhauManh123@#$` (sinh mật khẩu ngẫu nhiên bảo mật)
   - **Character Set**: `utf8mb4` (BẮT BUỘC để hỗ trợ đầy đủ tiếng Việt có dấu).
   - **Collation**: `utf8mb4_unicode_ci`
3. Click **Submit**.

### Tối Ưu Cấu Hình MySQL Cho File 100.000+ Dòng:
- Vào **App Store** -> Click **Settings** tại mục **MySQL** -> chọn tab **Configuration** (file `my.cnf`).
- Thêm hoặc điều chỉnh các tham số sau:
  ```ini
  max_allowed_packet = 128M
  innodb_buffer_pool_size = 1G # Hoặc 2G nếu VPS có từ 4GB RAM trở lên
  innodb_log_file_size = 256M
  interactive_timeout = 3600
  wait_timeout = 3600
  ```
- Click **Save** và **Restart MySQL**.

---

## 3. Upload Mã Nguồn Lên Server

1. Vào menu **Files** trên aaPanel.
2. Tạo thư mục: `/www/wwwroot/kpicodien`
3. Upload toàn bộ mã nguồn của dự án vào thư mục trên (hoặc dùng `git clone` qua Terminal aaPanel).

---

## 4. Thiết Lập Môi Trường Python Backend

Mở terminal (Terminal trong aaPanel hoặc SSH) và chạy các lệnh:

```bash
# 1. Di chuyển vào thư mục dự án
cd /www/wwwroot/kpicodien

# 2. Tạo môi trường ảo (virtual environment)
python3 -m venv venv

# 3. Kích hoạt môi trường và cài đặt thư viện
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

# 4. Cấu hình biến môi trường .env
cp .env.example .env
nano .env # hoặc mở file .env qua trình soạn thảo của aaPanel
```

Trong file `.env`, cập nhật chuỗi kết nối MySQL theo thông tin bạn vừa tạo ở Bước 2:
```env
DATABASE_URL=mysql+pymysql://kpi_user:MatKhauManh123@#$@127.0.0.1:3306/kpi_codien?charset=utf8mb4
CHUNK_SIZE=5000
DEBUG=False
```

---

## 5. Build Frontend (React + Vite)

Nếu build trực tiếp trên server:
```bash
cd /www/wwwroot/kpicodien/frontend
npm install
npm run build
```
*(Thư mục tĩnh `dist/` sẽ được tạo ra tại `/www/wwwroot/kpicodien/frontend/dist`)*.

---

## 6. Cấu Hình Supervisor Quản Lý Tiến Trình Backend

1. Vào **App Store** -> Click vào **Supervisor Manager**.
2. Click **Add Program**:
   - **Name**: `kpicodien`
   - **Run Directory**: `/www/wwwroot/kpicodien`
   - **Command**: `/www/wwwroot/kpicodien/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker backend.main:app -b 127.0.0.1:8000 --timeout 300`
   - **User**: `www`
   - **Processes**: `1`
3. Click **Confirm**. Kiểm tra trạng thái chương trình chuyển sang màu xanh lá (**RUNNING**).
*(Mỗi khi có cập nhật code backend, chỉ cần bấm nút **Restart** tại đây).*

---

## 7. Cấu Hình Website & Nginx Reverse Proxy Trên aaPanel

1. Vào menu **Website** -> Click **Add Site**.
   - **Domain**: Điền tên miền (vd `kpi.yourcompany.vn`) hoặc IP server kèm port.
   - **Root directory**: `/www/wwwroot/kpicodien/frontend/dist`
   - **PHP version**: `Pure (No PHP)`
2. Click **Submit**.
3. Click vào tên website vừa tạo -> chọn tab **Config** (Cấu hình Nginx):
   - Thay thế hoặc bổ sung các khối cấu hình từ file `deployment/nginx_kpicodien.conf`:
     - Bật `client_max_body_size 100M;`
     - Bật `gzip on;`
     - Cấu hình khối `location /api/ { proxy_pass http://127.0.0.1:8000; ... }`
     - Cấu hình `location /assets/ { ... }`
     - Cấu hình `location / { try_files $uri $uri/ /index.html; }`
4. Click **Save**.

---

## 8. Kiểm Tra Hoạt Động & Vận Hành Định Kỳ

- Truy cập trang web qua trình duyệt: `http://kpi.yourcompany.vn`
- Vào màn hình **Import File Mới**, upload file Excel (`demofile.xlsx`).
- Hệ thống sẽ tự động tạo bảng dữ liệu trên MySQL, tự động lọc bỏ các dòng `SPM`/`SPM_VTNET`, tính toán tiến độ và ghi nhận lịch sử biến động.
- Bạn có thể xem ngay báo cáo thống kê theo Nhân viên thực hiện và Nhóm điều phối tại mục **Bảo Dưỡng Cơ Điện** hoặc trên **Dashboard Tổng Quan**.
