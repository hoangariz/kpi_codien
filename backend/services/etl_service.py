import os
import re
import sys
import json
import math
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
from sqlalchemy import select, text, or_, insert
from sqlalchemy.orm import Session

from backend.database import SessionLocal, is_sqlite
from backend.models import (
    Employee, Group, TaskType, SystemModel, Unit, Station,
    ImportLog, Task, TaskHistory
)
from backend.models.note import TaskNote


def _disable_fk(db: Session):
    """Tắt FOREIGN KEY check ở connection-level để DELETE không bị lỗi constraint."""
    try:
        if is_sqlite:
            db.commit()
            db.execute(text("PRAGMA foreign_keys = OFF"))
            db.commit()
        else:
            db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            db.commit()
    except Exception:
        pass


def _enable_fk(db: Session):
    """Bật lại FOREIGN KEY check sau khi xóa xong."""
    try:
        if is_sqlite:
            db.commit()
            db.execute(text("PRAGMA foreign_keys = ON"))
            db.commit()
        else:
            db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
            db.commit()
    except Exception:
        pass


def clear_task_tables(db: Session):
    """
    Xóa sạch dữ liệu task cũ trước khi nạp file mới hoặc khi xóa file active.
    BẢO TOÀN NGUYÊN VẸN TaskNote (Ghi chú điều hành theo dõi theo mã WO).
    Dùng PRAGMA foreign_keys = OFF để tránh lỗi constraint trên SQLite khi thay thế tasks.
    """
    _disable_fk(db)
    try:
        # BẢO TỒN TaskNote: Tuyệt đối KHÔNG xóa TaskNote để giữ lại ghi chú người dùng!
        db.query(TaskHistory).delete(synchronize_session=False)
        db.query(Task).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        _enable_fk(db)


def parse_datetime_safe(val) -> Optional[datetime]:
    """Safely parse datetime from pandas/excel format."""
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.to_pydatetime() if isinstance(val, pd.Timestamp) else val
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("nan", "nat", "none"):
        return None
    
    # Try standard dd/MM/yyyy HH:mm:ss format
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            pass
    
    try:
        dt = pd.to_datetime(val_str, dayfirst=True, errors="coerce")
        if pd.notna(dt):
            return dt.to_pydatetime()
    except Exception:
        pass
    return None


def clean_str(val) -> Optional[str]:
    """Clean string values, convert nan to None."""
    if val is None or pd.isna(val):
        return None
    s = str(val).strip()
    return s if s and s.lower() not in ("nan", "nat", "none", "<na>") else None


def clean_float(val) -> Optional[float]:
    """Clean float / numeric values, convert nan to None."""
    if val is None or pd.isna(val):
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (ValueError, TypeError):
        return None


def clean_int(val) -> Optional[int]:
    """Clean integer / foreign key values, convert nan to None."""
    if val is None or pd.isna(val):
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f)
    except (ValueError, TypeError):
        return None


def clean_dt(val) -> Optional[datetime]:
    """Clean datetime values, convert NaT / nan to None."""
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        if isinstance(val, pd.Timestamp):
            if pd.isna(val):
                return None
            return val.to_pydatetime()
        return val
    return parse_datetime_safe(val)


def _vectorize_str_col(series: Optional[pd.Series], n: int) -> list:
    """Vectorized string cleaning: strips whitespace and converts empty/nan to None."""
    if series is None:
        return [None] * n
    s = series.astype("string").str.strip()
    s_lower = s.str.lower()
    mask = s.isna() | (s == "") | s_lower.isin(["nan", "nat", "none", "<na>"])
    s_clean = s.mask(mask, None)
    return [str(x) if x is not None and not pd.isna(x) else None for x in s_clean]


def _vectorize_float_col(series: Optional[pd.Series], n: int) -> list:
    """Vectorized float cleaning: converts to numeric, inf to NaN, rounds to 4 decimals."""
    if series is None:
        return [None] * n
    num = pd.to_numeric(series, errors="coerce")
    num = num.mask(np.isinf(num), np.nan).round(4)
    return [float(x) if pd.notna(x) else None for x in num]


def _vectorize_dt_col(series: Optional[pd.Series], n: int) -> list:
    """
    Vectorized datetime parsing:
    1. Parses '%d/%m/%Y %H:%M:%S' first
    2. String fallbacks parsed with dayfirst=True, format='mixed'
    3. Excel numeric serial dates (e.g. 45000) parsed with origin='1899-12-30' (never 1970)
    4. Converted via pd.DatetimeIndex(...).to_pydatetime() ensuring no NaT/NaN
    """
    if series is None:
        return [None] * n

    # Step 1: Parse standard dd/MM/yyyy HH:mm:ss format
    dt = pd.to_datetime(series, format="%d/%m/%Y %H:%M:%S", errors="coerce")

    # Step 2: Fallback for remaining NaTs that are strings
    mask_na = dt.isna()
    if mask_na.any():
        sub_series = series[mask_na]
        dt_mixed = pd.to_datetime(sub_series, dayfirst=True, format="mixed", errors="coerce")
        dt.update(dt_mixed)

        # Step 3: Check remaining NaTs for Excel serial date numbers (e.g. 45000)
        mask_still_na = dt.isna()
        if mask_still_na.any():
            nums = pd.to_numeric(series[mask_still_na], errors="coerce")
            num_valid = nums.notna() & (nums > 10000) & (nums < 100000)
            if num_valid.any():
                dt_serial = pd.to_datetime(nums[num_valid], unit="D", origin="1899-12-30", errors="coerce")
                dt.update(dt_serial)

    # Step 4: Convert via DatetimeIndex to avoid deprecated Series.dt.to_pydatetime
    arr = pd.DatetimeIndex(dt).to_pydatetime()
    return [None if (val is None or pd.isna(val) or str(val) == "NaT") else (val.to_pydatetime() if hasattr(val, "to_pydatetime") else val) for val in arr]


def _vectorize_fk_col(series: Optional[pd.Series], dim_map: Dict[str, int], n: int) -> list:
    """Vectorized dimension FK mapping using Series.map on stripped lower-case names."""
    if series is None:
        return [None] * n
    s_lower = series.astype("string").str.strip().str.lower()
    mapped = s_lower.map(dim_map)
    return [int(x) if pd.notna(x) else None for x in mapped]


def _write_progress_file(file_path: str, progress_percent: int, inserted_count: int, total_rows: int):
    """Write import progress atomically to <file_path>.progress using temporary file and os.replace."""
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
    """Remove progress files upon completion or failure."""
    for p in (f"{file_path}.progress", f"{file_path}.progress.tmp"):
        try:
            if os.path.exists(p):
                os.remove(p)
        except Exception:
            pass


def resolve_dimensions_in_bulk(db: Session, df: pd.DataFrame) -> Dict[str, Dict[str, int]]:
    """
    Get-or-create dimension entries in memory cache.
    Returns dict {name.strip().lower(): id} for each dimension table.
    Does NOT create dimension rows for empty or 'nan/none' values.
    """
    cache = {
        "employees": {},
        "groups": {},
        "systems": {},
        "units": {},
        "stations": {},
        "task_types": {},
    }

    def resolve_dim(model_cls, name_col: str, items_set: set) -> Dict[str, int]:
        # Filter out empty strings or nan/none representations
        valid_items = set()
        for item in items_set:
            if item is None or pd.isna(item):
                continue
            item_str = str(item).strip()
            if not item_str or item_str.lower() in ("nan", "nat", "none", "<na>"):
                continue
            valid_items.add(item_str)

        existing = db.query(getattr(model_cls, name_col), model_cls.id).all()
        lower_map = {
            str(k).strip().lower(): v
            for k, v in existing
            if k is not None and str(k).strip().lower() not in ("", "nan", "nat", "none", "<na>")
        }

        new_names_dict = {}
        for item_str in valid_items:
            item_lower = item_str.lower()
            if item_lower not in lower_map and item_lower not in new_names_dict:
                new_names_dict[item_lower] = item_str

        if new_names_dict:
            try:
                new_objs = [model_cls(**{name_col: name}) for name in new_names_dict.values()]
                db.add_all(new_objs)
                db.commit()
            except Exception:
                db.rollback()
                for name in new_names_dict.values():
                    try:
                        obj = model_cls(**{name_col: name})
                        db.add(obj)
                        db.commit()
                    except Exception:
                        db.rollback()

            existing = db.query(getattr(model_cls, name_col), model_cls.id).all()
            lower_map = {
                str(k).strip().lower(): v
                for k, v in existing
                if k is not None and str(k).strip().lower() not in ("", "nan", "nat", "none", "<na>")
            }

        return lower_map

    # 1. Employees (from both 'Nhân viên khởi tạo' and 'Nhân viên thực hiện' / 'Người nhận việc' / etc.)
    emp_names = set()
    emp_cols = [c for c in df.columns if any(k in c.lower() for k in (
        "nhân viên thực hiện", "người nhận việc", "nhân viên nhận việc", "người thực hiện",
        "nhân viên xử lý", "người xử lý", "nhân viên khởi tạo", "người tạo", "nhân viên"
    ))]
    if not emp_cols:
        emp_cols = [c for c in ("Nhân viên khởi tạo", "Nhân viên thực hiện") if c in df.columns]
    for col in emp_cols:
        emp_names.update(df[col].dropna().astype(str).str.strip().unique())
    emp_names.discard("")
    cache["employees"] = resolve_dim(Employee, "name", emp_names)

    # 2. Groups (from 'Nhóm điều phối')
    group_names = set()
    if "Nhóm điều phối" in df.columns:
        group_names.update(df["Nhóm điều phối"].dropna().astype(str).str.strip().unique())
    group_names.discard("")
    cache["groups"] = resolve_dim(Group, "name", group_names)

    # 3. Systems (from 'Hệ thống' and 'Mã hệ thống')
    sys_names = set()
    if "Hệ thống" in df.columns:
        sys_names.update(df["Hệ thống"].dropna().astype(str).str.strip().unique())
    sys_names.discard("")
    cache["systems"] = resolve_dim(SystemModel, "name", sys_names)

    # 4. Units (from 'Đơn vị tạo')
    unit_names = set()
    if "Đơn vị tạo" in df.columns:
        unit_names.update(df["Đơn vị tạo"].dropna().astype(str).str.strip().unique())
    unit_names.discard("")
    cache["units"] = resolve_dim(Unit, "name", unit_names)

    # 5. Stations (from 'Mã trạm')
    station_codes = set()
    if "Mã trạm" in df.columns:
        station_codes.update(df["Mã trạm"].dropna().astype(str).str.strip().unique())
    station_codes.discard("")
    cache["stations"] = resolve_dim(Station, "code", station_codes)

    # 6. Task Types (from 'Loại công việc')
    type_names = set()
    if "Loại công việc" in df.columns:
        type_names.update(df["Loại công việc"].dropna().astype(str).str.strip().unique())
    type_names.discard("")
    cache["task_types"] = resolve_dim(TaskType, "name", type_names)

    return cache


def process_excel_import(import_id: int, file_path: str, filter_spm: bool = True):
    """
    Main ETL function executed in background process.
    Tối ưu cho VPS 2 vCPU / 2GB RAM:
    - Calamine C/Rust engine đọc file siêu tốc
    - Xử lý vectorized theo cột bằng Pandas
    - Dựng + insert theo từng lát 10.000 dòng để tiết kiệm RAM
    - Một transaction duy nhất: xóa cũ -> insert mới -> cập nhật ImportLog -> commit một lần ở cuối
    - Ghi tiến độ ra file .progress tránh lock SQLite
    - Đo thời gian từng bước chi tiết
    """
    t_start = time.perf_counter()

    db = SessionLocal()
    try:
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if not import_record:
            return

        import_record.status = "PROCESSING"
        import_record.progress_percent = 5
        db.commit()

        # Step 1: Read excel or csv file
        t_read_0 = time.perf_counter()
        file_path_lower = file_path.lower()
        if file_path_lower.endswith(".csv"):
            df = pd.read_csv(file_path, low_memory=False, encoding_errors="replace")
        elif file_path_lower.endswith(".xls"):
            try:
                df = pd.read_excel(file_path, engine="calamine")
            except (ImportError, Exception):
                try:
                    df = pd.read_excel(file_path, engine="xlrd")
                except Exception:
                    try:
                        df = pd.read_excel(file_path)
                    except Exception as ex:
                        raise ValueError(f"Không thể đọc file .xls (Excel 97-2003). Vui lòng lưu file sang định dạng .xlsx để hệ thống xử lý nhanh: {ex}")
        else: # .xlsx
            try:
                df = pd.read_excel(file_path, engine="calamine")
            except (ImportError, Exception):
                try:
                    df = pd.read_excel(file_path, engine="openpyxl")
                except Exception as ex:
                    raise ValueError(f"Không thể đọc file .xlsx: {ex}")

        t_read = time.perf_counter() - t_read_0
        print(f"[ETL] read: {t_read:.2f}s", flush=True)

        total_rows = len(df)
        import_record.total_rows = total_rows
        import_record.progress_percent = 15
        db.commit()

        # Step 2: Header normalization & flexible mappings
        t_filter_0 = time.perf_counter()
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

        # Standardize synonyms: "Mô tả" -> "Ghi chú", "Mức độ ưu tiên" -> "Lỗi"
        if "Mô tả" in df.columns and "Ghi chú" not in df.columns:
            df["Ghi chú"] = df["Mô tả"]
        if "Mức độ ưu tiên" in df.columns and "Lỗi" not in df.columns:
            df["Lỗi"] = df["Mức độ ưu tiên"]

        # Flexible column mappings for employee fields
        for c in df.columns:
            c_clean = c.lower().strip()
            if any(k in c_clean for k in ("nhân viên thực hiện", "người nhận việc", "nhân viên nhận việc", "người thực hiện", "nhân viên xử lý", "người xử lý")) and "Nhân viên thực hiện" not in df.columns:
                df["Nhân viên thực hiện"] = df[c]
            elif any(k in c_clean for k in ("nhân viên khởi tạo", "người tạo", "người khởi tạo")) and "Nhân viên khởi tạo" not in df.columns:
                df["Nhân viên khởi tạo"] = df[c]

        # Flexible column mappings for date & time fields
        for c in df.columns:
            c_clean = c.lower()
            if "thời điểm bắt đầu thực hiện" in c_clean and "Thời điểm bắt đầu thực hiện (dd/MM/yyyy HH:mm:ss)" not in df.columns:
                df["Thời điểm bắt đầu thực hiện (dd/MM/yyyy HH:mm:ss)"] = df[c]
            elif "thời điểm yêu cầu kết thúc" in c_clean and "Thời điểm yêu cầu kết thúc (dd/MM/yyyy HH:mm:ss)" not in df.columns:
                df["Thời điểm yêu cầu kết thúc (dd/MM/yyyy HH:mm:ss)"] = df[c]
            elif "thời gian còn lại" in c_clean and "Thời gian còn lại (H)" not in df.columns:
                df["Thời gian còn lại (H)"] = df[c]

        # Validate that "Mã công việc" exists
        found_col = None
        for c in df.columns:
            if c.lower() in ("mã công việc", "mã cv", "ma cong viec", "ma_cong_viec", "wo"):
                found_col = c
                break
        if found_col:
            df["Mã công việc"] = df[found_col]
        else:
            available_cols = ", ".join(df.columns[:10])
            raise ValueError(f"File thiếu cột bắt buộc 'Mã công việc'. Các cột tìm thấy: [{available_cols}]. Vui lòng kiểm tra lại file!")

        total_rows = len(df)
        import_record.total_rows = total_rows

        # Filter out SPM and SPM_VTNET rows (only if filter_spm is True)
        filtered_out_count = 0
        if filter_spm and "Hệ thống" in df.columns:
            sys_series = df["Hệ thống"].fillna("").astype(str).str.strip().str.upper()
            is_spm = sys_series.isin(["SPM", "SPM_VTNET"])
            filtered_out_count = int(is_spm.sum())
            df_valid = df[~is_spm].copy()
        else:
            df_valid = df.copy()

        # Filter out rows with empty "Mã công việc"
        df_valid = df_valid[df_valid["Mã công việc"].notna()].copy()
        df_valid["Mã công việc"] = df_valid["Mã công việc"].astype(str).str.strip()
        df_valid = df_valid[df_valid["Mã công việc"] != ""]

        # Deduplicate by "Mã công việc" keeping the latest row
        df_valid = df_valid.drop_duplicates(subset=["Mã công việc"], keep="last")
        df_valid = df_valid.reset_index(drop=True)

        # Free original df immediately to conserve RAM on 2GB VPS
        del df

        t_filter = time.perf_counter() - t_filter_0
        print(f"[ETL] filter: {t_filter:.2f}s", flush=True)

        import_record.filtered_out_count = filtered_out_count
        import_record.progress_percent = 25
        db.commit()

        # Step 3: Resolve dimensions in bulk
        t_dims_0 = time.perf_counter()
        dim_cache = resolve_dimensions_in_bulk(db, df_valid)
        t_dims = time.perf_counter() - t_dims_0
        print(f"[ETL] dims: {t_dims:.2f}s", flush=True)

        import_record.progress_percent = 35
        try:
            if os.path.exists(file_path):
                import_record.file_size_bytes = os.path.getsize(file_path)
        except Exception:
            pass
        db.commit()

        # Prepare vectorized columns for the entire valid dataset
        total_tasks = len(df_valid)
        now = datetime.utcnow()

        ma_cv_l       = _vectorize_str_col(df_valid.get("Mã công việc"), total_tasks)
        ma_cha_l      = _vectorize_str_col(df_valid.get("Mã công việc cha"), total_tasks)
        loai_cv_l     = _vectorize_str_col(df_valid.get("Loại công việc"), total_tasks)
        noi_dung_l    = _vectorize_str_col(df_valid.get("Nội dung công việc"), total_tasks)
        ghi_chu_l     = _vectorize_str_col(df_valid.get("Ghi chú"), total_tasks)
        trang_thai_l  = _vectorize_str_col(df_valid.get("Trạng thái"), total_tasks)
        tt_ht_l       = _vectorize_str_col(df_valid.get("Trạng thái hoàn thành"), total_tasks)
        loi_l         = _vectorize_str_col(df_valid.get("Lỗi"), total_tasks)
        thue_bao_l    = _vectorize_str_col(df_valid.get("Thuê bao"), total_tasks)
        worklog_l     = _vectorize_str_col(df_valid.get("Worklog"), total_tasks)
        ft_comment_l  = _vectorize_str_col(df_valid.get("FT comment"), total_tasks)
        ft_mobile_l   = _vectorize_str_col(df_valid.get("FT mobile"), total_tasks)

        type_ids_l     = _vectorize_fk_col(df_valid.get("Loại công việc"), dim_cache["task_types"], total_tasks)
        assigned_ids_l = _vectorize_fk_col(df_valid.get("Nhân viên thực hiện"), dim_cache["employees"], total_tasks)
        created_ids_l  = _vectorize_fk_col(df_valid.get("Nhân viên khởi tạo"), dim_cache["employees"], total_tasks)
        group_ids_l    = _vectorize_fk_col(df_valid.get("Nhóm điều phối"), dim_cache["groups"], total_tasks)
        system_ids_l   = _vectorize_fk_col(df_valid.get("Hệ thống"), dim_cache["systems"], total_tasks)
        unit_ids_l     = _vectorize_fk_col(df_valid.get("Đơn vị tạo"), dim_cache["units"], total_tasks)
        station_ids_l  = _vectorize_fk_col(df_valid.get("Mã trạm"), dim_cache["stations"], total_tasks)

        tgcl_l        = _vectorize_float_col(df_valid.get("Thời gian còn lại (H)"), total_tasks)

        dt_tao_l      = _vectorize_dt_col(df_valid.get("Thời điểm tạo"), total_tasks)
        dt_bat_dau_l  = _vectorize_dt_col(df_valid.get("Thời điểm bắt đầu thực hiện (dd/MM/yyyy HH:mm:ss)"), total_tasks)
        dt_ket_thuc_l = _vectorize_dt_col(df_valid.get("Thời điểm yêu cầu kết thúc (dd/MM/yyyy HH:mm:ss)"), total_tasks)
        dt_ft_ht_l    = _vectorize_dt_col(df_valid.get("Thời điểm FT hoàn thành"), total_tasks)
        dt_cd_dong_l  = _vectorize_dt_col(df_valid.get("Thời điểm CD đóng"), total_tasks)
        dt_ft_tn_l    = _vectorize_dt_col(df_valid.get("Thời điểm FT tiếp nhận"), total_tasks)

        # Free df_valid to release memory
        del df_valid

        # =========================================================================
        # MAIN ATOMIC TRANSACTION:
        # PRAGMA optimizations -> Delete old -> Insert in slices -> Update ImportLog -> Commit ONCE
        # =========================================================================
        if is_sqlite:
            db.execute(text("PRAGMA foreign_keys = OFF"))
            db.execute(text("PRAGMA cache_size = -32000"))
            db.execute(text("PRAGMA temp_store = MEMORY"))
            db.execute(text("PRAGMA mmap_size = 268435456"))
            db.execute(text("PRAGMA synchronous = NORMAL"))
        else:
            db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))

        # Step 4: Delete old task data
        t_clear_0 = time.perf_counter()
        db.query(TaskHistory).delete(synchronize_session=False)
        db.query(Task).delete(synchronize_session=False)
        t_clear = time.perf_counter() - t_clear_0
        print(f"[ETL] clear: {t_clear:.2f}s", flush=True)

        # Step 5: Build + insert in slices of 10,000 rows
        batch_size = 10000
        t_build_total = 0.0
        t_insert_total = 0.0

        for i in range(0, total_tasks, batch_size):
            end_i = min(i + batch_size, total_tasks)

            t_b0 = time.perf_counter()
            batch = []
            for idx in range(i, end_i):
                ma_cv = ma_cv_l[idx]
                if not ma_cv:
                    continue
                batch.append({
                    "ma_cong_viec":                ma_cv,
                    "ma_cong_viec_cha":            ma_cha_l[idx],
                    "task_type_id":                type_ids_l[idx],
                    "loai_cong_viec":              loai_cv_l[idx],
                    "noi_dung_cong_viec":          noi_dung_l[idx],
                    "ghi_chu":                     ghi_chu_l[idx],
                    "trang_thai":                  trang_thai_l[idx],
                    "trang_thai_hoan_thanh":       tt_ht_l[idx],
                    "system_id":                   system_ids_l[idx],
                    "created_by_id":               created_ids_l[idx],
                    "thoi_diem_tao":               dt_tao_l[idx],
                    "group_id":                    group_ids_l[idx],
                    "assigned_to_id":              assigned_ids_l[idx],
                    "loi":                         loi_l[idx],
                    "thoi_diem_bat_dau_thuc_hien": dt_bat_dau_l[idx],
                    "thoi_diem_yeu_cau_ket_thuc":  dt_ket_thuc_l[idx],
                    "thoi_gian_con_lai":           tgcl_l[idx],
                    "thoi_diem_ft_hoan_thanh":     dt_ft_ht_l[idx],
                    "thoi_diem_cd_dong":           dt_cd_dong_l[idx],
                    "thoi_diem_ft_tiep_nhan":      dt_ft_tn_l[idx],
                    "thue_bao":                    thue_bao_l[idx],
                    "unit_id":                     unit_ids_l[idx],
                    "worklog":                     worklog_l[idx],
                    "station_id":                  station_ids_l[idx],
                    "ft_comment":                  ft_comment_l[idx],
                    "ft_mobile":                   ft_mobile_l[idx],
                    "created_at":                  now,
                    "updated_at":                  now,
                    "last_import_id":              import_id,
                })
            t_build_total += (time.perf_counter() - t_b0)

            if batch:
                t_i0 = time.perf_counter()
                try:
                    db.execute(insert(Task.__table__), batch)
                except Exception:
                    db.bulk_insert_mappings(Task, batch)
                t_insert_total += (time.perf_counter() - t_i0)

            # Record progress to progress file (avoids SQLite writer contention)
            pct = 40 + int((end_i / max(1, total_tasks)) * 55)
            _write_progress_file(file_path, min(pct, 96), end_i, total_tasks)

        print(f"[ETL] build: {t_build_total:.2f}s, insert: {t_insert_total:.2f}s (total build+insert: {t_build_total + t_insert_total:.2f}s)", flush=True)

        # Step 6: Update ImportLog inside the same transaction
        db.query(ImportLog).filter(
            or_(ImportLog.domain == "main", ImportLog.domain.is_(None)),
            ImportLog.id != import_id
        ).update({"is_active": 0})

        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if import_record:
            import_record.is_active = 1
            import_record.status = "COMPLETED"
            import_record.progress_percent = 100
            import_record.inserted_count = total_tasks
            import_record.updated_count = 0
            import_record.unchanged_count = 0
            import_record.error_message = None

        # Step 7: Commit ONCE at the end
        t_commit_0 = time.perf_counter()
        db.commit()
        t_commit = time.perf_counter() - t_commit_0
        print(f"[ETL] commit: {t_commit:.2f}s", flush=True)

        # Re-enable foreign keys
        if is_sqlite:
            try:
                db.execute(text("PRAGMA foreign_keys = ON"))
                db.commit()
            except Exception:
                pass
        else:
            try:
                db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
                db.commit()
            except Exception:
                pass


        t_total = time.perf_counter() - t_start
        print(f"[ETL] total: {t_total:.2f}s", flush=True)

    except Exception as e:
        db.rollback()
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Import Error: {err_msg}", flush=True)
        try:
            _enable_fk(db)
        except Exception:
            pass

        try:
            import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
            if import_record:
                import_record.status = "FAILED"
                import_record.error_message = str(e) if len(str(e)) > 10 else err_msg[:1000]
                db.commit()
        except Exception:
            pass
    finally:
        _cleanup_progress_file(file_path)
        db.close()


def run_import_job(import_id: int, file_path: str, filter_spm: bool = True):
    """
    Entrypoint executed inside a separate child process (ProcessPoolExecutor).
    Disposes inherited connection pool and runs process_excel_import.
    """
    try:
        from backend.database import engine
        engine.dispose()
    except Exception:
        pass
    return process_excel_import(import_id=import_id, file_path=file_path, filter_spm=filter_spm)
