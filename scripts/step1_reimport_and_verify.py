import sys
import os
import json
from pathlib import Path
from datetime import datetime

# UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.database import SessionLocal, engine
from backend.main import auto_migrate_db
from backend.models.import_log import ImportLog
from backend.models.task_codinh import TaskCodinh
from backend.services.codinh.importer import import_codinh_wos_from_excel
from backend.services.codinh.normalize import is_su_co_task, is_hot_priority
from scripts.verify_backend_codinh import run_verification

def main():
    print("=" * 80)
    print("BƯỚC 1: CHẠY AUTO_MIGRATE_DB (THÊM CỘT muc_do_uu_tien, is_su_co, is_hot)")
    print("=" * 80)
    auto_migrate_db()
    print("[OK] Migration hoàn tất an toàn cho DB!\n")

    db = SessionLocal()
    try:
        print("=" * 80)
        print("BƯỚC 2: TÌM FILE GNOC ĐANG ACTIVE VÀ NẠP LẠI (KÍCH HOẠT LẠI)")
        print("=" * 80)
        active_log = db.query(ImportLog).filter(
            ImportLog.domain == "codinh",
            ImportLog.is_active == 1
        ).order_by(ImportLog.imported_at.desc()).first()

        if not active_log:
            print("[WARN] Chưa có file GNOC is_active=1, lấy file GNOC mới nhất status=COMPLETED...")
            active_log = db.query(ImportLog).filter(
                ImportLog.domain == "codinh",
                ImportLog.status == "COMPLETED"
            ).order_by(ImportLog.imported_at.desc()).first()

        if not active_log:
            raise RuntimeError("Không tìm thấy bất kỳ file GNOC nào trong import_logs (domain='codinh')!")

        print(f"File GNOC active hiện tại:")
        print(f"  - ID: {active_log.id}")
        print(f"  - Tên gốc: {active_log.file_name}")
        print(f"  - File lưu trữ: {active_log.stored_filename}")
        print(f"  - Trạng thái: {active_log.status}")

        file_path = ROOT_DIR / "uploads" / active_log.stored_filename
        if not file_path.exists():
            raise FileNotFoundError(f"File không tồn tại trên đĩa: {file_path}")

        print(f"Bắt đầu nạp lại file {file_path.name}...")
        res = import_codinh_wos_from_excel(
            db=db,
            file_path=file_path,
            filename=active_log.file_name,
            import_id=active_log.id
        )
        print(f"[OK] Nạp lại thành công: {res['inserted_count']}/{res['total_rows']} dòng.\n")

        print("=" * 80)
        print("BƯỚC 3: KIỂM TRA DỮ LIỆU SỰ CỐ VÀ HOT TRÊN BẢNG codinh_tasks")
        print("=" * 80)
        total_wos = db.query(TaskCodinh).count()
        total_su_co = db.query(TaskCodinh).filter(TaskCodinh.is_su_co == 1).count()
        total_hot = db.query(TaskCodinh).filter(TaskCodinh.is_hot == 1).count()
        total_su_co_hot = db.query(TaskCodinh).filter(
            TaskCodinh.is_su_co == 1,
            TaskCodinh.is_hot == 1
        ).count()

        print(f"Tổng số WO trong DB: {total_wos}")
        print(f"Tổng số WO sự cố (is_su_co = 1): {total_su_co}")
        print(f"Tổng số WO HOT toàn bảng (is_hot = 1): {total_hot}")
        print(f"Tổng số WO HOT trong nhóm sự cố (is_su_co=1 & is_hot=1): {total_su_co_hot}")

        # Tìm file mẫu WoExport13_10_2026_08_14_41.xlsx để kiểm tra golden 7035
        sample_path = None
        for p in [ROOT_DIR / "WoExport13_10_2026_08_14_41.xlsx", ROOT_DIR / "uploads" / "20261013_085759_3676e4ea69.xlsx"]:
            if p.exists():
                sample_path = p
                break
        if not sample_path:
            for p in (ROOT_DIR / "uploads").glob("*.*"):
                if "woexport13_10_2026" in p.name.lower():
                    sample_path = p
                    break

        if sample_path:
            print(f"\n[KIỂM TRA TRỰC TIẾP FILE MẪU]: {sample_path.name}")
            import pandas as pd
            try:
                df_sample = pd.read_excel(str(sample_path), engine="calamine")
            except Exception:
                try:
                    df_sample = pd.read_excel(str(sample_path), engine="openpyxl")
                except Exception:
                    df_sample = pd.read_excel(str(sample_path))
            import re
            df_sample.columns = [re.sub(r'\s+', ' ', str(c).strip().replace('\ufeff', '')) for c in df_sample.columns]
            col_l = next((c for c in df_sample.columns if "loại" in c.lower() and "công việc" in c.lower()), None)
            col_nd = next((c for c in df_sample.columns if "nội dung" in c.lower() and "công việc" in c.lower()), None)
            col_ut = next((c for c in df_sample.columns if "ưu tiên" in c.lower()), None)
            if col_l and col_nd:
                s_su_co = [is_su_co_task(l, nd) for l, nd in zip(df_sample[col_l], df_sample[col_nd])]
                s_hot = [is_hot_priority(ut) if ut else 0 for ut in df_sample[col_ut]] if col_ut else [0]*len(df_sample)
                su_co_cnt = sum(s_su_co)
                hot_in_su_co = sum(1 for sc, h in zip(s_su_co, s_hot) if sc == 1 and h == 1)
                print(f"  -> File mẫu tổng dòng: {len(df_sample)}")
                print(f"  -> is_su_co = {su_co_cnt} (Kỳ vọng: 7035) -> {'ĐẠT CHUẨN' if su_co_cnt == 7035 else 'LỆCH'}")
                print(f"  -> is_hot trong nhóm sự cố: {hot_in_su_co}")

        print("\n" + "=" * 80)
        print("BƯỚC 4: CHẠY KIỂM TRA ĐỐI CHIẾU BASELINE (THC VÀ PORT_KEM)")
        print("=" * 80)
    finally:
        db.close()

    # Chạy verify_backend_codinh để đối chiếu baseline thc & port_kem
    run_verification()

if __name__ == "__main__":
    main()
