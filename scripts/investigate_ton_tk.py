import sys
from pathlib import Path

# UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.database import SessionLocal
from backend.models.task_qlctkt import TaskQlctkt
from backend.services.codinh.qlctkt_metrics import get_qlctkt_ton_tk_condition
from backend.services.codinh.org import get_org_lookup

def main():
    db = SessionLocal()
    try:
        cond_ton_tk = get_qlctkt_ton_tk_condition()
        
        # 1. Total tasks matching condition
        q_all = db.query(TaskQlctkt).filter(TaskQlctkt.is_cskh_2022 == False, cond_ton_tk)
        total_matching = q_all.count()
        print(f"Tổng số Task QLCTKT thỏa cond_ton_tk (is_cskh_2022==False): {total_matching}")
        
        # 2. Count by is_huy
        q_raw = db.query(TaskQlctkt).filter(
            TaskQlctkt.is_cskh_2022 == False,
            ~TaskQlctkt.tien_do.in_(["Kết thúc", "Cập nhật hồ sơ"])
        )
        print(f"Tổng số Task chưa kết thúc/cập nhật hồ sơ (chưa xét is_huy): {q_raw.count()}")
        
        huy_count = q_raw.filter(TaskQlctkt.is_huy == True).count()
        not_huy_count = q_raw.filter(TaskQlctkt.is_huy == False).count()
        print(f"  - Hiện tại trong DB: is_huy == True: {huy_count}")
        print(f"  - Hiện tại trong DB: is_huy == False (chính là ton_tk = {not_huy_count})")
        
        # Check all tasks in q_raw
        re_word = re.compile(r"(?<![^\W\d_])(huy|hủy|huỷ)(?![^\W\d_])", re.IGNORECASE)
        all_raw_tasks = q_raw.all()
        
        # Test 1: STRICT definition from prompt 1B:
        # has_gc (regex) OR ly_do_tich_huy not empty OR ngay_tich_huy not empty
        strict_huy = []
        strict_not_huy = []
        for t in all_raw_tasks:
            gc = t.ghi_chu_dau_moi or ""
            has_gc = bool(re_word.search(gc))
            ld = (t.ly_do_tich_huy or "").strip()
            has_ld = bool(ld and ld.lower() not in ("nan", "none", "null", "nat", "0", "-", "false"))
            nth = (t.ngay_tich_huy or "").strip()
            has_nth = bool(nth and nth.lower() not in ("nan", "none", "null", "nat", "0", "-", "false"))
            
            if has_gc or has_ld or has_nth:
                strict_huy.append(t)
            else:
                strict_not_huy.append(t)
                
        print(f"\n[Test 1] Định nghĩa STRICT theo Prompt 1B (Regex Ghi chú OR Lý do OR Ngày tích hủy):")
        print(f"  - strict_huy: {len(strict_huy)}")
        print(f"  - strict_not_huy (ton_tk): {len(strict_not_huy)}")
        
        # Test 2: What if ONLY regex on ghi chú?
        gc_huy = [t for t in all_raw_tasks if re_word.search(t.ghi_chu_dau_moi or "")]
        print(f"[Test 2] Chỉ xét regex trên ghi chú: ton_tk = {len(all_raw_tasks) - len(gc_huy)} (huy={len(gc_huy)})")
        
        print(f"\n[Chi tiết 73 tasks bị is_huy=True]:")
        c_gc = sum(1 for t in strict_huy if re_word.search(t.ghi_chu_dau_moi or ""))
        c_ld = sum(1 for t in strict_huy if (t.ly_do_tich_huy or "").strip() and (t.ly_do_tich_huy or "").strip().lower() not in ("nan", "none", "null", "nat", "0", "-", "false"))
        c_nth = sum(1 for t in strict_huy if (t.ngay_tich_huy or "").strip() and (t.ngay_tich_huy or "").strip().lower() not in ("nan", "none", "null", "nat", "0", "-", "false"))
        print(f"  - Có regex trong Ghi chú: {c_gc}")
        print(f"  - Có Lý do tích hủy: {c_ld}")
        print(f"  - Có Ngày tích hủy: {c_nth}")
        
        # Check tasks that have ONLY Ngày tích hủy or ONLY Lý do tích hủy (not having regex in Ghi chú)
        only_nth_or_ld = [t for t in strict_huy if not re_word.search(t.ghi_chu_dau_moi or "")]
        print(f"  - Không có regex Ghi chú nhưng có Ngày/Lý do tích hủy: {len(only_nth_or_ld)} tasks")
        for t in only_nth_or_ld[:15]:
            print(f"    Task {t.task_id}: ld='{t.ly_do_tich_huy}', nth='{t.ngay_tich_huy}', gc='{(t.ghi_chu_dau_moi or '')[:30]}'")

        # Test 4: Could the 424 come from pandas calculation in prompt?
        # "Viết scripts/verify_su_co.py: tính độc lập bằng pandas từ 2 file mẫu, so với API, in bảng chênh lệch; mọi chênh lệch phải = 0.
        #  Số golden (now = 2026-10-16 09:56:38). Số QLCTKT phụ thuộc file QLCTKT_20261016, GNOC = Log_GNOC_2026-08-01_den_2026-10-17.xlsx"
        # Let's inspect active file path from ImportLog
        from backend.models.import_log import ImportLog
        log_ql = db.query(ImportLog).filter(ImportLog.domain == 'qlctkt', ImportLog.status == 'COMPLETED').order_by(ImportLog.id.desc()).first()
        if log_ql:
            fn = log_ql.stored_filename or log_ql.file_name
            fpath = Path("uploads") / fn if fn else None
            print(f"\nFile QLCTKT active: {log_ql.file_name} (path: {fpath})")
            if fpath and fpath.exists():
                import pandas as pd
                df = pd.read_excel(fpath, header=7) # line 8 is index 7
                print(f"  Shape: {df.shape}")
                print(f"  Columns: {list(df.columns)}")


    finally:
        db.close()

if __name__ == "__main__":
    import re
    main()
