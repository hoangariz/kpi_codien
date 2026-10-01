import os
import re
import math
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.database import SessionLocal, is_sqlite
from backend.models import (
    Employee, Group, TaskType, SystemModel, Unit, Station,
    ImportLog, Task, TaskHistory
)
from backend.models.note import TaskNote
from backend.config import CHUNK_SIZE


def _disable_fk(db: Session):
    """Tắt FOREIGN KEY check ở connection-level để DELETE không bị lỗi constraint."""
    if is_sqlite:
        db.execute(text("PRAGMA foreign_keys = OFF"))
    else:
        db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    db.commit()


def _enable_fk(db: Session):
    """Bật lại FOREIGN KEY check sau khi xóa xong."""
    if is_sqlite:
        db.execute(text("PRAGMA foreign_keys = ON"))
    else:
        db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    db.commit()


def clear_task_tables(db: Session):
    """
    Xóa sạch toàn bộ dữ liệu task (notes, history, tasks) theo đúng thứ tự FK.
    Dùng PRAGMA foreign_keys = OFF để tránh lỗi constraint trên SQLite.
    """
    _disable_fk(db)
    try:
        db.query(TaskNote).delete(synchronize_session=False)
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
    return s if s else None


def clean_float(val) -> Optional[float]:
    """Clean float / numeric values."""
    if val is None or pd.isna(val):
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None


def resolve_dimensions_in_bulk(db: Session, df: pd.DataFrame) -> Dict[str, Any]:
    """
    Get-or-create dimension entries in memory cache.
    Safely handles case-insensitivity, prevents duplicates, and avoids SQLite variable limits.
    """
    cache = {
        "employees": {},
        "groups": {},
        "systems": {},
        "units": {},
        "stations": {},
        "task_types": {},
    }

    def resolve_dim(model_cls, name_col, items_set):
        existing = db.query(getattr(model_cls, name_col), model_cls.id).all()
        exact_map = {str(k).strip(): v for k, v in existing if k is not None}
        lower_map = {str(k).strip().lower(): v for k, v in existing if k is not None}

        new_names_dict = {}
        for item in items_set:
            if not item:
                continue
            item_str = str(item).strip()
            if not item_str:
                continue
            item_lower = item_str.lower()
            if item_str not in exact_map and item_lower not in lower_map:
                if item_lower not in new_names_dict:
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
            exact_map = {str(k).strip(): v for k, v in existing if k is not None}
            lower_map = {str(k).strip().lower(): v for k, v in existing if k is not None}

        class CaseInsensitiveCache(dict):
            def get(self, key, default=None):
                if key is None:
                    return default
                k_str = str(key).strip()
                if k_str in exact_map:
                    return exact_map[k_str]
                return lower_map.get(k_str.lower(), default)

        return CaseInsensitiveCache(exact_map)

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


def _build_tasks_vectorized(
    df: pd.DataFrame,
    emp_cache, group_cache, sys_cache, unit_cache, station_cache, type_cache,
    import_id: int,
    now: datetime
) -> list:
    """
    Xây dựng danh sách tasks bằng vectorized pandas thay vì Python for-loop.
    Nhanh hơn 5-10x, tốn ít CPU hơn nhiều so với iterrows/to_dict loop.
    """

    def _fk_int(v):
        """
        Chuyển đổi giá trị FK từ pandas về int hoặc None.
        Pandas tự convert None -> NaN (float) khi Series có mixed int/None.
        Hàm này đảm bảo NaN float không lọt vào SQLite INTEGER column.
        """
        if v is None:
            return None
        try:
            if isinstance(v, float) and math.isnan(v):
                return None
            return int(v)
        except (TypeError, ValueError):
            return None

    def _map_series(series: pd.Series, cache, default=None) -> pd.Series:
        """
        Map một pandas Series thông qua dict cache.
        Dùng astype(object) để pandas không auto-convert None -> NaN.
        """
        result = series.map(
            lambda v: cache.get(str(v).strip()) if pd.notna(v) and str(v).strip() else default
        )
        # Ép object dtype để giữ None, tránh pandas convert None→NaN→crash khi INSERT INTEGER
        return result.astype(object).where(result.notna(), None)

    def _clean_series(series: pd.Series) -> pd.Series:
        """Convert NaN → None, strip string."""
        return series.where(series.notna(), None).apply(
            lambda v: str(v).strip() if v is not None and str(v).strip() not in ("nan", "None", "") else None
        )

    def _parse_dt_series(series: pd.Series) -> pd.Series:
        """Parse datetime series an toàn."""
        return series.apply(parse_datetime_safe)

    def _get_col(df, name, default=None):
        return df[name] if name in df.columns else pd.Series([default] * len(df), index=df.index)

    n = len(df)

    ma_cv_s       = _clean_series(_get_col(df, "Mã công việc"))
    loai_cv_s     = _clean_series(_get_col(df, "Loại công việc"))
    assigned_s    = _clean_series(_get_col(df, "Nhân viên thực hiện"))
    created_s     = _clean_series(_get_col(df, "Nhân viên khởi tạo"))
    group_s       = _clean_series(_get_col(df, "Nhóm điều phối"))
    sys_s         = _clean_series(_get_col(df, "Hệ thống"))
    unit_s        = _clean_series(_get_col(df, "Đơn vị tạo"))
    station_s     = _clean_series(_get_col(df, "Mã trạm"))

    # FK integer series - dùng _map_series với object dtype để giữ None
    task_type_ids  = _map_series(loai_cv_s, type_cache)
    assigned_ids   = _map_series(assigned_s, emp_cache)
    created_ids    = _map_series(created_s, emp_cache)
    group_ids      = _map_series(group_s, group_cache)
    system_ids     = _map_series(sys_s, sys_cache)
    unit_ids       = _map_series(unit_s, unit_cache)
    station_ids    = _map_series(station_s, station_cache)

    trang_thai_s   = _clean_series(_get_col(df, "Trạng thái"))
    trang_thai_ht  = _clean_series(_get_col(df, "Trạng thái hoàn thành"))
    noi_dung_s     = _clean_series(_get_col(df, "Nội dung công việc"))
    ghi_chu_s      = _clean_series(_get_col(df, "Ghi chú"))
    loi_s          = _clean_series(_get_col(df, "Lỗi"))
    thue_bao_s     = _clean_series(_get_col(df, "Thuê bao"))
    worklog_s      = _clean_series(_get_col(df, "Worklog"))
    ft_comment_s   = _clean_series(_get_col(df, "FT comment"))
    ft_mobile_s    = _clean_series(_get_col(df, "FT mobile"))
    ma_cha_s       = _clean_series(_get_col(df, "Mã công việc cha"))

    tgcl_s = _get_col(df, "Thời gian còn lại (H)").apply(clean_float)

    dt_tao_s       = _parse_dt_series(_get_col(df, "Thời điểm tạo"))
    dt_bat_dau_s   = _parse_dt_series(_get_col(df, "Thời điểm bắt đầu thực hiện (dd/MM/yyyy HH:mm:ss)"))
    dt_ket_thuc_s  = _parse_dt_series(_get_col(df, "Thời điểm yêu cầu kết thúc (dd/MM/yyyy HH:mm:ss)"))
    dt_ft_ht_s     = _parse_dt_series(_get_col(df, "Thời điểm FT hoàn thành"))
    dt_cd_dong_s   = _parse_dt_series(_get_col(df, "Thời điểm CD đóng"))
    dt_ft_tn_s     = _parse_dt_series(_get_col(df, "Thời điểm FT tiếp nhận"))

    tasks = []
    for i in range(n):
        ma_cv = ma_cv_s.iloc[i]
        if not ma_cv:
            continue
        tasks.append({
            "ma_cong_viec":                    ma_cv,
            "ma_cong_viec_cha":                ma_cha_s.iloc[i],
            # Dùng _fk_int() để đảm bảo NaN float không lọt vào cột INTEGER
            "task_type_id":                    _fk_int(task_type_ids.iloc[i]),
            "loai_cong_viec":                  loai_cv_s.iloc[i],
            "noi_dung_cong_viec":              noi_dung_s.iloc[i],
            "ghi_chu":                         ghi_chu_s.iloc[i],
            "trang_thai":                      trang_thai_s.iloc[i],
            "trang_thai_hoan_thanh":           trang_thai_ht.iloc[i],
            "system_id":                       _fk_int(system_ids.iloc[i]),
            "created_by_id":                   _fk_int(created_ids.iloc[i]),
            "thoi_diem_tao":                   dt_tao_s.iloc[i],
            "group_id":                        _fk_int(group_ids.iloc[i]),
            "assigned_to_id":                  _fk_int(assigned_ids.iloc[i]),
            "loi":                             loi_s.iloc[i],
            "thoi_diem_bat_dau_thuc_hien":     dt_bat_dau_s.iloc[i],
            "thoi_diem_yeu_cau_ket_thuc":      dt_ket_thuc_s.iloc[i],
            "thoi_gian_con_lai":               tgcl_s.iloc[i],
            "thoi_diem_ft_hoan_thanh":         dt_ft_ht_s.iloc[i],
            "thoi_diem_cd_dong":               dt_cd_dong_s.iloc[i],
            "thoi_diem_ft_tiep_nhan":          dt_ft_tn_s.iloc[i],
            "thue_bao":                        thue_bao_s.iloc[i],
            "unit_id":                         _fk_int(unit_ids.iloc[i]),
            "worklog":                         worklog_s.iloc[i],
            "station_id":                      _fk_int(station_ids.iloc[i]),
            "ft_comment":                      ft_comment_s.iloc[i],
            "ft_mobile":                       ft_mobile_s.iloc[i],
            "created_at":                      now,
            "updated_at":                      now,
            "last_import_id":                  import_id,
        })
    return tasks



def process_excel_import(import_id: int, file_path: str, filter_spm: bool = True):
    """
    Main ETL function executed in background.
    Tối ưu cho VPS 2 vCPU / 2GB RAM:
    - Vectorized pandas build (5-10x nhanh hơn Python loop)
    - SQLite WAL PRAGMA tuning cho insert nhanh
    - time.sleep() giữa batch để nhường CPU cho web server
    - Batch size nhỏ hơn (3000) để tránh spike CPU
    """
    import time

    db = SessionLocal()
    try:
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if not import_record:
            return

        import_record.status = "PROCESSING"
        import_record.progress_percent = 5
        db.commit()

        # SQLite WAL PRAGMA tối ưu cho insert nhanh trên VPS nhỏ
        if is_sqlite:
            db.execute(text("PRAGMA cache_size = -32000"))   # 32MB cache
            db.execute(text("PRAGMA temp_store = MEMORY"))   # temp tables vào RAM
            db.execute(text("PRAGMA mmap_size = 268435456")) # 256MB mmap
            db.commit()

        # Step 1: Read excel or csv file
        file_path_lower = file_path.lower()
        if file_path_lower.endswith(".csv"):
            df = pd.read_csv(file_path, low_memory=False, encoding_errors="replace")
        elif file_path_lower.endswith(".xls"):
            try:
                df = pd.read_excel(file_path, engine="xlrd")
            except Exception:
                try:
                    df = pd.read_excel(file_path)
                except Exception as ex:
                    raise ValueError(f"Không thể đọc file .xls (Excel 97-2003). Vui lòng lưu file sang định dạng .xlsx để hệ thống xử lý nhanh: {ex}")
        else:
            try:
                import calamine
                df = pd.read_excel(file_path, engine="calamine")
            except Exception:
                try:
                    df = pd.read_excel(file_path, engine="openpyxl", engine_kwargs={"read_only": True, "data_only": True})
                except Exception:
                    df = pd.read_excel(file_path, engine="openpyxl")

        total_rows = len(df)
        import_record.total_rows = total_rows
        import_record.progress_percent = 15
        db.commit()

        # Normalize column headers (strip spaces, replace non-breaking spaces, remove BOM)
        df.columns = [re.sub(r'\s+', ' ', str(c).strip().replace('\ufeff', '')) for c in df.columns]

        # Auto-detect real header row if the file has metadata rows at the top (e.g. 7 title lines from GNOC)
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
        db.commit()

        # Step 2: Filter out SPM and SPM_VTNET rows (only if filter_spm is True)
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

        # CRITICAL: Deduplicate by "Mã công việc" keeping the latest row to prevent UNIQUE constraint collisions!
        df_valid = df_valid.drop_duplicates(subset=["Mã công việc"], keep="last")
        df_valid = df_valid.reset_index(drop=True)

        import_record.filtered_out_count = filtered_out_count
        import_record.progress_percent = 25
        db.commit()

        # Step 3: Resolve dimensions in bulk
        dim_cache = resolve_dimensions_in_bulk(db, df_valid)
        emp_cache    = dim_cache["employees"]
        group_cache  = dim_cache["groups"]
        sys_cache    = dim_cache["systems"]
        unit_cache   = dim_cache["units"]
        station_cache = dim_cache["stations"]
        type_cache   = dim_cache["task_types"]

        import_record.progress_percent = 35
        db.commit()

        # Step 4: Record file size
        try:
            if os.path.exists(file_path):
                import_record.file_size_bytes = os.path.getsize(file_path)
        except Exception:
            pass

        # Step 5: Xoá sạch dữ liệu công việc cũ trong database trước khi nạp file mới
        import_record.progress_percent = 40
        db.commit()

        clear_task_tables(db)

        # Step 6: Chuẩn bị dữ liệu bằng vectorized pandas (nhanh 5-10x so với Python loop)
        now = datetime.utcnow()
        tasks_to_insert = _build_tasks_vectorized(
            df_valid,
            emp_cache, group_cache, sys_cache, unit_cache, station_cache, type_cache,
            import_id, now
        )

        # Bulk insert theo batch nhỏ hơn để tránh spike CPU trên VPS 2 core
        # Batch 3000 rows + sleep 100ms giữa batch để nhường CPU cho web server
        batch_size = 3000
        total_tasks = len(tasks_to_insert)
        for i in range(0, total_tasks, batch_size):
            batch = tasks_to_insert[i : i + batch_size]
            db.bulk_insert_mappings(Task, batch)
            db.commit()

            pct = 45 + int(((i + len(batch)) / max(1, total_tasks)) * 50)
            import_record.progress_percent = min(pct, 96)
            import_record.inserted_count = i + len(batch)
            db.commit()

            # Nhường CPU cho uvicorn event loop giữa các batch (tránh treo web)
            time.sleep(0.05)

        # Re-enable foreign keys (đã được enable trong clear_task_tables rồi, gọi lại cho chắc)
        _enable_fk(db)

        # Step 7: Kích hoạt file này là file đang sử dụng trong DB (is_active = 1)
        db.query(ImportLog).filter(ImportLog.id != import_id).update({"is_active": 0})
        import_record.is_active = 1
        import_record.status = "COMPLETED"
        import_record.progress_percent = 100
        import_record.inserted_count = total_tasks
        import_record.updated_count = 0
        import_record.unchanged_count = 0
        import_record.error_message = None
        db.commit()

        # Step 8: Pre-compute & warm up statistics immediately upon import
        try:
            from backend.services.stats_service import get_special_maintenance_stats, get_kpi_overview, MAINTENANCE_TASK_TYPE
            get_special_maintenance_stats(db, MAINTENANCE_TASK_TYPE)
            get_kpi_overview(db)
        except Exception as ex:
            print(f"Pre-computation warning: {ex}")

    except Exception as e:
        db.rollback()
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Import Error: {err_msg}")
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
        db.close()

