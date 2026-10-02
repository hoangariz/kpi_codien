import os
import json
import re
import time
import threading
import traceback
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from collections import defaultdict
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_, and_, case, distinct, text, insert

from backend.database import is_sqlite, SessionLocal
from backend.models.task import Task
from backend.models.task_codinh import TaskCodinh
from backend.models.dimensions import Employee, Group, SystemModel, Station
from backend.models.report_category import ReportCategory, ReportSubCategory
from backend.models.cabinet import Cabinet
from backend.models.settings import SystemSetting
from backend.models.import_log import ImportLog
from backend.models.note import TaskNote
from backend.services.settings_service import get_current_month_setting
from backend.services.user_mapping import get_user_full_name, get_usernames_by_name
from backend.config import UPLOAD_DIR

CLOSED_STATUSES = ["Đóng", "FT hoàn thành", "FT Hoàn thành", "FT Hoàn Thành"]


def _parse_filter_values(raw: Optional[str]) -> List[str]:
    """Deserialize filter_values JSON string -> list."""
    if not raw:
        return []
    try:
        vals = json.loads(raw)
        return [v for v in vals if v and str(v).strip()] if isinstance(vals, list) else []
    except Exception:
        return []


def _parse_date_safe(val) -> Optional[datetime]:
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.to_pydatetime() if isinstance(val, pd.Timestamp) else val
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("nan", "nat", "none"):
        return None
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%Y-%m-%d"):
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


def _vectorize_str_col(series: Optional[pd.Series], n: int, default_val: Optional[str] = None) -> list:
    """Vectorized string cleaning: strips whitespace, converts empty/'nan'/'none' to default_val or None."""
    if series is None:
        return [default_val] * n
    s = series.astype("string").str.strip()
    s_clean = s.mask(s.isna() | s.str.lower().isin(["", "nan", "nat", "none", "<na>"]), default_val)
    return [str(x) if x is not None and not pd.isna(x) else default_val for x in s_clean]


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
    """
    Parse separate base WO Excel file for Cố Định Băng Rộng (CĐBR) and save into codinh_tasks table.
    Completely isolated from the main dashboard (Cơ điện) tasks table.
    Uses resilient calamine/openpyxl engine, vectorized column cleaning, single transaction, and batch inserts.
    """
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

    # Step 1: Read file
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

    # Normalize column headers (strip spaces, replace non-breaking spaces, remove BOM)
    df.columns = [re.sub(r'\s+', ' ', str(c).strip().replace('\ufeff', '')) for c in df.columns]

    # Auto-detect real header row in first 25 rows
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

    # Detect columns with synonyms
    col_map = {}

    # 1. Assigned employee detection (Must NEVER pick 'khởi tạo', 'tạo', 'điều phối')
    for c in df.columns:
        c_low = str(c).strip().lower()
        if any(ex in c_low for ex in ("khởi tạo", "khoi tao", "người tạo", "nguoi tao", "điều phối", "dieu phoi", "giao việc", "giao viec")):
            continue
        if any(k in c_low for k in (
            "nhân viên thực hiện", "nhan vien thuc hien",
            "người nhận việc", "nguoi nhan viec",
            "nhân viên nhận việc", "nhan vien nhan viec",
            "người thực hiện", "nguoi thuc hien",
            "nhân viên xử lý", "người xử lý", "nguoi xu ly",
            "ft thực hiện", "user nhận", "user thực hiện",
            "nhân viên tiếp nhận", "người tiếp nhận"
        )) or c_low in ("ft", "nhân viên", "nhan vien", "người nhận", "nguoi nhan"):
            col_map["nhan_vien"] = c
            break

    if "nhan_vien" not in col_map:
        for c in df.columns:
            c_low = str(c).strip().lower()
            if any(ex in c_low for ex in ("khởi tạo", "khoi tao", "người tạo", "nguoi tao")):
                continue
            if any(k in c_low for k in ("thực hiện", "thuc hien", "nhận việc", "nhan viec")):
                col_map["nhan_vien"] = c
                break

    for c in df.columns:
        c_low = str(c).strip().lower()
        if any(k in c_low for k in ("mã công việc", "mã cv", "ma cong viec", "ma_cong_viec")) or c_low == "wo":
            if "ma_cong_viec" not in col_map: col_map["ma_cong_viec"] = c
        elif any(k in c_low for k in ("loại công việc", "loai cong viec", "loai_cong_viec")):
            if "loai_cong_viec" not in col_map: col_map["loai_cong_viec"] = c
        elif any(k in c_low for k in ("nội dung công việc", "noi dung cong viec", "nội dung", "noi dung")):
            if "noi_dung_cong_viec" not in col_map: col_map["noi_dung_cong_viec"] = c
        elif any(k in c_low for k in ("ghi chú", "ghi chu", "mô tả", "mo ta")):
            if "ghi_chu" not in col_map: col_map["ghi_chu"] = c
        elif any(k in c_low for k in ("trạng thái", "trang thai")):
            if "trang_thai" not in col_map: col_map["trang_thai"] = c
        elif any(k in c_low for k in ("hệ thống", "he thong")):
            if "he_thong" not in col_map: col_map["he_thong"] = c
        elif any(k in c_low for k in ("nhóm điều phối", "nhom dieu phoi", "cụm", "cum", "nhóm", "nhom")):
            if "nhom" not in col_map: col_map["nhom"] = c
        elif any(k in c_low for k in ("mã trạm", "ma tram", "trạm", "tram")):
            if "ma_tram" not in col_map: col_map["ma_tram"] = c
        elif any(k in c_low for k in ("thời điểm tạo", "thoi diem tao", "ngày tạo")):
            if "thoi_diem_tao" not in col_map: col_map["thoi_diem_tao"] = c
        elif any(k in c_low for k in ("thời điểm bắt đầu thực hiện", "thoi diem bat dau thuc hien", "thời điểm bắt đầu", "bắt đầu thực hiện")):
            if "thoi_diem_bat_dau_thuc_hien" not in col_map: col_map["thoi_diem_bat_dau_thuc_hien"] = c
        elif any(k in c_low for k in ("thời điểm yêu cầu kết thúc", "yêu cầu kết thúc", "hạn hoàn thành", "han hoan thanh")):
            if "thoi_diem_yeu_cau_ket_thuc" not in col_map: col_map["thoi_diem_yeu_cau_ket_thuc"] = c
        elif any(k in c_low for k in ("thời gian còn lại", "thoi gian con lai")):
            if "thoi_gian_con_lai" not in col_map: col_map["thoi_gian_con_lai"] = c
        elif any(k in c_low for k in ("ft hoàn thành", "ft hoan thanh")):
            if "thoi_diem_ft_hoan_thanh" not in col_map: col_map["thoi_diem_ft_hoan_thanh"] = c
        elif any(k in c_low for k in ("cđ đóng", "cd dong", "thời điểm đóng")):
            if "thoi_diem_cd_dong" not in col_map: col_map["thoi_diem_cd_dong"] = c

    if "ma_cong_viec" not in col_map:
        avail = ", ".join(list(df.columns)[:8])
        raise ValueError(f"File thiếu cột bắt buộc 'Mã công việc'. Các cột tìm thấy: [{avail}]. Vui lòng kiểm tra lại file!")

    t_filter_start = time.perf_counter()
    df_valid = df[df[col_map["ma_cong_viec"]].notna()].copy()
    df_valid["ma_cong_viec_clean"] = df_valid[col_map["ma_cong_viec"]].astype(str).str.strip()
    df_valid = df_valid[df_valid["ma_cong_viec_clean"] != ""]
    df_valid = df_valid.drop_duplicates(subset=["ma_cong_viec_clean"], keep="last")
    total_valid = len(df_valid)
    del df  # Free raw dataframe memory immediately

    # Vectorized column extractions
    v_ma_cv = _vectorize_str_col(df_valid["ma_cong_viec_clean"], total_valid)
    v_loai_cv = _vectorize_str_col(df_valid[col_map["loai_cong_viec"]] if "loai_cong_viec" in col_map else None, total_valid)
    v_noi_dung = _vectorize_str_col(df_valid[col_map["noi_dung_cong_viec"]] if "noi_dung_cong_viec" in col_map else None, total_valid)
    v_ghi_chu = _vectorize_str_col(df_valid[col_map["ghi_chu"]] if "ghi_chu" in col_map else None, total_valid)
    v_trang_thai = _vectorize_str_col(df_valid[col_map["trang_thai"]] if "trang_thai" in col_map else None, total_valid, default_val="Chưa rõ")
    v_he_thong = _vectorize_str_col(df_valid[col_map["he_thong"]] if "he_thong" in col_map else None, total_valid)
    v_nhan_vien = _vectorize_str_col(df_valid[col_map["nhan_vien"]] if "nhan_vien" in col_map else None, total_valid, default_val="Chưa gán")
    v_nhom = _vectorize_str_col(df_valid[col_map["nhom"]] if "nhom" in col_map else None, total_valid, default_val="Chưa phân nhóm")
    v_ma_tram = _vectorize_str_col(df_valid[col_map["ma_tram"]] if "ma_tram" in col_map else None, total_valid)

    v_thoi_gian_con_lai = _vectorize_float_col(df_valid[col_map["thoi_gian_con_lai"]] if "thoi_gian_con_lai" in col_map else None, total_valid)

    v_thoi_diem_tao = _vectorize_dt_col(df_valid[col_map["thoi_diem_tao"]] if "thoi_diem_tao" in col_map else None, total_valid)
    v_thoi_diem_bat_dau = _vectorize_dt_col(df_valid[col_map["thoi_diem_bat_dau_thuc_hien"]] if "thoi_diem_bat_dau_thuc_hien" in col_map else None, total_valid)
    v_thoi_diem_ket_thuc = _vectorize_dt_col(df_valid[col_map["thoi_diem_yeu_cau_ket_thuc"]] if "thoi_diem_yeu_cau_ket_thuc" in col_map else None, total_valid)
    v_thoi_diem_ft_ht = _vectorize_dt_col(df_valid[col_map["thoi_diem_ft_hoan_thanh"]] if "thoi_diem_ft_hoan_thanh" in col_map else None, total_valid)
    v_thoi_diem_cd_dong = _vectorize_dt_col(df_valid[col_map["thoi_diem_cd_dong"]] if "thoi_diem_cd_dong" in col_map else None, total_valid)

    # Counts
    is_closed = pd.Series(v_trang_thai).isin(CLOSED_STATUSES)
    closed_cnt = int(is_closed.sum())
    pending_cnt = int((~is_closed).sum())

    del df_valid  # Free valid dataframe
    t_filter = time.perf_counter()
    print(f"[ETL CODINH] filter: {t_filter - t_filter_start:.2f}s", flush=True)

    if import_record:
        import_record.progress_percent = 45
        db.commit()

    try:
        t_clear_start = time.perf_counter()
        if is_sqlite:
            try:
                db.execute(text("PRAGMA foreign_keys = OFF"))
                db.execute(text("PRAGMA cache_size = -32000"))
                db.execute(text("PRAGMA temp_store = MEMORY"))
                db.execute(text("PRAGMA mmap_size = 268435456"))
                db.execute(text("PRAGMA synchronous = NORMAL"))
            except Exception:
                pass

        # Clear old codinh_tasks within single transaction
        db.execute(text("DELETE FROM codinh_tasks"))
        t_clear = time.perf_counter()
        print(f"[ETL CODINH] clear: {t_clear - t_clear_start:.2f}s", flush=True)

        t_build_total = 0.0
        t_insert_total = 0.0
        now = datetime.utcnow()
        inserted_total = 0

        BATCH_SIZE = 10000
        for i in range(0, total_valid, BATCH_SIZE):
            t_b_start = time.perf_counter()
            batch_end = min(i + BATCH_SIZE, total_valid)
            batch = []
            for j in range(i, batch_end):
                batch.append({
                    "ma_cong_viec": v_ma_cv[j],
                    "loai_cong_viec": v_loai_cv[j],
                    "noi_dung_cong_viec": v_noi_dung[j],
                    "ghi_chu": v_ghi_chu[j],
                    "trang_thai": v_trang_thai[j],
                    "he_thong": v_he_thong[j],
                    "nhan_vien": v_nhan_vien[j],
                    "nhom": v_nhom[j],
                    "ma_tram": v_ma_tram[j],
                    "thoi_diem_tao": v_thoi_diem_tao[j],
                    "thoi_diem_bat_dau_thuc_hien": v_thoi_diem_bat_dau[j],
                    "thoi_diem_yeu_cau_ket_thuc": v_thoi_diem_ket_thuc[j],
                    "thoi_gian_con_lai": v_thoi_gian_con_lai[j],
                    "thoi_diem_ft_hoan_thanh": v_thoi_diem_ft_ht[j],
                    "thoi_diem_cd_dong": v_thoi_diem_cd_dong[j],
                    "import_filename": filename,
                    "created_at": now,
                    "updated_at": now,
                })
            t_build_total += (time.perf_counter() - t_b_start)

            t_ins_start = time.perf_counter()
            try:
                db.execute(insert(TaskCodinh.__table__), batch)
            except Exception:
                db.bulk_insert_mappings(TaskCodinh, batch)
            t_insert_total += (time.perf_counter() - t_ins_start)

            inserted_total += len(batch)
            prog_pct = 50 + int((inserted_total / max(1, total_valid)) * 45)
            _write_progress_file(file_path_str, prog_pct, inserted_total, total_valid)

        print(f"[ETL CODINH] build: {t_build_total:.2f}s, insert: {t_insert_total:.2f}s", flush=True)

        # Sync cabinets of closed WOs
        try:
            closed_wos_subq = db.query(TaskCodinh.ma_cong_viec).filter(
                TaskCodinh.trang_thai.in_(CLOSED_STATUSES)
            ).scalar_subquery()
            db.query(Cabinet).filter(
                Cabinet.ma_wo.in_(closed_wos_subq),
                or_(
                    Cabinet.trang_thai_thc.like("%Đang%"),
                    Cabinet.trang_thai_thc.like("%đang%")
                )
            ).update({"trang_thai_thc": "Đã hoàn thành bảo dưỡng"}, synchronize_session=False)
        except Exception as e:
            print(f"Notice: Failed to sync closed WO cabinet statuses: {e}")

        # Update settings (within the same transaction)
        vn_now = now + timedelta(hours=7)
        vn_time_str = vn_now.strftime("%d/%m/%Y lúc %H:%M")
        _set_setting(db, "codinh_last_import_wo_time", now.isoformat(), commit=False)
        _set_setting(db, "codinh_last_import_wo_time_vn", vn_time_str, commit=False)
        _set_setting(db, "codinh_last_import_wo_filename", filename, commit=False)
        _set_setting(db, "codinh_last_import_wo_count", str(total_valid), commit=False)

        # Update ImportLog
        if import_record:
            db.query(ImportLog).filter(ImportLog.domain == "codinh", ImportLog.id != import_record.id).update({"is_active": 0})
            import_record.total_rows = total_valid
            import_record.inserted_count = total_valid
            import_record.status = "COMPLETED"
            import_record.progress_percent = 100
            import_record.is_active = 1
        else:
            db.query(ImportLog).filter(ImportLog.domain == "codinh").update({"is_active": 0})
            file_size = path_obj.stat().st_size if path_obj.exists() else 0
            new_log = ImportLog(
                file_name=filename,
                stored_filename=path_obj.name,
                file_size_bytes=file_size,
                is_active=1,
                imported_at=now,
                total_rows=total_valid,
                inserted_count=total_valid,
                status="COMPLETED",
                progress_percent=100,
                domain="codinh",
            )
            db.add(new_log)

        t_com_start = time.perf_counter()
        db.commit()
        clear_codinh_stats_cache()
        t_commit = time.perf_counter()
        print(f"[ETL CODINH] commit: {t_commit - t_com_start:.2f}s", flush=True)
        print(f"[ETL CODINH] total: {t_commit - t_start:.2f}s", flush=True)

        return {
            "filename": filename,
            "total_wos": total_valid,
            "closed_wos": closed_cnt,
            "pending_wos": pending_cnt,
            "imported_at_vn": vn_time_str,
        }
    except Exception as exc:
        db.rollback()
        raise exc
    finally:
        _cleanup_progress_file(file_path_str)
        if is_sqlite:
            try:
                db.execute(text("PRAGMA foreign_keys = ON"))
                db.commit()
            except Exception:
                pass


def process_codinh_wos_import(import_id: int, file_path: str):
    """Background ETL processor for CĐBR file imports."""
    from backend.database import SessionLocal
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
    except Exception as ex:
        traceback.print_exc()
        try:
            db.rollback()
        except Exception:
            pass
        try:
            import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
            if import_record:
                import_record.status = "FAILED"
                import_record.error_message = str(ex)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def run_codinh_import_job(import_id: int, file_path: str):
    """Entrypoint cho process con chạy import CĐBR: giải phóng pool cũ rồi chạy ETL."""
    try:
        from backend.database import engine
        engine.dispose()
    except Exception:
        pass
    process_codinh_wos_import(import_id, file_path)


def import_cabinets_from_excel(
    db: Session,
    file_path: Union[str, Path],
    filename: str,
    category_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Parse Excel file containing cabinet / THC details (e.g., demo_tu_theo_ma_wo_demo.xlsx).
    Automatically detects header row and column names.
    Inserts / replaces records in Cabinet table.
    """
    # Ensure Cabinet table exists
    try:
        Cabinet.__table__.create(bind=db.get_bind(), checkfirst=True)
    except Exception:
        pass

    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File {file_path} không tồn tại")

    path_str = str(path_obj).lower()

    # Read preview to detect header row
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

    # Detect required columns
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

    # Fallback for col_doi_tuong if still not found
    if not col_doi_tuong:
        for col in df.columns:
            c_clean = str(col).strip().lower()
            if "đối tượng" in c_clean or "tủ" in c_clean:
                col_doi_tuong = col
                break

    # Fallback for col_thc_status
    if not col_thc_status:
        for col in df.columns:
            if col != col_wo_status and "trạng thái" in str(col).strip().lower():
                col_thc_status = col
                break

    if not col_doi_tuong:
        raise ValueError(
            "Không tìm thấy cột 'Mã đối tượng' (Mã tủ cáp THC) trong file Excel. Vui lòng kiểm tra lại file!"
        )
    if not col_wo:
        raise ValueError(
            "Không tìm thấy cột 'Mã WO' trong file Excel. Vui lòng kiểm tra lại file!"
        )

    # Filter out empty rows
    df_valid = df[df[col_doi_tuong].notna() & df[col_wo].notna()].copy()
    df_valid["ma_doi_tuong_clean"] = df_valid[col_doi_tuong].astype(str).str.strip()
    df_valid["ma_wo_clean"] = df_valid[col_wo].astype(str).str.strip()
    df_valid = df_valid[(df_valid["ma_doi_tuong_clean"] != "") & (df_valid["ma_wo_clean"] != "")]

    # Deduplicate by (ma_wo, ma_doi_tuong)
    df_valid = df_valid.drop_duplicates(subset=["ma_wo_clean", "ma_doi_tuong_clean"])

    now = datetime.utcnow()
    records_to_insert = []
    completed_cabinets = 0
    pending_cabinets = 0
    unique_wos = set()

    # Pre-fetch closed WOs from database to accurately compute completion upon upload
    closed_wos_in_db = set(
        r[0] for r in db.query(TaskCodinh.ma_cong_viec).filter(
            TaskCodinh.trang_thai.in_(CLOSED_STATUSES)
        ).all()
    )
    task_closed_wos = set(
        r[0] for r in db.query(Task.ma_cong_viec).filter(
            Task.trang_thai.in_(CLOSED_STATUSES)
        ).all()
    )
    all_closed_wos = closed_wos_in_db | task_closed_wos

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
            wo_val in all_closed_wos or
            (wo_status is not None and wo_status.strip() in CLOSED_STATUSES)
        )
        is_thc_comp = "hoàn thành" in thc_status.lower() and "đang" not in thc_status.lower()

        if is_wo_closed or is_thc_comp:
            completed_cabinets += 1
        else:
            pending_cabinets += 1

        records_to_insert.append({
            "category_id": category_id,
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

    # Clear existing cabinets
    if category_id:
        db.query(Cabinet).filter(Cabinet.category_id == category_id).delete(synchronize_session=False)
    else:
        db.query(Cabinet).delete(synchronize_session=False)

    db.commit()

    # Bulk insert
    BATCH_SIZE = 1000
    for i in range(0, len(records_to_insert), BATCH_SIZE):
        batch = records_to_insert[i:i + BATCH_SIZE]
        db.bulk_insert_mappings(Cabinet, batch)
        db.commit()

    # Update settings
    vn_now = now + timedelta(hours=7)
    vn_time_str = vn_now.strftime("%d/%m/%Y lúc %H:%M")
    _set_setting(db, "codinh_last_import_cabinet_time", now.isoformat())
    _set_setting(db, "codinh_last_import_cabinet_time_vn", vn_time_str)
    _set_setting(db, "codinh_last_import_cabinet_filename", filename)

    rate = round((completed_cabinets / len(records_to_insert) * 100), 1) if records_to_insert else 0.0
    clear_codinh_stats_cache()

    return {
        "filename": filename,
        "total_cabinets": len(records_to_insert),
        "unique_wos": len(unique_wos),
        "completed_cabinets": completed_cabinets,
        "pending_cabinets": pending_cabinets,
        "completion_rate": rate,
        "imported_at_vn": vn_time_str,
    }


_codinh_seeded = False


def seed_default_codinh_if_needed(db: Session):
    """Seed default Cố Định Băng Rộng category and demo cabinets if database is empty."""
    global _codinh_seeded
    if _codinh_seeded:
        return
    try:
        cnt = db.query(ReportCategory).filter(ReportCategory.domain == "codinh").count()
        default_cat = None
        if cnt == 0:
            default_cat = ReportCategory(
                name="Bảo Dưỡng Tủ Hộp Cáp (THC)",
                loai_cong_viec="ICMS_Bảo dưỡng THC",
                description="Báo cáo tiến độ bảo dưỡng tủ hộp cáp CĐBR chi tiết theo WO và theo từng tủ cáp con",
                icon="Cable",
                sort_order=1,
                is_default=True,
                exclude_closed_prior_months=True,
                filter_mode="by_loai",
                filter_values=json.dumps(["ICMS_Bảo dưỡng THC"], ensure_ascii=False),
                domain="codinh",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(default_cat)
            db.commit()
            db.refresh(default_cat)

        # Also seed "ĐH Port Kém" category if not present
        port_cat = db.query(ReportCategory).filter(
            ReportCategory.domain == "codinh",
            or_(
                ReportCategory.name.ilike("%port kém%"),
                ReportCategory.name.ilike("%port kem%"),
                ReportCategory.loai_cong_viec == "Chủ động xử lý port kém"
            )
        ).first()
        if not port_cat:
            port_cat = ReportCategory(
                name="ĐH Port Kém",
                loai_cong_viec="Chủ động xử lý port kém",
                description="Báo cáo theo dõi điều hành xử lý port kém GPON và Home wifi thu kém",
                icon="Zap",
                sort_order=2,
                is_default=False,
                exclude_closed_prior_months=False,
                filter_mode="by_loai",
                filter_values=json.dumps(["Chủ động xử lý port kém"], ensure_ascii=False),
                domain="codinh",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(port_cat)
            db.commit()

        # Check cabinets count
        cab_cnt = db.query(Cabinet).count()
        if cab_cnt == 0:
            demo_file = Path(__file__).resolve().parent.parent.parent / "demo_tu_theo_ma_wo_demo.xlsx"
            if demo_file.exists():
                try:
                    import_cabinets_from_excel(
                        db=db,
                        file_path=demo_file,
                        filename="demo_tu_theo_ma_wo_demo.xlsx",
                        category_id=default_cat.id if default_cat else None
                    )
                except Exception as e:
                    print(f"Notice: Failed to auto-seed demo cabinets: {e}")

        _codinh_seeded = True
    except Exception:
        pass


_codinh_stats_cache: Dict[str, Dict[str, Any]] = {}
_codinh_stats_cache_time: Dict[str, float] = {}
_cache_key_locks: Dict[str, threading.Lock] = {}
_cache_lock_guard = threading.Lock()
CACHE_TTL_SECONDS = 600.0  # 10 minutes TTL


def _get_cache_lock(cache_key: str) -> threading.Lock:
    with _cache_lock_guard:
        if cache_key not in _cache_key_locks:
            _cache_key_locks[cache_key] = threading.Lock()
        return _cache_key_locks[cache_key]


def clear_codinh_stats_cache():
    """Clear cached report statistics for CĐBR."""
    global _codinh_stats_cache, _codinh_stats_cache_time, _cache_key_locks
    with _cache_lock_guard:
        _codinh_stats_cache.clear()
        _codinh_stats_cache_time.clear()
        _cache_key_locks.clear()


def _apply_task_filters(
    q,
    model,
    mode: str,
    values: List[str],
    target_month: Optional[str],
    cat: Optional[ReportCategory],
    db: Session,
):
    """
    Common filter helper for CĐBR stats and drilldown.
    Filters by task values/mode, month range, and exclusion of closed prior months.
    """
    if values:
        if mode == "by_system":
            if model is TaskCodinh:
                q = q.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
            else:
                upper_values = [v.upper().strip() for v in values]
                sys_ids = db.query(SystemModel.id).filter(
                    func.upper(func.trim(SystemModel.name)).in_(upper_values)
                ).scalar_subquery()
                q = q.filter(Task.system_id.in_(sys_ids))
        else:
            q = q.filter(model.loai_cong_viec.in_(values))

    is_all = target_month and target_month.strip().lower() == "all"
    if is_all:
        return q

    # Determine effective month (e.g. '2026-10')
    active_m = (target_month.strip() if target_month and target_month.strip() else None) or get_current_month_setting(db)
    if not active_m or active_m.strip().lower() == "all":
        return q

    try:
        y_str, m_str = active_m.strip().split("-")
        month_start = datetime(int(y_str), int(m_str), 1, 0, 0, 0)
    except Exception:
        return q

    exclude_closed = cat.exclude_closed_prior_months if (cat and hasattr(cat, 'exclude_closed_prior_months') and cat.exclude_closed_prior_months is not None) else True

    if exclude_closed:
        start_date = func.coalesce(model.thoi_diem_bat_dau_thuc_hien, model.thoi_diem_tao, model.thoi_diem_yeu_cau_ket_thuc)
        q = q.filter(
            or_(
                start_date == None,
                start_date >= month_start,
                ~model.trang_thai.in_(CLOSED_STATUSES)
            )
        )

    return q


def _compute_codinh_stats(
    db: Session,
    cat: Optional[ReportCategory],
    category_id: Optional[int],
    target_month: Optional[str],
    cache_key: str,
    cat_id_key: str,
    m_key: str,
) -> Dict[str, Any]:
    t_start_stats = time.perf_counter()
    now = datetime.utcnow()
    active_month = target_month or get_current_month_setting(db)
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    yesterday_start = today_start - timedelta(days=1)
    week_start = today_start - timedelta(days=7)

    # Check if category is Port Kém
    cat_name_low = (cat.name or "").lower() if cat else ""
    cat_loai_low = (cat.loai_cong_viec or "").lower() if cat else ""
    is_port_kem = ("port" in cat_name_low or "port" in cat_loai_low or "chủ động" in cat_loai_low or "chu dong" in cat_loai_low)

    mode = (cat.filter_mode or "by_loai").strip() if cat else "by_loai"
    values = _parse_filter_values(cat.filter_values) if cat else []
    if not values and cat and cat.loai_cong_viec and not cat.loai_cong_viec.startswith("["):
        values = [cat.loai_cong_viec]

    raw_items = []
    has_dedicated_tasks = db.query(TaskCodinh.ma_cong_viec).first() is not None
    model_cls = TaskCodinh if has_dedicated_tasks else Task

    # Available months list computed via distinct SQL query on thời gian bắt đầu (thoi_diem_bat_dau_thuc_hien)
    start_expr = model_cls.thoi_diem_bat_dau_thuc_hien
    if is_sqlite:
        month_expr = func.strftime('%Y-%m', start_expr)
    else:
        month_expr = func.date_format(start_expr, '%Y-%m')

    q_months = db.query(distinct(month_expr))\
        .filter(start_expr.isnot(None))
    if values:
        if mode == "by_system":
            if has_dedicated_tasks:
                q_months = q_months.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
            else:
                upper_values = [v.upper().strip() for v in values]
                sys_ids = db.query(SystemModel.id).filter(
                    func.upper(func.trim(SystemModel.name)).in_(upper_values)
                ).scalar_subquery()
                q_months = q_months.filter(Task.system_id.in_(sys_ids))
        else:
            q_months = q_months.filter(model_cls.loai_cong_viec.in_(values))

    available_months = [r[0] for r in q_months.order_by(desc(month_expr)).all() if r[0]]
    if not available_months:
        available_months = [now.strftime("%Y-%m")]

    t_wo_start = time.perf_counter()
    if has_dedicated_tasks:
        q = db.query(
            TaskCodinh.ma_cong_viec,
            TaskCodinh.ma_tram,
            TaskCodinh.loai_cong_viec,
            TaskCodinh.noi_dung_cong_viec if is_port_kem else TaskCodinh.ma_cong_viec.label("noi_dung_dummy"),
            TaskCodinh.trang_thai,
            TaskCodinh.nhan_vien,
            TaskCodinh.nhom,
            TaskCodinh.thoi_diem_tao,
            TaskCodinh.thoi_diem_bat_dau_thuc_hien,
            TaskCodinh.thoi_diem_yeu_cau_ket_thuc,
            TaskCodinh.thoi_gian_con_lai,
            TaskCodinh.thoi_diem_ft_hoan_thanh,
            TaskCodinh.thoi_diem_cd_dong,
        )
        q = _apply_task_filters(q, TaskCodinh, mode, values, target_month, cat, db)
        codinh_tuples = q.all()
        for t in codinh_tuples:
            raw_items.append({
                "ma_cong_viec": t[0],
                "station_code": t[1] or "",
                "loai_cong_viec": t[2] or "",
                "noi_dung_cong_viec": t[3] if is_port_kem else "",
                "trang_thai": t[4] or "Chưa rõ",
                "employee_name": t[5] or "Chưa gán",
                "group_name": t[6] or "Chưa phân nhóm",
                "thoi_diem_tao": t[7],
                "thoi_diem_bat_dau_thuc_hien": t[8],
                "thoi_diem_yeu_cau_ket_thuc": t[9],
                "thoi_gian_con_lai": t[10],
                "thoi_diem_ft_hoan_thanh": t[11],
                "thoi_diem_cd_dong": t[12],
            })
    else:
        # Fallback to Task table with fast tuple query (no full ORM instantiation)
        tasks_query = db.query(
            Task.ma_cong_viec,
            Station.code.label("station_code"),
            Task.loai_cong_viec,
            Task.noi_dung_cong_viec if is_port_kem else Task.ma_cong_viec.label("noi_dung_dummy"),
            Task.trang_thai,
            Employee.name.label("employee_name"),
            Group.name.label("group_name"),
            Task.thoi_diem_tao,
            Task.thoi_diem_bat_dau_thuc_hien,
            Task.thoi_diem_yeu_cau_ket_thuc,
            Task.thoi_gian_con_lai,
            Task.thoi_diem_ft_hoan_thanh,
            Task.thoi_diem_cd_dong,
        ).outerjoin(Station, Task.station_id == Station.id)\
         .outerjoin(Employee, Task.assigned_to_id == Employee.id)\
         .outerjoin(Group, Task.group_id == Group.id)

        tasks_query = _apply_task_filters(tasks_query, Task, mode, values, target_month, cat, db)
        task_tuples = tasks_query.all()
        for t in task_tuples:
            raw_items.append({
                "ma_cong_viec": t[0],
                "station_code": t[1] or "",
                "loai_cong_viec": t[2] or "",
                "noi_dung_cong_viec": t[3] if is_port_kem else "",
                "trang_thai": t[4] or "Chưa rõ",
                "employee_name": t[5] or "Chưa gán",
                "group_name": t[6] or "Chưa phân nhóm",
                "thoi_diem_tao": t[7],
                "thoi_diem_bat_dau_thuc_hien": t[8],
                "thoi_diem_yeu_cau_ket_thuc": t[9],
                "thoi_gian_con_lai": t[10],
                "thoi_diem_ft_hoan_thanh": t[11],
                "thoi_diem_cd_dong": t[12],
            })
    t_wo = time.perf_counter() - t_wo_start

    task_keys = [item["ma_cong_viec"] for item in raw_items]
    task_keys_set = set(task_keys)

    # Cabinets only for non-Port Kém categories
    wo_cab_stats = {}  # ma_wo -> [total, raw_completed]
    has_cabinets = False
    t_cab_start = time.perf_counter()
    cab_query_rows = 0
    if not is_port_kem:
        cab_query = db.query(
            Cabinet.ma_wo,
            Cabinet.trang_thai_thc,
            func.count(Cabinet.id)
        )
        if cat and cat.id:
            cab_rows = cab_query.filter(Cabinet.category_id == cat.id).group_by(Cabinet.ma_wo, Cabinet.trang_thai_thc).all()
            if not cab_rows:
                cab_rows = cab_query.group_by(Cabinet.ma_wo, Cabinet.trang_thai_thc).all()
        else:
            cab_rows = cab_query.group_by(Cabinet.ma_wo, Cabinet.trang_thai_thc).all()

        cab_query_rows = len(cab_rows)
        for c_wo, c_status, c_cnt in cab_rows:
            if not c_wo or c_wo not in task_keys_set:
                continue
            if c_wo not in wo_cab_stats:
                wo_cab_stats[c_wo] = [0, 0]
            wo_cab_stats[c_wo][0] += c_cnt
            st_low = (c_status or "").lower()
            if "hoàn thành" in st_low and "đang" not in st_low:
                wo_cab_stats[c_wo][1] += c_cnt

        has_cabinets = len(wo_cab_stats) > 0
    t_cab = time.perf_counter() - t_cab_start

    # 4. Compute metrics per employee and per group
    t_loop_start = time.perf_counter()
    emp_map = defaultdict(lambda: {
        "key_name": "Chưa gán",
        "group_name": "Chưa phân nhóm",
        "total_wos": 0,
        "closed_wos": 0,
        "pending_wos": 0,
        "overdue_wos": 0,
        "closed_today": 0,
        "closed_yesterday": 0,
        "closed_week": 0,
        "home_kem_count": 0,
        "port_kem_count": 0,
        "pending_under_24h": 0,
        "pending_under_72h": 0,
        "closed_within_24h": 0,
        "closed_within_72h": 0,
        "total_cabinets": 0,
        "completed_cabinets": 0,
        "pending_cabinets": 0,
        "overdue_cabinets": 0,
    })

    grp_map = defaultdict(lambda: {
        "key_name": "Chưa phân nhóm",
        "total_wos": 0,
        "closed_wos": 0,
        "pending_wos": 0,
        "overdue_wos": 0,
        "closed_today": 0,
        "closed_yesterday": 0,
        "closed_week": 0,
        "home_kem_count": 0,
        "port_kem_count": 0,
        "pending_under_24h": 0,
        "pending_under_72h": 0,
        "closed_within_24h": 0,
        "closed_within_72h": 0,
        "total_cabinets": 0,
        "completed_cabinets": 0,
        "pending_cabinets": 0,
        "overdue_cabinets": 0,
    })

    total_wos = len(raw_items)
    closed_wos = 0
    pending_wos = 0
    overdue_wos = 0
    closed_today_wos = 0
    closed_yesterday_wos = 0
    closed_week_wos = 0
    total_home_kem = 0
    total_port_kem = 0
    total_pend_24h = 0
    total_pend_72h = 0
    total_comp_24h = 0
    total_comp_72h = 0

    for item in raw_items:
        emp_name = item["employee_name"]
        grp_name = item["group_name"]
        is_closed = item["trang_thai"] in CLOSED_STATUSES
        is_pending = not is_closed
        is_overdue = is_pending and (
            (item["thoi_gian_con_lai"] is not None and item["thoi_gian_con_lai"] < 0) or
            (item["thoi_diem_yeu_cau_ket_thuc"] and item["thoi_diem_yeu_cau_ket_thuc"] < now)
        )

        if is_port_kem:
            nd = (item["noi_dung_cong_viec"] or "").lower()
            is_port = ("port kém gpon" in nd or "port kem gpon" in nd or "port kém" in nd or "port kem" in nd or "gpon" in nd)
            is_home = ("home wifi thu kém" in nd or "home wifi thu kem" in nd or "home wifi" in nd or "thu kém" in nd or "thu kem" in nd)
        else:
            is_port = False
            is_home = False

        start_time = item.get("thoi_diem_bat_dau_thuc_hien") or item.get("thoi_diem_tao")

        # Pending age (calculated from start_time)
        age_hours = (now - start_time).total_seconds() / 3600.0 if (is_pending and start_time) else None
        is_pend_24h = (age_hours is not None and age_hours <= 24.0)
        is_pend_72h = (age_hours is not None and age_hours <= 72.0)

        # Closed completion duration (calculated from start_time)
        finish_time = item["thoi_diem_ft_hoan_thanh"] or item["thoi_diem_cd_dong"]
        dur_hours = (finish_time - start_time).total_seconds() / 3600.0 if (is_closed and finish_time and start_time) else None
        is_comp_24h = (dur_hours is not None and 0 <= dur_hours <= 24.0)
        is_comp_72h = (dur_hours is not None and 0 <= dur_hours <= 72.0)

        emp_entry = emp_map[emp_name]
        emp_entry["key_name"] = emp_name
        emp_entry["group_name"] = grp_name
        emp_entry["total_wos"] += 1

        grp_entry = grp_map[grp_name]
        grp_entry["key_name"] = grp_name
        grp_entry["total_wos"] += 1

        if is_closed:
            closed_wos += 1
            emp_entry["closed_wos"] += 1
            grp_entry["closed_wos"] += 1
            if finish_time and finish_time >= today_start:
                closed_today_wos += 1
                emp_entry["closed_today"] += 1
                grp_entry["closed_today"] += 1
            elif finish_time and yesterday_start <= finish_time < today_start:
                closed_yesterday_wos += 1
                emp_entry["closed_yesterday"] += 1
                grp_entry["closed_yesterday"] += 1
            if finish_time and finish_time >= week_start:
                closed_week_wos += 1
                emp_entry["closed_week"] += 1
                grp_entry["closed_week"] += 1
        else:
            pending_wos += 1
            emp_entry["pending_wos"] += 1
            grp_entry["pending_wos"] += 1

            # Tồn = Home kém + Port kém (Strictly pending WOs categorized into Home vs Port)
            if is_home:
                total_home_kem += 1
                emp_entry["home_kem_count"] += 1
                grp_entry["home_kem_count"] += 1
            elif is_port:
                total_port_kem += 1
                emp_entry["port_kem_count"] += 1
                grp_entry["port_kem_count"] += 1
            else:
                total_port_kem += 1
                emp_entry["port_kem_count"] += 1
                grp_entry["port_kem_count"] += 1

        if is_overdue:
            overdue_wos += 1
            emp_entry["overdue_wos"] += 1
            grp_entry["overdue_wos"] += 1

        if is_pend_24h:
            total_pend_24h += 1
            emp_entry["pending_under_24h"] += 1
            grp_entry["pending_under_24h"] += 1
        if is_pend_72h:
            total_pend_72h += 1
            emp_entry["pending_under_72h"] += 1
            grp_entry["pending_under_72h"] += 1

        if is_comp_24h:
            total_comp_24h += 1
            emp_entry["closed_within_24h"] += 1
            grp_entry["closed_within_24h"] += 1
        if is_comp_72h:
            total_comp_72h += 1
            emp_entry["closed_within_72h"] += 1
            grp_entry["closed_within_72h"] += 1

        if not is_port_kem:
            cab_stat = wo_cab_stats.get(item["ma_cong_viec"])
            if cab_stat:
                t_cabs, raw_comp = cab_stat
                if is_closed:
                    comp_cabs = t_cabs
                    pend_cabs = 0
                    overdue_cabs = 0
                else:
                    comp_cabs = raw_comp
                    pend_cabs = t_cabs - comp_cabs
                    overdue_cabs = pend_cabs if is_overdue else 0
            else:
                t_cabs = 0
                comp_cabs = 0
                pend_cabs = 0
                overdue_cabs = 0

            emp_entry["total_cabinets"] += t_cabs
            emp_entry["completed_cabinets"] += comp_cabs
            emp_entry["pending_cabinets"] += pend_cabs
            emp_entry["overdue_cabinets"] += overdue_cabs
            grp_entry["total_cabinets"] += t_cabs
            grp_entry["completed_cabinets"] += comp_cabs
            grp_entry["pending_cabinets"] += pend_cabs
            grp_entry["overdue_cabinets"] += overdue_cabs

    t_loop = time.perf_counter() - t_loop_start
    t_build_start = time.perf_counter()

    total_cabinets = sum(e["total_cabinets"] for e in emp_map.values()) if not is_port_kem else 0
    completed_cabinets = sum(e["completed_cabinets"] for e in emp_map.values()) if not is_port_kem else 0
    pending_cabinets = total_cabinets - completed_cabinets
    total_overdue_cabinets = sum(e["overdue_cabinets"] for e in emp_map.values()) if not is_port_kem else 0
    cabinet_rate = round((completed_cabinets / total_cabinets * 100), 1) if total_cabinets > 0 else 0.0
    wo_rate = round((closed_wos / total_wos * 100), 1) if total_wos > 0 else 0.0

    by_employee = []
    for k, v in emp_map.items():
        c_rate = round((v["completed_cabinets"] / v["total_cabinets"] * 100), 1) if v["total_cabinets"] > 0 else 0.0
        w_rate = round((v["closed_wos"] / v["total_wos"] * 100), 1) if v["total_wos"] > 0 else 0.0
        kpi_24 = round((v["closed_within_24h"] / v["closed_wos"] * 100), 1) if v["closed_wos"] > 0 else 0.0
        kpi_72 = round((v["closed_within_72h"] / v["closed_wos"] * 100), 1) if v["closed_wos"] > 0 else 0.0
        by_employee.append({
            **v,
            "full_name": get_user_full_name(k) if k != "Chưa gán" else k,
            "cabinet_rate": c_rate,
            "wo_rate": w_rate,
            "kpi_24h_rate": kpi_24,
            "kpi_72h_rate": kpi_72,
            "is_other": k == "Chưa gán",
        })
    by_employee.sort(key=lambda x: (x["is_other"], -x["total_cabinets"] if has_cabinets else -x["total_wos"]))

    by_group = []
    for k, v in grp_map.items():
        c_rate = round((v["completed_cabinets"] / v["total_cabinets"] * 100), 1) if v["total_cabinets"] > 0 else 0.0
        w_rate = round((v["closed_wos"] / v["total_wos"] * 100), 1) if v["total_wos"] > 0 else 0.0
        kpi_24 = round((v["closed_within_24h"] / v["closed_wos"] * 100), 1) if v["closed_wos"] > 0 else 0.0
        kpi_72 = round((v["closed_within_72h"] / v["closed_wos"] * 100), 1) if v["closed_wos"] > 0 else 0.0
        by_group.append({
            **v,
            "cabinet_rate": c_rate,
            "wo_rate": w_rate,
            "kpi_24h_rate": kpi_24,
            "kpi_72h_rate": kpi_72,
            "is_other": k == "Chưa phân nhóm",
        })
    by_group.sort(key=lambda x: (x["is_other"], -x["total_cabinets"] if has_cabinets else -x["total_wos"]))

    # 5. Determine data freshness timestamp formatted in GMT+7
    last_update_vn = _get_setting(db, "codinh_last_import_wo_time_vn")
    if not last_update_vn:
        last_update_vn = _get_setting(db, "codinh_last_import_cabinet_time_vn")
    if not last_update_vn:
        latest_log = db.query(ImportLog).filter(ImportLog.domain == "codinh").order_by(ImportLog.imported_at.desc()).first()
        if latest_log and latest_log.imported_at:
            vn_dt = latest_log.imported_at + timedelta(hours=7)
            last_update_vn = vn_dt.strftime("%d/%m/%Y lúc %H:%M")
        else:
            vn_dt = datetime.utcnow() + timedelta(hours=7)
            last_update_vn = vn_dt.strftime("%d/%m/%Y lúc %H:%M")

    t_build = time.perf_counter() - t_build_start

    res = {
        "active_category": {
            "id": cat.id if cat else None,
            "name": cat.name if cat else "Báo Cáo Cố Định Băng Rộng",
            "loai_cong_viec": cat.loai_cong_viec if cat else "",
            "filter_mode": cat.filter_mode if cat else "by_loai",
            "filter_values": _parse_filter_values(cat.filter_values) if cat else [],
            "description": cat.description if cat else None,
            "has_cabinets": has_cabinets,
            "is_port_kem": is_port_kem,
            "exclude_closed_prior_months": cat.exclude_closed_prior_months if cat else True,
        },
        "active_month": active_month,
        "target_month": target_month or active_month,
        "available_months": available_months,
        "summary": {
            "total_wos": total_wos,
            "closed_wos": closed_wos,
            "pending_wos": pending_wos,
            "overdue_wos": overdue_wos,
            "closed_today_wos": closed_today_wos,
            "closed_yesterday_wos": closed_yesterday_wos,
            "closed_week_wos": closed_week_wos,
            "wo_rate": wo_rate,
            "home_kem_count": total_home_kem,
            "port_kem_count": total_port_kem,
            "pending_under_24h": total_pend_24h,
            "pending_under_72h": total_pend_72h,
            "closed_within_24h": total_comp_24h,
            "closed_within_72h": total_comp_72h,
            "kpi_24h_rate": round((total_comp_24h / closed_wos * 100), 1) if closed_wos > 0 else 0.0,
            "kpi_72h_rate": round((total_comp_72h / closed_wos * 100), 1) if closed_wos > 0 else 0.0,
            "total_cabinets": total_cabinets,
            "completed_cabinets": completed_cabinets,
            "pending_cabinets": pending_cabinets,
            "overdue_cabinets": total_overdue_cabinets,
            "cabinet_rate": cabinet_rate,
            "has_cabinets": has_cabinets,
            "is_port_kem": is_port_kem,
        },
        "by_employee": by_employee,
        "by_group": by_group,
        "last_data_update_vn": last_update_vn,
        "has_dedicated_tasks": bool(has_dedicated_tasks),
    }

    t_total = time.perf_counter() - t_start_stats
    print(f"[get_codinh_stats] cat={cat_id_key} month={m_key}: WO query={t_wo*1000:.2f}ms ({len(raw_items)} rows), Cab query={t_cab*1000:.2f}ms ({cab_query_rows} rows), Loop={t_loop*1000:.2f}ms, Build={t_build*1000:.2f}ms, Total={t_total*1000:.2f}ms", flush=True)

    _codinh_stats_cache[cache_key] = res
    _codinh_stats_cache_time[cache_key] = time.time()
    return res


def get_codinh_stats(
    db: Session,
    category_id: Optional[int] = None,
    target_month: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get dual statistics (WO + Cabinets) for a specific Cố Định Băng Rộng category.
    Thread-safe cached by category + month + data versions with 10-minute TTL.
    """
    seed_default_codinh_if_needed(db)

    # 1. Fetch category
    query_cat = db.query(ReportCategory).filter(ReportCategory.domain == "codinh")
    if category_id:
        cat = query_cat.filter(ReportCategory.id == category_id).first()
    else:
        cat = query_cat.order_by(ReportCategory.is_default.desc(), ReportCategory.sort_order.asc()).first()
    if not cat:
        cat = db.query(ReportCategory).first()

    cat_id_key = str(cat.id if cat else (category_id or "default"))
    m_key = (target_month or "default_month").strip()
    cat_upd = cat.updated_at.isoformat() if (cat and hasattr(cat, "updated_at") and cat.updated_at) else ""

    settings_rows = db.query(SystemSetting.key, SystemSetting.value).filter(
        SystemSetting.key.in_(["codinh_last_import_wo_time", "codinh_last_import_cabinet_time"])
    ).all()
    s_map = dict(settings_rows)
    wo_ver = s_map.get("codinh_last_import_wo_time") or ""
    cab_ver = s_map.get("codinh_last_import_cabinet_time") or ""

    cache_key = f"{cat_id_key}_{m_key}_{wo_ver}_{cab_ver}_{cat_upd}"

    now_time = time.time()
    if cache_key in _codinh_stats_cache:
        if (now_time - _codinh_stats_cache_time.get(cache_key, 0)) < CACHE_TTL_SECONDS:
            return _codinh_stats_cache[cache_key]

    lock = _get_cache_lock(cache_key)
    with lock:
        now_time = time.time()
        if cache_key in _codinh_stats_cache:
            if (now_time - _codinh_stats_cache_time.get(cache_key, 0)) < CACHE_TTL_SECONDS:
                return _codinh_stats_cache[cache_key]

        return _compute_codinh_stats(
            db=db,
            cat=cat,
            category_id=category_id,
            target_month=target_month,
            cache_key=cache_key,
            cat_id_key=cat_id_key,
            m_key=m_key,
        )


def get_codinh_meta_options(db: Session) -> Dict[str, List[str]]:
    """Get distinct task types and systems available for creating CĐBR reports."""
    # Try codinh_tasks first
    has_dedicated = db.query(TaskCodinh).count() > 0
    if has_dedicated:
        types = [
            r[0] for r in db.query(distinct(TaskCodinh.loai_cong_viec))
            .filter(TaskCodinh.loai_cong_viec.isnot(None), TaskCodinh.loai_cong_viec != "")
            .order_by(TaskCodinh.loai_cong_viec.asc()).all()
        ]
        systems = [
            r[0] for r in db.query(distinct(TaskCodinh.he_thong))
            .filter(TaskCodinh.he_thong.isnot(None), TaskCodinh.he_thong != "")
            .order_by(TaskCodinh.he_thong.asc()).all()
        ]
        return {"task_types": types, "systems": systems}

    # Fallback to general Task / SystemModel
    types = [
        r[0] for r in db.query(distinct(Task.loai_cong_viec))
        .filter(Task.loai_cong_viec.isnot(None), Task.loai_cong_viec != "")
        .order_by(Task.loai_cong_viec.asc()).all()
    ]
    systems = [
        r[0] for r in db.query(SystemModel.name)
        .filter(SystemModel.name.isnot(None), SystemModel.name != "")
        .order_by(SystemModel.name.asc()).all()
    ]
    return {"task_types": types, "systems": systems}


def _sql_duration_hours(start_col, finish_col):
    """Compute duration in hours between two datetime columns in SQL."""
    if is_sqlite:
        return (func.julianday(finish_col) - func.julianday(start_col)) * 24.0
    else:
        return func.timestampdiff(text("SECOND"), start_col, finish_col) / 3600.0


def get_codinh_drilldown_tasks(
    db: Session,
    category_id: Optional[int] = None,
    target_month: Optional[str] = None,
    metric: str = "total",
    filter_type: Optional[str] = None,
    target_name: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    """
    Get drilldown tasks for CĐBR matching the exact metric and row (employee or group) clicked.
    Enriched with child cabinets (THC) and notes.
    """
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    yesterday_start = today_start - timedelta(days=1)

    # 1. Fetch category
    query_cat = db.query(ReportCategory).filter(ReportCategory.domain == "codinh")
    if category_id:
        cat = query_cat.filter(ReportCategory.id == category_id).first()
    else:
        cat = query_cat.order_by(ReportCategory.is_default.desc(), ReportCategory.sort_order.asc()).first()
    if not cat:
        cat = db.query(ReportCategory).first()

    mode = (cat.filter_mode or "by_loai").strip() if cat else "by_loai"
    values = _parse_filter_values(cat.filter_values) if cat else []
    if not values and cat and cat.loai_cong_viec and not cat.loai_cong_viec.startswith("["):
        values = [cat.loai_cong_viec]

    # Check if dedicated codinh_tasks table has data for this category
    q_check = db.query(TaskCodinh.ma_cong_viec)
    if values:
        if mode == "by_system":
            q_check = q_check.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
        else:
            q_check = q_check.filter(TaskCodinh.loai_cong_viec.in_(values))
    has_dedicated_tasks = q_check.first() is not None

    if has_dedicated_tasks:
        q = db.query(
            TaskCodinh.ma_cong_viec,
            TaskCodinh.loai_cong_viec,
            TaskCodinh.noi_dung_cong_viec,
            TaskCodinh.ghi_chu,
            TaskCodinh.trang_thai,
            TaskCodinh.nhan_vien,
            TaskCodinh.nhom,
            TaskCodinh.ma_tram,
            TaskCodinh.thoi_diem_tao,
            TaskCodinh.thoi_diem_bat_dau_thuc_hien,
            TaskCodinh.thoi_diem_yeu_cau_ket_thuc,
            TaskCodinh.thoi_gian_con_lai,
            TaskCodinh.thoi_diem_ft_hoan_thanh,
            TaskCodinh.thoi_diem_cd_dong,
        )
        q = _apply_task_filters(q, TaskCodinh, mode, values, target_month, cat, db)

        # Target filter (Employee or Group)
        if filter_type == "employee" and target_name:
            if target_name in ("Chưa gán", "Khác", "*"):
                q = q.filter(or_(TaskCodinh.nhan_vien == None, TaskCodinh.nhan_vien == "", TaskCodinh.nhan_vien == "Chưa gán"))
            else:
                matched_users = get_usernames_by_name(target_name)
                q = q.filter(or_(
                    TaskCodinh.nhan_vien == target_name,
                    func.lower(TaskCodinh.nhan_vien).in_([u.lower() for u in matched_users])
                ))
        elif filter_type == "group" and target_name:
            if target_name in ("Chưa phân nhóm", "Khác", "*"):
                q = q.filter(or_(TaskCodinh.nhom == None, TaskCodinh.nhom == "", TaskCodinh.nhom == "Chưa phân nhóm"))
            else:
                q = q.filter(TaskCodinh.nhom == target_name)

        # Metric filter
        m_low = (metric or "total").lower()
        if m_low in ("closed", "da_dong", "dong"):
            q = q.filter(TaskCodinh.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("pending", "ton", "ton_viec"):
            q = q.filter(~TaskCodinh.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("overdue", "qua_han", "tre_han"):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    TaskCodinh.thoi_gian_con_lai < 0,
                    and_(TaskCodinh.thoi_diem_yeu_cau_ket_thuc.isnot(None), TaskCodinh.thoi_diem_yeu_cau_ket_thuc < now)
                )
            )
        elif m_low in ("closed_today", "dong_hom_nay"):
            q = q.filter(
                TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= today_start
            )
        elif m_low in ("closed_yesterday", "dong_hom_qua"):
            q = q.filter(
                TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= yesterday_start,
                func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) < today_start
            )
        elif m_low in ("cabinet_total", "total_cabinets", "tu_thc"):
            cab_wos = db.query(Cabinet.ma_wo).distinct().scalar_subquery()
            q = q.filter(TaskCodinh.ma_cong_viec.in_(cab_wos))
        elif m_low in ("cabinet_completed", "completed_cabinets", "tu_xong"):
            comp_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    Cabinet.trang_thai_thc.like("%hoàn thành%"),
                    Cabinet.trang_thai_thc.like("%Hoàn thành%"),
                    Cabinet.trang_thai_thc.like("%Hoàn Thành%")
                ),
                ~Cabinet.trang_thai_thc.like("%Đang%"),
                ~Cabinet.trang_thai_thc.like("%đang%")
            ).distinct().scalar_subquery()
            all_cab_wos = db.query(Cabinet.ma_wo).distinct().scalar_subquery()
            q = q.filter(
                or_(
                    TaskCodinh.ma_cong_viec.in_(comp_wos),
                    and_(
                        TaskCodinh.ma_cong_viec.in_(all_cab_wos),
                        TaskCodinh.trang_thai.in_(CLOSED_STATUSES)
                    )
                )
            )
        elif m_low in ("cabinet_pending", "pending_cabinets", "tu_ton"):
            pend_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    Cabinet.trang_thai_thc.like("%Đang%"),
                    Cabinet.trang_thai_thc.like("%đang%"),
                    and_(
                        ~Cabinet.trang_thai_thc.like("%hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn Thành%")
                    )
                )
            ).distinct().scalar_subquery()
            q = q.filter(
                TaskCodinh.ma_cong_viec.in_(pend_wos),
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES)
            )
        elif m_low in ("cabinet_overdue", "overdue_cabinets", "tu_qua_han"):
            pend_cabs_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    Cabinet.trang_thai_thc.like("%Đang%"),
                    Cabinet.trang_thai_thc.like("%đang%"),
                    and_(
                        ~Cabinet.trang_thai_thc.like("%hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn Thành%")
                    )
                )
            ).distinct().scalar_subquery()
            q = q.filter(
                TaskCodinh.ma_cong_viec.in_(pend_cabs_wos),
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    TaskCodinh.thoi_gian_con_lai < 0,
                    and_(TaskCodinh.thoi_diem_yeu_cau_ket_thuc.isnot(None), TaskCodinh.thoi_diem_yeu_cau_ket_thuc < now)
                )
            )
        elif m_low in ("closed_week", "closed_this_week", "dong_tuan_qua", "tuan_qua"):
            week_start = today_start - timedelta(days=7)
            q = q.filter(
                TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= week_start
            )
        elif m_low in ("home_kem", "home_wifi_kem"):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    TaskCodinh.noi_dung_cong_viec.ilike("%home wifi thu kém%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%home wifi thu kem%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%home wifi%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%thu kém%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%thu kem%"),
                )
            )
        elif m_low in ("port_kem", "port_kem_gpon"):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                ~or_(
                    TaskCodinh.noi_dung_cong_viec.ilike("%home wifi thu kém%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%home wifi thu kem%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%home wifi%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%thu kém%"),
                    TaskCodinh.noi_dung_cong_viec.ilike("%thu kem%"),
                )
            )
        elif m_low in ("pending_under_24h", "ton_duoi_24h"):
            past_24h = now - timedelta(hours=24)
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao) >= past_24h
            )
        elif m_low in ("pending_under_72h", "ton_duoi_72h"):
            past_72h = now - timedelta(hours=72)
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao) >= past_72h
            )
        elif m_low in ("kpi_24h", "closed_24h", "closed_within_24h", "kpi_1_ngay"):
            finish_time = func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong)
            start_time = func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao)
            dur = _sql_duration_hours(start_time, finish_time)
            q = q.filter(
                TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                finish_time.isnot(None),
                start_time.isnot(None),
                dur >= 0.0,
                dur <= 24.0
            )
        elif m_low in ("kpi_72h", "closed_72h", "closed_within_72h", "kpi_3_ngay"):
            finish_time = func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong)
            start_time = func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao)
            dur = _sql_duration_hours(start_time, finish_time)
            q = q.filter(
                TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                finish_time.isnot(None),
                start_time.isnot(None),
                dur >= 0.0,
                dur <= 72.0
            )

        # Search filter
        if search and search.strip():
            s_val = f"%{search.strip()}%"
            cab_search_wos = db.query(Cabinet.ma_wo).filter(Cabinet.ma_doi_tuong.ilike(s_val)).distinct().scalar_subquery()
            q = q.filter(
                or_(
                    TaskCodinh.ma_cong_viec.ilike(s_val),
                    TaskCodinh.ma_tram.ilike(s_val),
                    TaskCodinh.nhan_vien.ilike(s_val),
                    TaskCodinh.nhom.ilike(s_val),
                    TaskCodinh.noi_dung_cong_viec.ilike(s_val),
                    TaskCodinh.ghi_chu.ilike(s_val),
                    TaskCodinh.loai_cong_viec.ilike(s_val),
                    TaskCodinh.ma_cong_viec.in_(cab_search_wos)
                )
            )

        # Sorting
        sort_col = getattr(TaskCodinh, sort_by, None) if sort_by else TaskCodinh.thoi_diem_yeu_cau_ket_thuc
        if sort_col is not None:
            q = q.order_by(asc(sort_col) if sort_order == "asc" else desc(sort_col))
        else:
            q = q.order_by(desc(TaskCodinh.thoi_diem_yeu_cau_ket_thuc))

        total = q.count()
        offset = (page - 1) * page_size
        rows = q.offset(offset).limit(page_size).all()

        wo_keys = [r.ma_cong_viec for r in rows]

        # Fetch child cabinets
        cabs_map = defaultdict(list)
        if wo_keys:
            cabs = db.query(
                Cabinet.id,
                Cabinet.ma_wo,
                Cabinet.ma_doi_tuong,
                Cabinet.ma_tram,
                Cabinet.trang_thai_thc,
                Cabinet.trang_thai_wo
            ).filter(Cabinet.ma_wo.in_(wo_keys)).all()
            for c in cabs:
                is_comp = "hoàn thành" in (c[4] or "").lower() and "đang" not in (c[4] or "").lower()
                cabs_map[c[1]].append({
                    "id": c[0],
                    "ma_doi_tuong": c[2],
                    "ma_tram": c[3] or "",
                    "trang_thai_thc": c[4] or "Đang thực hiện bảo dưỡng",
                    "trang_thai_wo": c[5] or "",
                    "is_completed": is_comp,
                })

        # Fetch latest notes using subquery
        notes_map = {}
        if wo_keys:
            subq = db.query(
                TaskNote.ma_cong_viec,
                func.max(TaskNote.created_at).label("max_created_at")
            ).filter(TaskNote.ma_cong_viec.in_(wo_keys)).group_by(TaskNote.ma_cong_viec).subquery()

            latest_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content).join(
                subq,
                and_(
                    TaskNote.ma_cong_viec == subq.c.ma_cong_viec,
                    TaskNote.created_at == subq.c.max_created_at
                )
            ).all()
            for k, c in latest_notes:
                notes_map[k] = c

        items = []
        for r in rows:
            is_closed = r.trang_thai in CLOSED_STATUSES
            is_overdue = not is_closed and (
                (r.thoi_gian_con_lai is not None and r.thoi_gian_con_lai < 0) or
                (r.thoi_diem_yeu_cau_ket_thuc and r.thoi_diem_yeu_cau_ket_thuc < now)
            )
            wo_cabs = cabs_map.get(r.ma_cong_viec, [])
            if is_closed:
                comp_cabs = len(wo_cabs)
                pend_cabs = 0
                for c in wo_cabs:
                    c["is_completed"] = True
                    if "đang" in (c.get("trang_thai_thc") or "").lower():
                        c["trang_thai_thc"] = "Đã hoàn thành bảo dưỡng"
            else:
                comp_cabs = sum(1 for c in wo_cabs if c["is_completed"])
                pend_cabs = len(wo_cabs) - comp_cabs

            items.append({
                "ma_cong_viec": r.ma_cong_viec,
                "loai_cong_viec": r.loai_cong_viec or "",
                "noi_dung_cong_viec": r.noi_dung_cong_viec or "",
                "ghi_chu": r.ghi_chu or "",
                "trang_thai": r.trang_thai or "Chưa rõ",
                "employee_assigned_name": get_user_full_name(r.nhan_vien) if r.nhan_vien else "Chưa gán",
                "employee_username": r.nhan_vien or "",
                "group_name": r.nhom or "Chưa phân nhóm",
                "station_code": r.ma_tram or "",
                "thoi_diem_tao": r.thoi_diem_tao.isoformat() if r.thoi_diem_tao else None,
                "thoi_diem_bat_dau_thuc_hien": r.thoi_diem_bat_dau_thuc_hien.isoformat() if r.thoi_diem_bat_dau_thuc_hien else None,
                "thoi_diem_yeu_cau_ket_thuc": r.thoi_diem_yeu_cau_ket_thuc.isoformat() if r.thoi_diem_yeu_cau_ket_thuc else None,
                "thoi_gian_con_lai": r.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": r.thoi_diem_ft_hoan_thanh.isoformat() if r.thoi_diem_ft_hoan_thanh else None,
                "thoi_diem_cd_dong": r.thoi_diem_cd_dong.isoformat() if r.thoi_diem_cd_dong else None,
                "latest_note": notes_map.get(r.ma_cong_viec),
                "is_overdue": is_overdue,
                "total_cabinets": len(wo_cabs),
                "completed_cabinets": comp_cabs,
                "pending_cabinets": pend_cabs,
                "cabinets": wo_cabs,
            })

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "items": items,
        }

    else:
        # Fallback to main Task table
        q = db.query(
            Task.ma_cong_viec,
            Task.loai_cong_viec,
            Task.noi_dung_cong_viec,
            Task.ghi_chu,
            Task.trang_thai,
            Employee.name.label("nhan_vien"),
            Group.name.label("nhom"),
            Station.code.label("ma_tram"),
            Task.thoi_diem_tao,
            Task.thoi_diem_bat_dau_thuc_hien,
            Task.thoi_diem_yeu_cau_ket_thuc,
            Task.thoi_gian_con_lai,
            Task.thoi_diem_ft_hoan_thanh,
            Task.thoi_diem_cd_dong,
        ).outerjoin(Station, Task.station_id == Station.id)\
         .outerjoin(Employee, Task.assigned_to_id == Employee.id)\
         .outerjoin(Group, Task.group_id == Group.id)
        q = _apply_task_filters(q, Task, mode, values, target_month, cat, db)

        # Target filter (Employee or Group)
        if filter_type == "employee" and target_name:
            if target_name in ("Chưa gán", "Khác", "*"):
                q = q.filter(or_(Task.assigned_to_id == None, Employee.name == "Chưa gán"))
            else:
                q = q.filter(Employee.name == target_name)
        elif filter_type == "group" and target_name:
            if target_name in ("Chưa phân nhóm", "Khác", "*"):
                q = q.filter(or_(Task.group_id == None, Group.name == "Chưa phân nhóm"))
            else:
                q = q.filter(Group.name == target_name)

        # Metric filter
        m_low = (metric or "total").lower()
        if m_low in ("closed", "da_dong", "dong"):
            q = q.filter(Task.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("pending", "ton", "ton_viec"):
            q = q.filter(~Task.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("overdue", "qua_han", "tre_han"):
            q = q.filter(
                ~Task.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    Task.thoi_gian_con_lai < 0,
                    and_(Task.thoi_diem_yeu_cau_ket_thuc.isnot(None), Task.thoi_diem_yeu_cau_ket_thuc < now)
                )
            )
        elif m_low in ("closed_today", "dong_hom_nay"):
            q = q.filter(
                Task.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
            )
        elif m_low in ("closed_yesterday", "dong_hom_qua"):
            q = q.filter(
                Task.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= yesterday_start,
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) < today_start
            )
        elif m_low in ("cabinet_total", "total_cabinets", "tu_thc"):
            cab_wos = db.query(Cabinet.ma_wo).distinct().scalar_subquery()
            q = q.filter(Task.ma_cong_viec.in_(cab_wos))
        elif m_low in ("cabinet_completed", "completed_cabinets", "tu_xong"):
            comp_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    Cabinet.trang_thai_thc.like("%hoàn thành%"),
                    Cabinet.trang_thai_thc.like("%Hoàn thành%"),
                    Cabinet.trang_thai_thc.like("%Hoàn Thành%")
                ),
                ~Cabinet.trang_thai_thc.like("%Đang%"),
                ~Cabinet.trang_thai_thc.like("%đang%")
            ).distinct().scalar_subquery()
            all_cab_wos = db.query(Cabinet.ma_wo).distinct().scalar_subquery()
            q = q.filter(
                or_(
                    Task.ma_cong_viec.in_(comp_wos),
                    and_(
                        Task.ma_cong_viec.in_(all_cab_wos),
                        Task.trang_thai.in_(CLOSED_STATUSES)
                    )
                )
            )
        elif m_low in ("cabinet_pending", "pending_cabinets", "tu_ton"):
            pend_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    Cabinet.trang_thai_thc.like("%Đang%"),
                    Cabinet.trang_thai_thc.like("%đang%"),
                    and_(
                        ~Cabinet.trang_thai_thc.like("%hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn Thành%")
                    )
                )
            ).distinct().scalar_subquery()
            q = q.filter(
                Task.ma_cong_viec.in_(pend_wos),
                ~Task.trang_thai.in_(CLOSED_STATUSES)
            )
        elif m_low in ("cabinet_overdue", "overdue_cabinets", "tu_qua_han"):
            pend_cabs_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    Cabinet.trang_thai_thc.like("%Đang%"),
                    Cabinet.trang_thai_thc.like("%đang%"),
                    and_(
                        ~Cabinet.trang_thai_thc.like("%hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn thành%"),
                        ~Cabinet.trang_thai_thc.like("%Hoàn Thành%")
                    )
                )
            ).distinct().scalar_subquery()
            q = q.filter(
                Task.ma_cong_viec.in_(pend_cabs_wos),
                ~Task.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    Task.thoi_gian_con_lai < 0,
                    and_(Task.thoi_diem_yeu_cau_ket_thuc.isnot(None), Task.thoi_diem_yeu_cau_ket_thuc < now)
                )
            )
        elif m_low in ("closed_week", "closed_this_week", "dong_tuan_qua", "tuan_qua"):
            week_start = today_start - timedelta(days=7)
            q = q.filter(
                Task.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= week_start
            )
        elif m_low in ("home_kem", "home_wifi_kem"):
            q = q.filter(
                ~Task.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    Task.noi_dung_cong_viec.ilike("%home wifi thu kém%"),
                    Task.noi_dung_cong_viec.ilike("%home wifi thu kem%"),
                    Task.noi_dung_cong_viec.ilike("%home wifi%"),
                    Task.noi_dung_cong_viec.ilike("%thu kém%"),
                    Task.noi_dung_cong_viec.ilike("%thu kem%"),
                )
            )
        elif m_low in ("port_kem", "port_kem_gpon"):
            q = q.filter(
                ~Task.trang_thai.in_(CLOSED_STATUSES),
                ~or_(
                    Task.noi_dung_cong_viec.ilike("%home wifi thu kém%"),
                    Task.noi_dung_cong_viec.ilike("%home wifi thu kem%"),
                    Task.noi_dung_cong_viec.ilike("%home wifi%"),
                    Task.noi_dung_cong_viec.ilike("%thu kém%"),
                    Task.noi_dung_cong_viec.ilike("%thu kem%"),
                )
            )
        elif m_low in ("pending_under_24h", "ton_duoi_24h"):
            past_24h = now - timedelta(hours=24)
            q = q.filter(
                ~Task.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(Task.thoi_diem_bat_dau_thuc_hien, Task.thoi_diem_tao) >= past_24h
            )
        elif m_low in ("pending_under_72h", "ton_duoi_72h"):
            past_72h = now - timedelta(hours=72)
            q = q.filter(
                ~Task.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(Task.thoi_diem_bat_dau_thuc_hien, Task.thoi_diem_tao) >= past_72h
            )
        elif m_low in ("kpi_24h", "closed_24h", "closed_within_24h", "kpi_1_ngay"):
            finish_time = func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong)
            start_time = func.coalesce(Task.thoi_diem_bat_dau_thuc_hien, Task.thoi_diem_tao)
            dur = _sql_duration_hours(start_time, finish_time)
            q = q.filter(
                Task.trang_thai.in_(CLOSED_STATUSES),
                finish_time.isnot(None),
                start_time.isnot(None),
                dur >= 0.0,
                dur <= 24.0
            )
        elif m_low in ("kpi_72h", "closed_72h", "closed_within_72h", "kpi_3_ngay"):
            finish_time = func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong)
            start_time = func.coalesce(Task.thoi_diem_bat_dau_thuc_hien, Task.thoi_diem_tao)
            dur = _sql_duration_hours(start_time, finish_time)
            q = q.filter(
                Task.trang_thai.in_(CLOSED_STATUSES),
                finish_time.isnot(None),
                start_time.isnot(None),
                dur >= 0.0,
                dur <= 72.0
            )

        # Search filter
        if search and search.strip():
            s_val = f"%{search.strip()}%"
            cab_search_wos = db.query(Cabinet.ma_wo).filter(Cabinet.ma_doi_tuong.ilike(s_val)).distinct().scalar_subquery()
            q = q.filter(
                or_(
                    Task.ma_cong_viec.ilike(s_val),
                    Station.code.ilike(s_val),
                    Employee.name.ilike(s_val),
                    Group.name.ilike(s_val),
                    Task.noi_dung_cong_viec.ilike(s_val),
                    Task.ghi_chu.ilike(s_val),
                    Task.loai_cong_viec.ilike(s_val),
                    Task.ma_cong_viec.in_(cab_search_wos)
                )
            )

        # Sorting
        sort_col = getattr(Task, sort_by, None) if sort_by else Task.thoi_diem_yeu_cau_ket_thuc
        if sort_col is not None:
            q = q.order_by(asc(sort_col) if sort_order == "asc" else desc(sort_col))
        else:
            q = q.order_by(desc(Task.thoi_diem_yeu_cau_ket_thuc))

        total = q.count()
        offset = (page - 1) * page_size
        rows = q.offset(offset).limit(page_size).all()

        wo_keys = [r.ma_cong_viec for r in rows]

        # Fetch child cabinets
        cabs_map = defaultdict(list)
        if wo_keys:
            cabs = db.query(
                Cabinet.id,
                Cabinet.ma_wo,
                Cabinet.ma_doi_tuong,
                Cabinet.ma_tram,
                Cabinet.trang_thai_thc,
                Cabinet.trang_thai_wo
            ).filter(Cabinet.ma_wo.in_(wo_keys)).all()
            for c in cabs:
                is_comp = "hoàn thành" in (c[4] or "").lower() and "đang" not in (c[4] or "").lower()
                cabs_map[c[1]].append({
                    "id": c[0],
                    "ma_doi_tuong": c[2],
                    "ma_tram": c[3] or "",
                    "trang_thai_thc": c[4] or "Đang thực hiện bảo dưỡng",
                    "trang_thai_wo": c[5] or "",
                    "is_completed": is_comp,
                })

        # Fetch latest notes using subquery
        notes_map = {}
        if wo_keys:
            subq = db.query(
                TaskNote.ma_cong_viec,
                func.max(TaskNote.created_at).label("max_created_at")
            ).filter(TaskNote.ma_cong_viec.in_(wo_keys)).group_by(TaskNote.ma_cong_viec).subquery()

            latest_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content).join(
                subq,
                and_(
                    TaskNote.ma_cong_viec == subq.c.ma_cong_viec,
                    TaskNote.created_at == subq.c.max_created_at
                )
            ).all()
            for k, c in latest_notes:
                notes_map[k] = c

        items = []
        for r in rows:
            is_closed = r.trang_thai in CLOSED_STATUSES
            is_overdue = not is_closed and (
                (r.thoi_gian_con_lai is not None and r.thoi_gian_con_lai < 0) or
                (r.thoi_diem_yeu_cau_ket_thuc and r.thoi_diem_yeu_cau_ket_thuc < now)
            )
            wo_cabs = cabs_map.get(r.ma_cong_viec, [])
            if is_closed:
                comp_cabs = len(wo_cabs)
                pend_cabs = 0
                for c in wo_cabs:
                    c["is_completed"] = True
                    if "đang" in (c.get("trang_thai_thc") or "").lower():
                        c["trang_thai_thc"] = "Đã hoàn thành bảo dưỡng"
            else:
                comp_cabs = sum(1 for c in wo_cabs if c["is_completed"])
                pend_cabs = len(wo_cabs) - comp_cabs

            emp_name = r.nhan_vien or "Chưa gán"
            grp_name = r.nhom or "Chưa phân nhóm"
            st_code = r.ma_tram or ""
            items.append({
                "ma_cong_viec": r.ma_cong_viec,
                "loai_cong_viec": r.loai_cong_viec or "",
                "noi_dung_cong_viec": r.noi_dung_cong_viec or "",
                "ghi_chu": r.ghi_chu or "",
                "trang_thai": r.trang_thai or "Chưa rõ",
                "employee_assigned_name": get_user_full_name(emp_name) if emp_name else "Chưa gán",
                "employee_username": emp_name,
                "group_name": grp_name,
                "station_code": st_code,
                "thoi_diem_tao": r.thoi_diem_tao.isoformat() if r.thoi_diem_tao else None,
                "thoi_diem_bat_dau_thuc_hien": r.thoi_diem_bat_dau_thuc_hien.isoformat() if r.thoi_diem_bat_dau_thuc_hien else None,
                "thoi_diem_yeu_cau_ket_thuc": r.thoi_diem_yeu_cau_ket_thuc.isoformat() if r.thoi_diem_yeu_cau_ket_thuc else None,
                "thoi_gian_con_lai": r.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": r.thoi_diem_ft_hoan_thanh.isoformat() if r.thoi_diem_ft_hoan_thanh else None,
                "thoi_diem_cd_dong": r.thoi_diem_cd_dong.isoformat() if r.thoi_diem_cd_dong else None,
                "latest_note": notes_map.get(r.ma_cong_viec),
                "is_overdue": is_overdue,
                "total_cabinets": len(wo_cabs),
                "completed_cabinets": comp_cabs,
                "pending_cabinets": pend_cabs,
                "cabinets": wo_cabs,
            })

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "items": items,
        }


def get_codinh_import_logs(db: Session, limit: int = 50) -> List[ImportLog]:
    """Get list of past imports specifically for CĐBR."""
    return db.query(ImportLog).filter(ImportLog.domain == "codinh").order_by(desc(ImportLog.imported_at)).limit(limit).all()


def activate_codinh_import(db: Session, import_id: int) -> ImportLog:
    """Reload/activate a past CĐBR import file."""
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise ValueError("Không tìm thấy bản ghi import CĐBR")
    from backend.config import UPLOAD_DIR
    file_path = UPLOAD_DIR / log.stored_filename
    if not file_path.exists():
        raise ValueError("File vật lý không còn tồn tại trên máy chủ")
    clear_codinh_stats_cache()
    import_codinh_wos_from_excel(db, file_path, log.file_name, import_id=log.id)
    return log


def delete_codinh_import(db: Session, import_id: int) -> bool:
    """Delete a past CĐBR import log and file from disk."""
    log = db.query(ImportLog).filter(ImportLog.id == import_id, ImportLog.domain == "codinh").first()
    if not log:
        raise ValueError("Không tìm thấy bản ghi import CĐBR")
    from backend.config import UPLOAD_DIR
    file_path = UPLOAD_DIR / log.stored_filename
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass
    # Clean up associated chunked parts and progress files
    for ext in (".parts", ".progress", ".progress.tmp"):
        aux_p = Path(f"{file_path}{ext}")
        if aux_p.exists():
            try:
                aux_p.unlink()
            except Exception:
                pass
    if log.is_active == 1:
        db.query(TaskCodinh).delete()
    db.delete(log)
    db.commit()
    clear_codinh_stats_cache()
    return True

