import os
import sys
import json
import re
import time

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text, insert

from backend.database import SessionLocal, is_sqlite
from backend.models.task_codinh import TaskCodinh
from backend.models.cabinet import Cabinet
from backend.models.settings import SystemSetting
from backend.models.import_log import ImportLog
from backend.config import UPLOAD_DIR
from backend.services.codinh.normalize import (
    is_su_co_task,
    is_hot_priority,
    is_tam_dung_status,
    is_open_status,
    normalize_key,
    SU_CO_TASK_TYPE_NORM,
    SU_CO_KEYWORD_NORM,
    is_soc_mat_tin_hieu_content,
    is_ho_tro_dich_vu_content,
)

CLOSED_STATUSES = ["Đóng", "FT hoàn thành", "FT Hoàn thành", "FT Hoàn Thành"]

_wo_version: int = 1
_cabinet_version: int = 1


def bump_wo_version():
    global _wo_version
    _wo_version += 1


def get_wo_version() -> int:
    return _wo_version


def bump_cabinet_version():
    global _cabinet_version
    _cabinet_version += 1


def get_cabinet_version() -> int:
    return _cabinet_version


def _vectorize_str_col(series: Optional[pd.Series], n: int, default_val: Optional[str] = None) -> list:
    """Vectorized string cleaning: strips whitespace, converts empty/'nan'/'none' to default_val or None."""
    if series is None:
        return [default_val] * n
    s = series.astype("string").str.strip()
    s_clean = s.mask(s.isna() | s.str.lower().isin(["", "nan", "nat", "none", "<na>"]), default_val)
    return [str(x) if x is not None and not pd.isna(x) else default_val for x in s_clean]


def _vectorize_float_col(series: Optional[pd.Series], n: int) -> list:
    """Vectorized float cleaning: converts to numeric, inf to NaN, rounds to 4 decimals.
    Accepts both '.' and ',' decimal separators without altering already valid numeric values.
    """
    if series is None:
        return [None] * n
    s = series
    if pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s):
        s = s.astype("string").str.replace(",", ".", regex=False)
    num = pd.to_numeric(s, errors="coerce")
    num = num.mask(np.isinf(num), np.nan).round(4)
    return [float(x) if pd.notna(x) else None for x in num]


def _vectorize_dt_col(series: Optional[pd.Series], n: int) -> list:
    """Vectorized datetime parsing (optimized for 2GB VPS)."""
    if series is None:
        return [None] * n

    # Step 1: parse standard dd/MM/yyyy HH:mm:ss
    dt = pd.to_datetime(series, format="%d/%m/%Y %H:%M:%S", errors="coerce")
    
    # Step 2: Only fallback for non-empty string cells (skip all NaN/blank cells to avoid mixed format slowdown)
    mask_na = dt.isna() & series.notna()
    if mask_na.any():
        sub_series = series[mask_na].astype(str).str.strip()
        sub_valid = sub_series.isin(["", "nan", "none", "nat", "<na>"]) == False
        if sub_valid.any():
            real_sub = sub_series[sub_valid]
            dt_mixed = pd.to_datetime(real_sub, dayfirst=True, format="mixed", errors="coerce")
            dt.update(dt_mixed)

            mask_still_na = dt.isna() & mask_na
            if mask_still_na.any():
                nums = pd.to_numeric(series[mask_still_na], errors="coerce")
                num_valid = nums.notna() & (nums > 10000) & (nums < 100000)
                if num_valid.any():
                    dt_serial = pd.to_datetime(nums[num_valid], unit="D", origin="1899-12-30", errors="coerce")
                    dt.update(dt_serial)

    arr = pd.DatetimeIndex(dt).to_pydatetime()
    return [None if (val is None or pd.isna(val) or str(val) == "NaT") else (val.to_pydatetime() if hasattr(val, "to_pydatetime") else val) for val in arr]


def _write_progress_file(file_path: str, progress_percent: int, inserted_count: int, total_rows: int):
    prog_file = f"{file_path}.progress"
    tmp_file = f"{file_path}.progress.tmp"
    data = {
        "progress_percent": progress_percent,
        "inserted_count": inserted_count,
        "total_rows": total_rows,
        "updated_at": datetime.utcnow().isoformat()
    }
    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp_file, prog_file)
    except Exception:
        pass


def _cleanup_progress_file(file_path: str):
    for p in (f"{file_path}.progress", f"{file_path}.progress.tmp"):
        try:
            if os.path.exists(p):
                os.remove(p)
        except Exception:
            pass


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


def import_codinh_wos_from_excel(
    db: Session,
    file_path: Union[str, Path],
    filename: str,
    import_id: Optional[int] = None
) -> Dict[str, Any]:
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File {file_path} không tồn tại")

    import_record = None
    if import_id:
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if import_record:
            import_record.status = "PROCESSING"
            import_record.progress_percent = 10
            db.commit()

    file_path_str = str(path_obj)
    file_path_lower = file_path_str.lower()
    t_start = time.perf_counter()

    if file_path_lower.endswith(".csv"):
        df = pd.read_csv(file_path_str, low_memory=False, encoding_errors="replace")
    elif file_path_lower.endswith(".xls"):
        try:
            df = pd.read_excel(file_path_str, engine="calamine")
        except Exception:
            try:
                df = pd.read_excel(file_path_str, engine="xlrd")
            except Exception:
                try:
                    df = pd.read_excel(file_path_str)
                except Exception as ex:
                    raise ValueError(f"Không thể đọc file .xls (Excel 97-2003): {ex}")
    else:
        try:
            df = pd.read_excel(file_path_str, engine="calamine")
        except Exception:
            try:
                df = pd.read_excel(file_path_str, engine="openpyxl")
            except Exception as ex:
                raise ValueError(f"Không thể đọc file Excel .xlsx: {ex}")

    t_read = time.perf_counter()
    print(f"[ETL CODINH] read: {t_read - t_start:.2f}s", flush=True)

    if import_record:
        import_record.total_rows = len(df)
        import_record.progress_percent = 25
        db.commit()

    df.columns = [re.sub(r'\s+', ' ', str(c).strip().replace('\ufeff', '')) for c in df.columns]

    has_macv = any(str(c).strip().lower() in ("mã công việc", "mã cv", "ma cong viec", "wo") for c in df.columns)
    if not has_macv:
        header_idx = None
        for r_idx in range(min(25, len(df))):
            row_vals = [str(val).strip().lower() for val in df.iloc[r_idx].dropna()]
            if any(v in ("mã công việc", "mã cv", "ma cong viec", "wo") for v in row_vals):
                header_idx = r_idx
                break

        if header_idx is not None:
            new_cols = [str(c).strip() for c in df.iloc[header_idx].values]
            df = df.iloc[header_idx + 1:].reset_index(drop=True)
            df.columns = [re.sub(r'\s+', ' ', str(c).strip().replace('\ufeff', '')) for c in new_cols]

    col_map = {}

    for c in df.columns:
        c_low = str(c).strip().lower()
        if any(ex in c_low for ex in ("khởi tạo", "khoi tao", "người tạo", "nguoi tao", "điều phối", "dieu phoi", "giao việc", "giao viec")):
            continue
        if any(k in c_low for k in (
            "nhân viên thực hiện", "nhan vien thuc hien",
            "người nhận việc", "nguoi nhan viec",
            "nhân viên nhận việc", "nhan vien nhan viec",
            "người xử lý", "nguoi xu ly",
            "nhân viên", "nhan vien",
            "assigned_to", "performer", "receiver",
        )):
            col_map["nhan_vien"] = c
            break

    patterns = {
        "ma_cong_viec": ["mã công việc", "mã cv", "ma cong viec", "ma_cv", "wo", "task_code"],
        "loai_cong_viec": ["loại công việc", "loai cong viec", "loại cv", "task_type"],
        "noi_dung_cong_viec": ["nội dung công việc", "noi dung cong viec", "nội dung cv", "content", "description"],
        "trang_thai": ["trạng thái", "trang thai", "status", "tình trạng"],
        "nhom": ["nhóm", "nhom", "đơn vị", "don vi", "đội", "doi", "group", "team"],
        "ma_tram": ["mã trạm", "ma tram", "trạm", "tram", "station_code"],
        "he_thong": ["hệ thống", "he thong", "system"],
        "thoi_diem_tao": ["thời điểm tạo", "thoi diem tao", "ngày tạo", "ngay tao", "created_at"],
        "thoi_diem_bat_dau_thuc_hien": ["thời điểm bắt đầu thực hiện", "thoi diem bat dau thuc hien", "bắt đầu thực hiện", "bat dau thuc hien", "thời gian bắt đầu", "thoi gian bat dau"],
        "thoi_diem_yeu_cau_ket_thuc": ["thời điểm yêu cầu kết thúc", "thoi diem yeu cau ket thuc", "hạn hoàn thành", "han hoan thanh", "deadline"],
        "thoi_gian_con_lai": ["thời gian còn lại", "thoi gian con lai", "remaining_time"],
        "thoi_diem_ft_hoan_thanh": ["thời điểm ft hoàn thành", "thoi diem ft hoan thanh", "ft hoàn thành", "ft hoan thanh"],
        "thoi_diem_cd_dong": ["thời điểm cđ đóng", "thời điểm cd đóng", "thoi diem cd dong", "thời điểm đóng", "thoi diem dong", "closed_at"],
        "muc_do_uu_tien": ["mức độ ưu tiên", "muc do uu tien", "ưu tiên", "priority"],
        "nguon_goc": ["nguồn gốc", "nguon goc", "source"],
        "tien_trinh_thuc_hien": ["tiến trình thực hiện", "tien trinh thuc hien", "tiến trình", "progress"],
        "ghi_chu": ["ghi chú", "ghi chu", "note", "notes", "remark"],
    }

    for field, syns in patterns.items():
        if field in col_map:
            continue
        for c in df.columns:
            c_low = str(c).strip().lower()
            if any(s in c_low for s in syns):
                col_map[field] = c
                break

    if "ma_cong_viec" not in col_map:
        raise ValueError(
            f"Không tìm thấy cột 'Mã công việc' trong file Excel. Các cột hiện có: {list(df.columns)}"
        )

    col_macv = col_map["ma_cong_viec"]
    df = df[df[col_macv].notna()].copy()
    df["_clean_macv"] = df[col_macv].astype(str).str.strip()
    df = df[df["_clean_macv"].str.lower().isin(["", "nan", "none", "nat"]) == False]
    df = df.drop_duplicates(subset=["_clean_macv"], keep="last")

    n = len(df)
    print(f"[ETL CODINH] So dong hop le can nap: {n}", flush=True)

    c_macv = df["_clean_macv"].tolist()
    c_loai = _vectorize_str_col(df.get(col_map.get("loai_cong_viec")), n)
    c_noidung = _vectorize_str_col(df.get(col_map.get("noi_dung_cong_viec")), n)
    c_trangthai = _vectorize_str_col(df.get(col_map.get("trang_thai")), n, default_val="Chưa rõ")
    c_nhanvien = _vectorize_str_col(df.get(col_map.get("nhan_vien")), n)
    c_nhom = _vectorize_str_col(df.get(col_map.get("nhom")), n)
    c_matram = _vectorize_str_col(df.get(col_map.get("ma_tram")), n)
    c_hethong = _vectorize_str_col(df.get(col_map.get("he_thong")), n)
    c_uutien = _vectorize_str_col(df.get(col_map.get("muc_do_uu_tien")), n)
    c_nguongoc = _vectorize_str_col(df.get(col_map.get("nguon_goc")), n)
    c_tientrinh = _vectorize_str_col(df.get(col_map.get("tien_trinh_thuc_hien")), n)
    c_ghichu = _vectorize_str_col(df.get(col_map.get("ghi_chu")), n)

    c_conlai = _vectorize_float_col(df.get(col_map.get("thoi_gian_con_lai")), n)

    c_tao = _vectorize_dt_col(df.get(col_map.get("thoi_diem_tao")), n)
    c_batdau = _vectorize_dt_col(df.get(col_map.get("thoi_diem_bat_dau_thuc_hien")), n)
    c_ketthuc = _vectorize_dt_col(df.get(col_map.get("thoi_diem_yeu_cau_ket_thuc")), n)
    c_fthoanthanh = _vectorize_dt_col(df.get(col_map.get("thoi_diem_ft_hoan_thanh")), n)
    c_cddong = _vectorize_dt_col(df.get(col_map.get("thoi_diem_cd_dong")), n)

    # Free original df immediately to conserve RAM on 2GB VPS
    del df

    # Fast memoized computation of derived flags
    unique_uutien = set(c_uutien)
    hot_map = {u: is_hot_priority(u) for u in unique_uutien}
    c_is_hot = [hot_map.get(u, 0) for u in c_uutien]

    unique_trangthai = set(c_trangthai)
    tam_dung_map = {t: is_tam_dung_status(t) for t in unique_trangthai}
    open_map = {t: is_open_status(t) for t in unique_trangthai}
    c_is_tam_dung = [tam_dung_map.get(t, 0) for t in c_trangthai]
    c_is_open = [open_map.get(t, 1) for t in c_trangthai]

    # Pre-filter candidate types for su_co to avoid regex/unicode normalization on non-su_co rows
    su_co_loai_candidates = {l for l in set(c_loai) if normalize_key(l) == SU_CO_TASK_TYPE_NORM}
    c_is_su_co = []
    for k in range(n):
        l_val = c_loai[k]
        if l_val not in su_co_loai_candidates:
            c_is_su_co.append(0)
        else:
            nd_norm = normalize_key(c_noidung[k])
            c_is_su_co.append(1 if SU_CO_KEYWORD_NORM in nd_norm else 0)

    # Vectorize flags for special content types
    c_is_soc_mat_tin_hieu = [is_soc_mat_tin_hieu_content(nd) for nd in c_noidung]
    c_is_ho_tro_dich_vu = [is_ho_tro_dich_vu_content(nd) for nd in c_noidung]

    c_closed_time = [c_fthoanthanh[k] or c_cddong[k] for k in range(n)]

    if import_record:
        import_record.progress_percent = 40
        db.commit()

    # SQLite PRAGMA speedups (matching /admin etl_service.py)
    if is_sqlite:
        db.execute(text("PRAGMA foreign_keys = OFF"))
        db.execute(text("PRAGMA cache_size = -32000"))
        db.execute(text("PRAGMA temp_store = MEMORY"))
        db.execute(text("PRAGMA mmap_size = 268435456"))
        db.execute(text("PRAGMA synchronous = NORMAL"))
    else:
        db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))

    # Clear old data and bulk insert in a single atomic transaction
    t_db_start = time.perf_counter()
    db.query(TaskCodinh).delete(synchronize_session=False)

    BATCH_SIZE = 10000
    rows_inserted = 0
    now_utc = datetime.utcnow()

    for i in range(0, n, BATCH_SIZE):
        chunk_len = min(i + BATCH_SIZE, n) - i

        mappings = []
        for j in range(chunk_len):
            idx = i + j
            mappings.append({
                "ma_cong_viec": c_macv[idx],
                "loai_cong_viec": c_loai[idx],
                "noi_dung_cong_viec": c_noidung[idx],
                "trang_thai": c_trangthai[idx],
                "nhan_vien": c_nhanvien[idx],
                "nhom": c_nhom[idx],
                "ma_tram": c_matram[idx],
                "he_thong": c_hethong[idx],
                "muc_do_uu_tien": c_uutien[idx],
                "is_su_co": c_is_su_co[idx],
                "is_hot": c_is_hot[idx],
                "is_tam_dung": c_is_tam_dung[idx],
                "is_open": c_is_open[idx],
                "is_soc_mat_tin_hieu": c_is_soc_mat_tin_hieu[idx],
                "is_ho_tro_dich_vu": c_is_ho_tro_dich_vu[idx],
                "closed_time": c_closed_time[idx],
                "nguon_goc": c_nguongoc[idx],
                "tien_trinh_thuc_hien": c_tientrinh[idx],
                "thoi_diem_tao": c_tao[idx],
                "thoi_diem_bat_dau_thuc_hien": c_batdau[idx],
                "thoi_diem_yeu_cau_ket_thuc": c_ketthuc[idx],
                "thoi_gian_con_lai": c_conlai[idx],
                "thoi_gian_con_lai_num": c_conlai[idx],
                "thoi_diem_ft_hoan_thanh": c_fthoanthanh[idx],
                "thoi_diem_cd_dong": c_cddong[idx],
                "ghi_chu": c_ghichu[idx],
                "import_filename": filename,
                "created_at": now_utc,
                "updated_at": now_utc,
            })

        if mappings:
            try:
                db.execute(insert(TaskCodinh.__table__), mappings)
            except Exception:
                db.bulk_insert_mappings(TaskCodinh, mappings)

        rows_inserted += chunk_len

        pct = 40 + int((rows_inserted / max(1, n)) * 55)
        _write_progress_file(file_path_str, min(pct, 98), rows_inserted, n)

    t_db = time.perf_counter() - t_db_start
    print(f"[ETL CODINH] db insert: {t_db:.2f}s for {rows_inserted} rows", flush=True)

    vn_now = now_utc + timedelta(hours=7)
    vn_time_str = vn_now.strftime("%d/%m/%Y lúc %H:%M")
    _set_setting(db, "codinh_last_import_wo_time", now_utc.isoformat(), commit=False)
    _set_setting(db, "codinh_last_import_wo_time_vn", vn_time_str, commit=False)
    _set_setting(db, "codinh_last_import_wo_filename", filename, commit=False)

    if import_record:
        import_record.status = "COMPLETED"
        import_record.progress_percent = 100
        import_record.inserted_count = rows_inserted
        import_record.completed_at = now_utc
        import_record.is_active = 1
        db.query(ImportLog).filter(
            ImportLog.id != import_record.id,
            ImportLog.domain == "codinh"
        ).update({"is_active": 0}, synchronize_session=False)

    # Commit once at the end (bypasses multiple fsync disk stalls)
    db.commit()

    if is_sqlite:
        try:
            db.execute(text("PRAGMA foreign_keys = ON"))
            db.commit()
        except Exception:
            pass

    _cleanup_progress_file(file_path_str)
    bump_wo_version()

    return {
        "filename": filename,
        "total_rows": n,
        "inserted_count": rows_inserted,
        "status": "COMPLETED",
        "imported_at_vn": vn_time_str,
    }


def process_codinh_wos_import(import_id: int, file_path: str):
    db = SessionLocal()
    try:
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if not import_record:
            return
        import_codinh_wos_from_excel(
            db=db,
            file_path=file_path,
            filename=import_record.file_name,
            import_id=import_id
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        try:
            import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
            if import_record:
                import_record.status = "FAILED"
                import_record.error_message = str(e)
                db.commit()
            _cleanup_progress_file(file_path)
        except Exception:
            pass
    finally:
        db.close()


def run_codinh_import_job(import_id: int, file_path: str):
    process_codinh_wos_import(import_id, file_path)


def import_cabinets_from_excel(
    db: Session,
    file_path: Union[str, Path],
    filename: str,
    report_key: str = "thc",
    category_id: Optional[int] = None
) -> Dict[str, Any]:
    try:
        Cabinet.__table__.create(bind=db.get_bind(), checkfirst=True)
    except Exception:
        pass

    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File {file_path} không tồn tại")

    path_str = str(path_obj).lower()

    def _read_df(header=None, nrows=None):
        if path_str.endswith(".csv"):
            return pd.read_csv(path_obj, header=header, nrows=nrows, low_memory=False, encoding_errors="replace")
        elif path_str.endswith(".xls"):
            try:
                return pd.read_excel(path_obj, header=header, nrows=nrows, engine="xlrd")
            except Exception:
                return pd.read_excel(path_obj, header=header, nrows=nrows)
        else:
            try:
                return pd.read_excel(path_obj, header=header, nrows=nrows)
            except Exception:
                try:
                    return pd.read_excel(path_obj, header=header, nrows=nrows, engine="openpyxl")
                except Exception:
                    return pd.read_csv(path_obj, header=header, nrows=nrows, low_memory=False, encoding_errors="replace")

    df_preview = _read_df(header=None, nrows=25)
    header_row_idx = 0
    for idx, row in df_preview.iterrows():
        row_strs = [str(x).strip().lower() for x in row.values if pd.notna(x)]
        has_dt = any(any(k in s for k in ("mã đối tượng", "đối tượng", "mã tủ", "mã thc", "tủ cáp", "tủ")) for s in row_strs)
        has_wo = any(any(k in s for k in ("mã wo", "mã công việc", "ma_wo", "ma_cong_viec", "phiếu", "wo")) for s in row_strs)
        if has_dt and has_wo:
            header_row_idx = idx
            break
        elif any("mã đối tượng" in s or "ma_doi_tuong" in s or "mã thc" in s for s in row_strs):
            header_row_idx = idx
            break

    df = _read_df(header=header_row_idx)

    col_doi_tuong = None
    col_wo = None
    col_tram = None
    col_thc_status = None
    col_wo_status = None
    col_tinh = None
    col_khu_vuc = None
    col_quoc_gia = None

    for col in df.columns:
        c_clean = str(col).strip().lower()
        if any(k in c_clean for k in ("mã đối tượng", "ma_doi_tuong", "mã tủ", "mã thc", "tủ cáp", "thiết bị")):
            if not col_doi_tuong:
                col_doi_tuong = col
        elif any(k in c_clean for k in ("mã wo", "ma_wo", "mã công việc", "ma_cong_viec", "mã phiếu", "phiếu công việc")) or c_clean == "wo":
            if not col_wo:
                col_wo = col
        elif any(k in c_clean for k in ("trạng thái thc", "trạng thái đối tượng", "trạng thái tủ", "kết quả bảo dưỡng", "trạng thái bảo dưỡng", "kết quả")):
            if not col_thc_status:
                col_thc_status = col
        elif any(k in c_clean for k in ("mã trạm", "ma_tram", "nhà trạm", "station")):
            if not col_tram:
                col_tram = col
        elif any(k in c_clean for k in ("trạng thái wo", "trạng thái phiếu", "trạng thái công việc")):
            if not col_wo_status:
                col_wo_status = col
        elif any(k in c_clean for k in ("tỉnh", "tinh", "tỉnh/tp")):
            if not col_tinh:
                col_tinh = col
        elif any(k in c_clean for k in ("khu vực", "khu_vuc", "cụm", "nhóm")):
            if not col_khu_vuc:
                col_khu_vuc = col
        elif any(k in c_clean for k in ("quốc gia", "quoc_gia")):
            if not col_quoc_gia:
                col_quoc_gia = col

    if not col_doi_tuong:
        for col in df.columns:
            c_clean = str(col).strip().lower()
            if "đối tượng" in c_clean or "tủ" in c_clean:
                col_doi_tuong = col
                break

    if not col_thc_status:
        for col in df.columns:
            if col != col_wo_status and "trạng thái" in str(col).strip().lower():
                col_thc_status = col
                break

    if not col_doi_tuong:
        raise ValueError("Không tìm thấy cột 'Mã đối tượng' (Mã tủ cáp THC) trong file Excel.")
    if not col_wo:
        raise ValueError("Không tìm thấy cột 'Mã WO' trong file Excel.")

    df_valid = df[df[col_doi_tuong].notna() & df[col_wo].notna()].copy()
    df_valid["ma_doi_tuong_clean"] = df_valid[col_doi_tuong].astype(str).str.strip()
    df_valid["ma_wo_clean"] = df_valid[col_wo].astype(str).str.strip()
    df_valid = df_valid[(df_valid["ma_doi_tuong_clean"] != "") & (df_valid["ma_wo_clean"] != "")]
    df_valid = df_valid.drop_duplicates(subset=["ma_wo_clean", "ma_doi_tuong_clean"])

    now = datetime.utcnow()
    records_to_insert = []
    completed_cabinets = 0
    pending_cabinets = 0
    unique_wos = set()

    closed_wos_in_db = set(
        r[0] for r in db.query(TaskCodinh.ma_cong_viec).filter(
            TaskCodinh.trang_thai.in_(CLOSED_STATUSES)
        ).all()
    )

    df_records = df_valid.to_dict(orient="records")
    for row in df_records:
        wo_val = str(row["ma_wo_clean"]).strip()
        dt_val = str(row["ma_doi_tuong_clean"]).strip()
        tram_val = str(row[col_tram]).strip() if col_tram and pd.notna(row.get(col_tram)) else None
        thc_status = str(row[col_thc_status]).strip() if col_thc_status and pd.notna(row.get(col_thc_status)) else "Đang thực hiện bảo dưỡng"
        wo_status = str(row[col_wo_status]).strip() if col_wo_status and pd.notna(row.get(col_wo_status)) else None
        tinh_val = str(row[col_tinh]).strip() if col_tinh and pd.notna(row.get(col_tinh)) else None
        khu_vuc_val = str(row[col_khu_vuc]).strip() if col_khu_vuc and pd.notna(row.get(col_khu_vuc)) else None
        quoc_gia_val = str(row[col_quoc_gia]).strip() if col_quoc_gia and pd.notna(row.get(col_quoc_gia)) else None

        unique_wos.add(wo_val)
        is_wo_closed = (
            wo_val in closed_wos_in_db or
            (wo_status is not None and wo_status.strip() in CLOSED_STATUSES)
        )
        is_thc_comp = "hoàn thành" in thc_status.lower() and "đang" not in thc_status.lower()

        if is_wo_closed or is_thc_comp:
            completed_cabinets += 1
        else:
            pending_cabinets += 1

        records_to_insert.append({
            "category_id": category_id,
            "report_key": report_key,
            "ma_wo": wo_val,
            "ma_doi_tuong": dt_val,
            "ma_tram": tram_val,
            "quoc_gia": quoc_gia_val,
            "khu_vuc": khu_vuc_val,
            "tinh": tinh_val,
            "trang_thai_wo": wo_status,
            "trang_thai_thc": "Đã hoàn thành bảo dưỡng" if is_wo_closed and not is_thc_comp else thc_status,
            "import_filename": filename,
            "created_at": now,
            "updated_at": now,
        })

    # Clear existing cabinets for this report_key
    if report_key:
        db.query(Cabinet).filter(Cabinet.report_key == report_key).delete(synchronize_session=False)
    elif category_id:
        db.query(Cabinet).filter(Cabinet.category_id == category_id).delete(synchronize_session=False)
    else:
        db.query(Cabinet).delete(synchronize_session=False)

    db.commit()

    BATCH_SIZE = 1000
    for i in range(0, len(records_to_insert), BATCH_SIZE):
        batch = records_to_insert[i:i + BATCH_SIZE]
        db.bulk_insert_mappings(Cabinet, batch)
        db.commit()

    vn_now = now + timedelta(hours=7)
    vn_time_str = vn_now.strftime("%d/%m/%Y lúc %H:%M")
    _set_setting(db, "codinh_last_import_cabinet_time", now.isoformat())
    _set_setting(db, "codinh_last_import_cabinet_time_vn", vn_time_str)
    _set_setting(db, "codinh_last_import_cabinet_filename", filename)

    rate = round((completed_cabinets / len(records_to_insert) * 100), 1) if records_to_insert else 0.0
    bump_cabinet_version()

    return {
        "filename": filename,
        "total_cabinets": len(records_to_insert),
        "unique_wos": len(unique_wos),
        "completed_cabinets": completed_cabinets,
        "pending_cabinets": pending_cabinets,
        "completion_rate": rate,
        "imported_at_vn": vn_time_str,
    }


def get_codinh_import_logs(db: Session, limit: int = 50) -> List[ImportLog]:
    return db.query(ImportLog).filter(ImportLog.domain == "codinh").order_by(ImportLog.imported_at.desc()).limit(limit).all()


def activate_codinh_import(db: Session, import_id: int) -> ImportLog:
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise ValueError("Không tìm thấy lịch sử import CĐBR")
    db.query(ImportLog).filter(ImportLog.domain == "codinh").update({"is_active": 0}, synchronize_session=False)
    log.is_active = 1
    db.commit()
    db.refresh(log)
    bump_wo_version()
    return log


def delete_codinh_import(db: Session, import_id: int) -> bool:
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise ValueError("Không tìm thấy lịch sử import CĐBR")
    if log.stored_filename:
        file_path = UPLOAD_DIR / log.stored_filename
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass
    db.delete(log)
    db.commit()
    return True
