import sys
import os
import subprocess
import time
import webbrowser
from pathlib import Path

# Configure UTF-8 output for Windows console
sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = Path(__file__).resolve().parent

def print_banner():
    print("=" * 70)
    print("   HỆ THỐNG THỐNG KÊ & THEO DÕI TIẾN ĐỘ CÔNG VIỆC CƠ ĐIỆN VCC")
    print("=" * 70)
    print()

def step_1_seed_database():
    print("[1/4] Kiểm tra cơ sở dữ liệu và dữ liệu demo...")
    try:
        from backend.database import SessionLocal, Base, engine
        import backend.models
        Base.metadata.create_all(bind=engine)

        from backend.models import Task, ImportLog
        from backend.services.etl_service import process_excel_import

        db = SessionLocal()
        task_count = db.query(Task).count()
        if task_count > 0:
            print(f"  -> Cơ sở dữ liệu đã sẵn sàng ({task_count} công việc).")
            db.close()
            return

        excel_file = ROOT_DIR / "demofile.xlsx"
        if excel_file.exists():
            print(f"  -> Đang nạp dữ liệu từ {excel_file.name}...")
            print("  -> Đang lọc bỏ dữ liệu SPM/SPM_VTNET và đồng bộ...")
            import_log = ImportLog(
                file_name=excel_file.name,
                status="PENDING",
                progress_percent=0
            )
            db.add(import_log)
            db.commit()
            db.refresh(import_log)
            import_id = import_log.id
            db.close()

            process_excel_import(import_id, str(excel_file))

            db = SessionLocal()
            res = db.query(ImportLog).filter(ImportLog.id == import_id).first()
            print(f"  -> Hoàn thành nạp demo: Thêm {res.inserted_count} công việc (Đã lọc {res.filtered_out_count} dòng SPM).")
            db.close()
        else:
            print("  -> Không tìm thấy demofile.xlsx, bỏ qua bước nạp dữ liệu ban đầu.")
            db.close()
    except Exception as e:
        print(f"  [CẢNH BÁO] Không thể nạp demo tự động: {e}")
        print("  -> Bạn vẫn có thể upload file trực tiếp qua giao diện web.")

def step_2_check_frontend():
    print("[2/4] Kiểm tra thư viện Frontend (React + Vite)...")
    frontend_dir = ROOT_DIR / "frontend"
    node_modules = frontend_dir / "node_modules"

    if not node_modules.exists():
        print("  -> Đang cài đặt thư viện frontend (chỉ thực hiện 1 lần duy nhất, vui lòng chờ)...")
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        try:
            res = subprocess.run([npm_cmd, "install"], cwd=str(frontend_dir), check=True)
            print("  -> Cài đặt thư viện frontend thành công!")
        except Exception as e:
            print(f"  [LỖI] Cài đặt npm thất bại: {e}")
            print("  Vui lòng đảm bảo máy tính đã cài đặt Node.js từ https://nodejs.org")
            return False
    else:
        print("  -> Thư viện Frontend đã có sẵn.")
    return True

def main():
    print_banner()

    # Step 1: Seed database
    step_1_seed_database()
    print()

    # Step 2: Install frontend if needed
    fe_ok = step_2_check_frontend()
    print()

    # Step 3: Start backend
    print("[3/4] Đang khởi chạy Backend FastAPI trên cổng 8000...")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
        cwd=str(ROOT_DIR)
    )

    # Step 4: Start frontend
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    print("[4/4] Đang khởi chạy Frontend React Vite trên cổng 3000...")
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev", "--", "--host", "0.0.0.0"],
        cwd=str(ROOT_DIR / "frontend")
    )

    # Get local LAN IP
    local_ip = "127.0.0.1"
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    print()
    print("=" * 70)
    print("   HỆ THỐNG ĐANG CHẠY THÀNH CÔNG!")
    print("   - Máy của bạn (Local):     http://localhost:3000")
    print(f"   - Người khác (Cùng Wi-Fi/LAN): http://{local_ip}:3000")
    print("   - Swagger API Docs:        http://localhost:8000/api/docs")
    print("=" * 70)
    print("   Nhấn Ctrl+C trong cửa sổ này để tắt toàn bộ hệ thống.")
    print()

    # Wait 2.5 seconds and open browser
    time.sleep(2.5)
    webbrowser.open("http://localhost:3000")

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nĐang dừng hệ thống...")
        backend_proc.terminate()
        frontend_proc.terminate()
        print("Đã tắt hoàn tất.")

if __name__ == "__main__":
    main()
