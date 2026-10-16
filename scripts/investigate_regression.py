import sys
import os
import json
import re
from pathlib import Path
from datetime import datetime

# UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

import pandas as pd
from sqlalchemy import func, or_, text
from backend.database import SessionLocal
from backend.models.import_log import ImportLog
from backend.models.task_codinh import TaskCodinh
from backend.models.cabinet import Cabinet
from backend.services.codinh.normalize import is_su_co_task, is_hot_priority, normalize_key

def main():
    db = SessionLocal()
    try:
        print("=" * 80)
        print("MỤC 1: LỊCH SỬ IMPORT_LOGS (domain='codinh')")
        print("=" * 80)
        logs = db.query(ImportLog).filter(ImportLog.domain == "codinh").order_by(ImportLog.id.asc()).all()
        for l in logs:
            file_exists = (ROOT_DIR / "uploads" / (l.stored_filename or "")).exists() if l.stored_filename else False
            print(f"ID={l.id:3d} | active={l.is_active} | status={l.status:<10s} | "
                  f"rows={l.inserted_count or 0:5d}/{l.total_rows or 0:5d} | "
                  f"disk={'CÒN' if file_exists else 'MẤT':<3s} | "
                  f"imported_at={str(l.imported_at)[:19]} | "
                  f"file={l.file_name} -> stored={l.stored_filename}")

        # Kiểm tra file nào active khi chụp baseline (baseline tạo ~ 12-10-2026 hoặc 13-10-2026)
        print("\n--- Phân tích file active khi chụp baseline ---")
        logs_before_oct14 = [l for l in logs if l.imported_at and l.imported_at < datetime(2026, 10, 14)]
        print(f"Các file import CĐBR trước 14/10/2026: {len(logs_before_oct14)}")
        for l in logs_before_oct14:
            fpath = ROOT_DIR / "uploads" / (l.stored_filename or "")
            print(f"  - ID {l.id}: '{l.file_name}', stored='{l.stored_filename}', exists={fpath.exists()}")

        print("\n" + "=" * 80)
        print("MỤC 2: ĐIỀU TRA BẢNG CABINETS (TỦ HỘP CÁP)")
        print("=" * 80)
        total_cabs = db.query(Cabinet).count()
        print(f"1. Tổng số dòng trong bảng cabinets hiện tại: {total_cabs}")

        print("2. Thống kê cabinets theo (report_key, category_id, import_filename):")
        cab_groups = db.query(
            Cabinet.report_key,
            Cabinet.category_id,
            Cabinet.import_filename,
            func.count(Cabinet.id)
        ).group_by(Cabinet.report_key, Cabinet.category_id, Cabinet.import_filename).all()
        for rk, cid, ifn, cnt in cab_groups:
            print(f"   report_key='{rk}', category_id={cid}, import_filename='{ifn}' -> {cnt} dòng")

        # Kiểm tra distinct ma_wo trong cabinets
        dist_cab_wo = db.query(func.count(func.distinct(Cabinet.ma_wo))).scalar() or 0
        print(f"3. Số mã WO duy nhất (distinct ma_wo) trong cabinets: {dist_cab_wo}")

        # Kiểm tra join giữa cabinets và codinh_tasks hiện tại
        total_tasks = db.query(TaskCodinh).count()
        print(f"4. Tổng số WO trong codinh_tasks hiện tại: {total_tasks}")

        # Kiểm tra số lượng WO của 'ICMS_Bảo dưỡng THC' theo tháng
        print("5. Số WO 'ICMS_Bảo dưỡng THC' trong codinh_tasks theo tháng bắt đầu:")
        thc_tasks = db.query(
            func.strftime('%Y-%m', TaskCodinh.thoi_diem_bat_dau_thuc_hien),
            TaskCodinh.trang_thai,
            func.count(TaskCodinh.ma_cong_viec)
        ).filter(TaskCodinh.loai_cong_viec == "ICMS_Bảo dưỡng THC")\
         .group_by(func.strftime('%Y-%m', TaskCodinh.thoi_diem_bat_dau_thuc_hien), TaskCodinh.trang_thai).all()
        
        m_counts = {}
        for m, st, cnt in thc_tasks:
            m_key = m or "None"
            m_counts[m_key] = m_counts.get(m_key, 0) + cnt
        for m, cnt in sorted(m_counts.items()):
            print(f"   Tháng {m}: {cnt} WO THC")

        # Kiểm tra bao nhiêu cabinet ma_wo khớp với codinh_tasks hiện tại
        matched_cab_wos = db.query(func.count(func.distinct(Cabinet.ma_wo)))\
            .filter(Cabinet.ma_wo.in_(db.query(TaskCodinh.ma_cong_viec))).scalar() or 0
        print(f"6. Số ma_wo của cabinets có mặt trong codinh_tasks: {matched_cab_wos} / {dist_cab_wo}")

        # Kiểm tra riêng cho tháng 2026-08 của THC
        from backend.services.codinh.reports.thc import ThcReport
        rep_thc = ThcReport()
        q_aug = rep_thc.filter_tasks(db.query(TaskCodinh.ma_cong_viec))
        q_aug = rep_thc.apply_month_filter(q_aug, "2026-08", db)
        aug_wo_set = set(r[0] for r in q_aug.all())
        print(f"7. Tháng 2026-08 của THC: số WO hợp lệ = {len(aug_wo_set)} (kỳ vọng baseline: 2085)")
        aug_matched_cabs = db.query(func.count(Cabinet.id))\
            .filter(Cabinet.ma_wo.in_(aug_wo_set)).scalar() or 0
        print(f"   Số cabinet join được với WO tháng 2026-08: {aug_matched_cabs} (kỳ vọng baseline: 8513)")

        # Kiểm tra mẫu ma_wo trong cabinets vs codinh_tasks (check whitespace, lower/upper, kiểu số)
        print("8. Kiểm tra định dạng ma_wo và điều kiện filter:")
        sample_cabs = db.query(Cabinet.ma_wo).limit(5).all()
        print(f"   Mẫu ma_wo trong cabinets: {[r[0] for r in sample_cabs]}")
        sample_tasks = db.query(TaskCodinh.ma_cong_viec).filter(TaskCodinh.loai_cong_viec == "ICMS_Bảo dưỡng THC").limit(5).all()
        print(f"   Mẫu ma_cong_viec THC trong codinh_tasks: {[r[0] for r in sample_tasks]}")

        cab_wos_clean = [str(r[0]).strip().lower() for r in db.query(Cabinet.ma_wo).all() if r[0]]
        task_wos_clean = set(str(r[0]).strip().lower() for r in db.query(TaskCodinh.ma_cong_viec).all() if r[0])
        matches_clean = sum(1 for w in cab_wos_clean if w in task_wos_clean)
        print(f"   Khớp sau khi strip() và lower(): {matches_clean} / {len(cab_wos_clean)}")

        cab_filter_match = db.query(Cabinet).filter(
            or_(
                Cabinet.report_key == 'thc',
                Cabinet.report_key == None,
                Cabinet.category_id == 13
            )
        ).count()
        print(f"   Số dòng cabinets thỏa điều kiện filter của BaseReport (report_key='thc' or cat=13): {cab_filter_match} / {total_cabs}")

        # Kiểm tra xem có file tủ gốc trong thư mục uploads hoặc root không
        print("\n9. Kiểm tra file tủ gốc trên đĩa:")
        cab_files = list(ROOT_DIR.glob("*tu*.xlsx")) + list((ROOT_DIR / "uploads").glob("*tu*.xlsx"))
        cab_files += list(ROOT_DIR.glob("*cabinet*.xlsx")) + list((ROOT_DIR / "uploads").glob("*cabinet*.xlsx"))
        for cf in cab_files:
            print(f"   Tìm thấy file tủ: {cf.name} (size={cf.stat().st_size} bytes)")

        print("\n" + "=" * 80)
        print("MỤC 4: KIỂM TRA TRỰC TIẾP FILE MẪU GNOC (KHÔNG NẠP VÀO DB)")
        print("=" * 80)
        # Tìm file mẫu WoExport13_10_2026_08_14_41.xlsx hoặc 20261013_085759_3676e4ea69.xlsx
        target_sample = None
        for candidate in [
            ROOT_DIR / "WoExport13_10_2026_08_14_41.xlsx",
            ROOT_DIR / "uploads" / "20261013_085759_3676e4ea69.xlsx",
            ROOT_DIR / "demofile.xlsx",
        ]:
            if candidate.exists():
                target_sample = candidate
                break

        if not target_sample:
            for f in (ROOT_DIR / "uploads").glob("*.xlsx"):
                if "13_10" in f.name:
                    target_sample = f
                    break

        if target_sample:
            print(f"Đọc file: {target_sample.name} ({target_sample.stat().st_size} bytes)")
            try:
                df = pd.read_excel(str(target_sample), engine="calamine")
            except Exception:
                try:
                    df = pd.read_excel(str(target_sample), engine="openpyxl")
                except Exception:
                    df = pd.read_excel(str(target_sample))

            df.columns = [re.sub(r'\s+', ' ', str(c).strip().replace('\ufeff', '')) for c in df.columns]
            print(f"Tổng số dòng trong file mẫu: {len(df)}")
            col_l = next((c for c in df.columns if "loại" in c.lower() and "công việc" in c.lower()), None)
            col_nd = next((c for c in df.columns if "nội dung" in c.lower() and "công việc" in c.lower()), None)
            col_ut = next((c for c in df.columns if "ưu tiên" in c.lower()), None)
            print(f"Cột Loại công việc: '{col_l}'")
            print(f"Cột Nội dung công việc: '{col_nd}'")
            print(f"Cột Mức độ ưu tiên: '{col_ut}'")

            if col_l and col_nd:
                c_su_co = [is_su_co_task(l, nd) for l, nd in zip(df[col_l], df[col_nd])]
                c_hot = [is_hot_priority(ut) for ut in df[col_ut]] if col_ut else [0]*len(df)

                total_sc = sum(c_su_co)
                total_h = sum(c_hot)
                hot_in_sc = sum(1 for sc, h in zip(c_su_co, c_hot) if sc == 1 and h == 1)

                print(f"\nKẾT QUẢ ĐỐI CHIẾU FILE MẪU:")
                print(f"  1. Tổng is_su_co: {total_sc} (Kỳ vọng: 7035) -> {'KHỚP 100%' if total_sc == 7035 else 'LỆCH'}")
                print(f"  2. Tổng is_hot toàn file: {total_h} (Kỳ vọng: 1121) -> {'KHỚP 100%' if total_h == 1121 else 'LỆCH'}")
                print(f"  3. is_hot trong nhóm is_su_co: {hot_in_sc} (Kỳ vọng: 817) -> {'KHỚP 100%' if hot_in_sc == 817 else 'LỆCH'}")
        else:
            print("[LỖI] Không tìm thấy file mẫu WoExport13_10_2026_08_14_41.xlsx trên đĩa!")

    finally:
        db.close()

if __name__ == "__main__":
    main()
