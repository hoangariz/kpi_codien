import os
import re
import time
import unicodedata
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import SessionLocal, is_sqlite
from backend.models.task_qlctkt import TaskQlctkt
from backend.models.import_log import ImportLog
from backend.models.settings import SystemSetting
from backend.services.codinh.normalize import normalize_key
from backend.services.codinh.org import get_org_lookup, bump_org_version, ensure_org_columns_and_backfill

_qlctkt_version: int = 1


def bump_qlctkt_version():
    global _qlctkt_version
    _qlctkt_version += 1


def get_qlctkt_version() -> int:
    return _qlctkt_version


def _set_setting(db: Session, key: str, value: str, commit: bool = True):
    item = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if item:
        item.value = value
        item.updated_at = datetime.utcnow()
    else:
        item = SystemSetting(key=key, value=value, updated_at=datetime.utcnow())
        db.add(item)
    if commit:
        db.commit()


def _get_setting(db: Session, key: str, default: Optional[str] = None) -> Optional[str]:
    item = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return item.value if item else default


def parse_qlctkt_datetime(val: Any) -> Optional[datetime]:
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.to_pydatetime() if hasattr(val, "to_pydatetime") else val
    s = str(val).strip()
    if not s or s.lower() in ("nan", "nat", "none"):
        return None
    # Parse formats: %d/%m/%Y %H:%M:%S, %d/%m/%Y %H:%M, %d/%m/%Y, %Y-%m-%d %H:%M:%S
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


def clean_task_id(val: Any) -> Optional[str]:
    if val is None or pd.isna(val):
        return None
    try:
        # Cast float to int then string
        return str(int(float(val)))
    except Exception:
        s = str(val).strip()
        if s.endswith(".0"):
            s = s[:-2]
        return s if s else None


def import_qlctkt_from_excel(
    db: Session,
    file_path: Union[str, Path],
    filename: str,
    import_id: Optional[int] = None
) -> Dict[str, Any]:
    t_start = time.perf_counter()
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File {file_path} không tồn tại")

    ensure_org_columns_and_backfill(db)

    import_record = None
    if import_id:
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if import_record:
            import_record.status = "PROCESSING"
            import_record.progress_percent = 10
            db.commit()

    file_path_str = str(path_obj)
    # 1. Read sheet 1 without header first to detect header row
    try:
        df_raw = pd.read_excel(file_path_str, header=None, engine="calamine")
    except Exception:
        try:
            df_raw = pd.read_excel(file_path_str, header=None, engine="openpyxl")
        except Exception as ex:
            raise ValueError(f"Không thể đọc file Excel QLCTKT: {ex}")

    # 2. Header detection in first 20 rows
    header_idx = None
    for r_idx in range(min(20, len(df_raw))):
        row_vals = [str(x).strip().lower() for x in df_raw.iloc[r_idx] if pd.notna(x)]
        has_stt = any(s == "stt" for s in row_vals)
        has_tiendo = any("tiến độ công việc" in s for s in row_vals)
        if has_stt and has_tiendo:
            header_idx = r_idx
            break

    if header_idx is None:
        raise ValueError("Không tìm thấy dòng header chứa cả 'STT' và 'Tiến độ công việc' trong 20 dòng đầu")

    # Re-slice DataFrame from header_idx
    header_row = [re.sub(r'\s+', ' ', str(c).strip().replace('\ufeff', '')) for c in df_raw.iloc[header_idx]]
    df = df_raw.iloc[header_idx + 1:].copy()
    df.columns = header_row

    # Helper to strip Vietnamese accents for completely robust column matching
    def strip_accents(s: Any) -> str:
        if s is None:
            return ""
        val = unicodedata.normalize('NFD', str(s))
        val = ''.join(c for c in val if unicodedata.category(c) != 'Mn')
        val = val.replace('đ', 'd').replace('Đ', 'D')
        return re.sub(r'\s+', ' ', val).strip().lower()

    # Helper to find column by regex / case-insensitive search
    def find_col(*patterns):
        for pat in patterns:
            pat_un = strip_accents(pat)
            for c in df.columns:
                c_un = strip_accents(c)
                if pat_un in c_un:
                    return c
        return None

    col_task_id = find_col("task id", "mã task", "task_id", "taskid")
    col_loai_yc = find_col("loại yêu cầu", "loai_yeu_cau", "yêu cầu")
    col_dich_vu = find_col("dịch vụ", "dich_vu")
    col_account = find_col("account", "tài khoản", "mã thuê bao", "thuê bao")
    col_ten_kh = find_col("tên khách hàng", "ten_khach_hang", "khách hàng")
    col_dia_chi = find_col("địa chỉ lắp đặt", "dia_chi_lap_dat", "địa chỉ")
    col_to_doi = find_col("tổ đội", "to_doi", "tổ/đội", "đội")
    col_nv_th = find_col("nhân viên thực hiện", "nv_thuc_hien", "nhân viên", "người thực hiện")
    col_tram = find_col("trạm", "mã trạm", "tram")
    col_tien_do = find_col("tiến độ công việc", "tiến độ", "tien_do", "trạng thái công việc")
    col_ngay_tao = find_col("ngày tạo", "thời điểm tạo", "thời gian tạo", "ngay_tao")
    col_ngay_giao = find_col("ngày giao", "thời điểm giao", "thời gian giao", "ngay_giao")
    col_ngay_kt_dk = find_col("ngày kết thúc dự kiến", "kết thúc dự kiến", "ngay_ket_thuc_du_kien")
    col_ngay_cn = find_col("ngày cập nhật", "thời gian cập nhật", "ngay_cap_nhat")
    col_ngay_kt_tt = find_col(
        "ngày kết thúc thực tế",
        "thời điểm kết thúc thực tế",
        "thời gian kết thúc thực tế",
        "kết thúc thực tế",
        "ngày kết thúc",
        "ngày hoàn thành",
        "thời điểm kết thúc",
        "ngay_ket_thuc_thuc_te",
    )
    col_so_gio_ton = find_col("số giờ tồn", "giờ tồn", "so_gio_ton")
    col_ghi_chu = find_col("ghi chú đầu mối", "ghi_chu_dau_moi", "ghi chú")
    col_tich_hen = find_col("tích hẹn", "tich_hen")
    col_trang_thai_gpon = find_col("trạng thái đường dây gpon", "trạng thái đường dây", "đường dây gpon", "trang_thai_gpon")
    col_cmtask = find_col("cmtasktypename", "cmtasktype", "cm_task_type_name", "cm_task_type")
    col_ngay_tich_huy = find_col("ngày tích hủy", "ngay tich huy", "thời gian tích hủy", "thoi gian tich huy", "ngay_tich_huy")

    # Identify all columns related to cancellation reason & checkbox
    cancel_cols = []
    # 1. Exact match / strong pattern for reason columns
    for c in df.columns:
        c_un = strip_accents(c)
        if any(skip in c_un for skip in ["thoi gian", "thoi diem", "ngay", "nguoi", "huyen", "phan hoi"]):
            continue
        if any(p in c_un for p in ["ly do tich huy", "ly do huy", "tich ly do huy", "ly do tu choi", "ly do ko lam", "ly do khong lam"]):
            cancel_cols.append(c)
    # 2. Checkbox / other cancel columns
    for c in df.columns:
        c_un = strip_accents(c)
        if any(skip in c_un for skip in ["thoi gian", "thoi diem", "ngay", "nguoi", "huyen", "phan hoi"]):
            continue
        if ("tich huy" in c_un or re.search(r'\b(huy|tich huy)\b', c_un)) and c not in cancel_cols:
            cancel_cols.append(c)

    col_ly_do_tich_huy = cancel_cols[0] if cancel_cols else None

    if not col_task_id:
        raise ValueError("Không tìm thấy cột 'TASK ID' trong file Excel")

    if import_record:
        import_record.progress_percent = 30
        db.commit()

    # Pre-compile regex & target words for is_huy (khớp nguyên từ huy | hủy | huỷ)
    re_huy_word = re.compile(r'(?<![^\W\d_])(?:huy|hủy|huỷ)(?![^\W\d_])', re.IGNORECASE)
    HUY_TARGET_WORDS = {
        "huy",
        "hủy",
        "huỷ",
        unicodedata.normalize("NFC", "hủy"),
        unicodedata.normalize("NFC", "huỷ"),
        unicodedata.normalize("NFD", "hủy"),
        unicodedata.normalize("NFD", "huỷ"),
    }

    task_objects: List[Dict[str, Any]] = []
    parse_date_errors = 0
    total_valid_rows = 0

    for _, row in df.iterrows():
        raw_tid = row[col_task_id] if col_task_id else None
        tid_str = clean_task_id(raw_tid)
        if not tid_str:
            # Skip empty or footer row
            continue

        total_valid_rows += 1

        # Dates
        dt_tao = None
        if col_ngay_tao and pd.notna(row[col_ngay_tao]):
            dt_tao = parse_qlctkt_datetime(row[col_ngay_tao])
            if dt_tao is None and str(row[col_ngay_tao]).strip():
                parse_date_errors += 1

        dt_giao = None
        if col_ngay_giao and pd.notna(row[col_ngay_giao]):
            dt_giao = parse_qlctkt_datetime(row[col_ngay_giao])
            if dt_giao is None and str(row[col_ngay_giao]).strip():
                parse_date_errors += 1

        dt_kt_dk = None
        if col_ngay_kt_dk and pd.notna(row[col_ngay_kt_dk]):
            dt_kt_dk = parse_qlctkt_datetime(row[col_ngay_kt_dk])
            if dt_kt_dk is None and str(row[col_ngay_kt_dk]).strip():
                parse_date_errors += 1

        dt_cn = None
        if col_ngay_cn and pd.notna(row[col_ngay_cn]):
            dt_cn = parse_qlctkt_datetime(row[col_ngay_cn])
            if dt_cn is None and str(row[col_ngay_cn]).strip():
                parse_date_errors += 1

        dt_kt_tt = None
        if col_ngay_kt_tt and pd.notna(row[col_ngay_kt_tt]):
            dt_kt_tt = parse_qlctkt_datetime(row[col_ngay_kt_tt])
            if dt_kt_tt is None and str(row[col_ngay_kt_tt]).strip():
                parse_date_errors += 1

        # Float so_gio_ton
        so_gio_ton_val = None
        if col_so_gio_ton and pd.notna(row[col_so_gio_ton]):
            try:
                s_str = str(row[col_so_gio_ton]).strip()
                if s_str and s_str.lower() not in ("nan", "none", "null"):
                    so_gio_ton_val = round(float(s_str), 4)
            except Exception:
                so_gio_ton_val = None

        raw_nv = str(row[col_nv_th]).strip() if col_nv_th and pd.notna(row[col_nv_th]) else ""
        nv_key = normalize_key(raw_nv)

        raw_ghi_chu = str(row[col_ghi_chu]).strip() if col_ghi_chu and pd.notna(row[col_ghi_chu]) else ""
        ghi_chu_norm = normalize_key(raw_ghi_chu)
        # 1. ghi_chu_dau_moi (đã chuẩn hóa) khớp nguyên từ huy | hủy | huỷ
        words_ghi_chu = set(re.findall(r'[^\W\d_]+', ghi_chu_norm))
        has_word_huy = bool((words_ghi_chu & HUY_TARGET_WORDS) or re_huy_word.search(ghi_chu_norm))

        # 2. Hoặc cột Lý do tích hủy / tích hủy có chứa text
        raw_ly_do_huy = ""
        for col_c in cancel_cols:
            if pd.notna(row[col_c]):
                s_ld = str(row[col_c]).strip()
                if s_ld and s_ld.lower() not in ("nan", "none", "null", "nat", "0", "-", "false"):
                    raw_ly_do_huy = s_ld
                    break

        raw_ngay_tich_huy = ""
        if col_ngay_tich_huy and pd.notna(row[col_ngay_tich_huy]):
            s_nth = str(row[col_ngay_tich_huy]).strip()
            if s_nth and s_nth.lower() not in ("nan", "none", "null", "nat", "0", "-", "false"):
                raw_ngay_tich_huy = s_nth

        # Standardize tien_do
        raw_tien_do = str(row[col_tien_do]).strip() if col_tien_do and pd.notna(row[col_tien_do]) else ""
        tien_do_un = strip_accents(raw_tien_do)
        if "ket thuc" in tien_do_un:
            standard_tien_do = "Kết thúc"
        elif "cap nhat ho so" in tien_do_un:
            standard_tien_do = "Cập nhật hồ sơ"
        elif "huy" in tien_do_un:
            standard_tien_do = "Hủy"
        else:
            standard_tien_do = raw_tien_do if raw_tien_do else None

        is_tien_do_huy = bool("huy" in tien_do_un)

        is_huy = bool(has_word_huy or raw_ly_do_huy or raw_ngay_tich_huy or is_tien_do_huy)

        raw_gpon = str(row[col_trang_thai_gpon]).strip() if col_trang_thai_gpon and pd.notna(row[col_trang_thai_gpon]) else ""
        gpon_un = strip_accents(raw_gpon)
        is_duong_day_moi = bool("duong day moi" in gpon_un or "đường dây mới" in normalize_key(raw_gpon))

        raw_tich_hen = str(row[col_tich_hen]).strip() if col_tich_hen and pd.notna(row[col_tich_hen]) else ""
        tich_hen_norm = normalize_key(raw_tich_hen)
        words_th = set(re.findall(r'\b\w+\b', tich_hen_norm))
        is_tich_hen_ok = ("ok" in words_th)

        raw_cmtask = str(row[col_cmtask]).strip() if col_cmtask and pd.notna(row[col_cmtask]) else ""
        is_cskh_2022 = bool(normalize_key(raw_cmtask) == "cskh_2022")

        task_dict = {
            "task_id": tid_str,
            "loai_yeu_cau": str(row[col_loai_yc]).strip() if col_loai_yc and pd.notna(row[col_loai_yc]) else None,
            "dich_vu": str(row[col_dich_vu]).strip() if col_dich_vu and pd.notna(row[col_dich_vu]) else None,
            "account": str(row[col_account]).strip() if col_account and pd.notna(row[col_account]) else None,
            "ten_khach_hang": str(row[col_ten_kh]).strip() if col_ten_kh and pd.notna(row[col_ten_kh]) else None,
            "dia_chi_lap_dat": str(row[col_dia_chi]).strip() if col_dia_chi and pd.notna(row[col_dia_chi]) else None,
            "to_doi_raw": str(row[col_to_doi]).strip() if col_to_doi and pd.notna(row[col_to_doi]) else None,
            "nv_thuc_hien": raw_nv if raw_nv else None,
            "nv_key": nv_key if nv_key else None,
            "tram": str(row[col_tram]).strip() if col_tram and pd.notna(row[col_tram]) else None,
            "tien_do": standard_tien_do,
            "ngay_tao": dt_tao,
            "ngay_giao": dt_giao,
            "ngay_ket_thuc_du_kien": dt_kt_dk,
            "ngay_cap_nhat": dt_cn,
            "ngay_ket_thuc_thuc_te": dt_kt_tt,
            "so_gio_ton": so_gio_ton_val,
            "ghi_chu_dau_moi": raw_ghi_chu if raw_ghi_chu else None,
            "ly_do_tich_huy": raw_ly_do_huy if raw_ly_do_huy else None,
            "ngay_tich_huy": raw_ngay_tich_huy if raw_ngay_tich_huy else None,
            "tich_hen": raw_tich_hen if raw_tich_hen else None,
            "trang_thai_gpon": raw_gpon if raw_gpon else None,
            "cmtasktypename": raw_cmtask if raw_cmtask else None,
            "import_id": import_id,
            "import_filename": filename,
            "is_huy": is_huy,
            "is_duong_day_moi": is_duong_day_moi,
            "is_tich_hen_ok": is_tich_hen_ok,
            "is_cskh_2022": is_cskh_2022,
            "created_at": datetime.utcnow(),
        }
        task_objects.append(task_dict)

    if import_record:
        import_record.progress_percent = 70
        db.commit()

    # 3. Snapshot replacement in a single transaction
    # Delete existing qlctkt_tasks and bulk insert
    db.query(TaskQlctkt).delete()

    batch_size = 2000
    for i in range(0, len(task_objects), batch_size):
        chunk = task_objects[i:i + batch_size]
        db.bulk_insert_mappings(TaskQlctkt, chunk)

    # Update active import logs for domain='qlctkt'
    now_vn_str = (datetime.utcnow() + timedelta(hours=7)).strftime("%d/%m/%Y %H:%M")
    _set_setting(db, "qlctkt_last_update_vn", now_vn_str, commit=False)

    if import_record:
        import_record.total_rows = total_valid_rows
        import_record.inserted_count = len(task_objects)
        import_record.status = "COMPLETED"
        import_record.progress_percent = 100
        import_record.is_active = 1

    # Deactivate older qlctkt imports
    if import_id:
        db.query(ImportLog).filter(
            ImportLog.domain == "qlctkt",
            ImportLog.id != import_id
        ).update({"is_active": 0})
    else:
        # Create an import log if none provided
        new_log = ImportLog(
            file_name=filename,
            stored_filename=filename,
            file_size_bytes=os.path.getsize(file_path_str) if os.path.exists(file_path_str) else 0,
            is_active=1,
            total_rows=total_valid_rows,
            inserted_count=len(task_objects),
            status="COMPLETED",
            progress_percent=100,
            domain="qlctkt",
        )
        db.add(new_log)
        db.flush()
        import_id = new_log.id

    db.commit()
    bump_qlctkt_version()

    # 4. Cross check unmatched employee names and cluster comparison
    org = get_org_lookup(db)
    users_by_ho_ten = org.get("users_by_ho_ten", {})

    unmatched_counter: Dict[str, int] = {}
    mismatched_cluster_count = 0

    # Cluster mapping for cross check (7 clusters)
    cluster_norm_map = {
        "thạch hà": "thạch hà",
        "thach ha": "thạch hà",
        "nghi xuân-hồng lĩnh-đức thọ": "bắc hồng lĩnh",
        "nghi xuân": "bắc hồng lĩnh",
        "hồng lĩnh": "bắc hồng lĩnh",
        "đức thọ": "bắc hồng lĩnh",
        "kỳ anh": "sông trí",
        "ky anh": "sông trí",
        "can lộc-lộc hà": "can lộc",
        "can lộc": "can lộc",
        "lộc hà": "can lộc",
        "cẩm xuyên": "cẩm xuyên",
        "cam xuyen": "cẩm xuyên",
        "hương sơn-vũ quang": "sơn giang",
        "hương sơn": "sơn giang",
        "vũ quang": "sơn giang",
        "hương khê": "hương khê",
        "huong khe": "hương khê",
    }

    for t in task_objects:
        k = t["nv_key"]
        if not k or k not in users_by_ho_ten:
            display_name = t["nv_thuc_hien"] or k or "Chưa phân đội"
            unmatched_counter[display_name] = unmatched_counter.get(display_name, 0) + 1
        else:
            # Cross-check cluster
            u = users_by_ho_ten[k]
            org_cum_norm = normalize_key(u.get("ten_cum", ""))
            raw_to_doi = normalize_key(t.get("to_doi_raw", ""))
            mapped_cluster = cluster_norm_map.get(raw_to_doi, "")
            if mapped_cluster and org_cum_norm and mapped_cluster not in org_cum_norm and org_cum_norm not in mapped_cluster:
                mismatched_cluster_count += 1

    t_end = time.perf_counter()
    print(f"[ETL QLCTKT] Total rows: {total_valid_rows}, Inserted: {len(task_objects)}, Parse errors: {parse_date_errors}, Elapsed: {t_end - t_start:.2f}s", flush=True)

    return {
        "status": "success",
        "import_id": import_id,
        "total_rows": total_valid_rows,
        "inserted_count": len(task_objects),
        "parse_date_errors": parse_date_errors,
        "unmatched_employees": [{"name": k, "count": v} for k, v in unmatched_counter.items()],
        "unmatched_total_rows": sum(unmatched_counter.values()),
        "mismatched_cluster_count": mismatched_cluster_count,
        "cskh_2022_count": sum(1 for t in task_objects if t.get("is_cskh_2022")),
        "data_updated_at": now_vn_str,
        "duration_seconds": round(t_end - t_start, 2),
    }
