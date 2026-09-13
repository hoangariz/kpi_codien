import os
import re
import math
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import SessionLocal, is_sqlite
from backend.models import (
    Employee, Group, TaskType, SystemModel, Unit, Station,
    ImportLog, Task, TaskHistory
)
from backend.config import CHUNK_SIZE


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


def resolve_dimensions_in_bulk(db: Session, df: pd.DataFrame) -> Dict[str, Dict[str, int]]:
    """
    Get-or-create dimension entries in memory cache.
    Avoids 100k queries by doing single batch select and batch insert.
    """
    cache = {
        "employees": {},
        "groups": {},
        "systems": {},
        "units": {},
        "stations": {},
        "task_types": {},
    }

    # 1. Employees (from both 'Nhân viên khởi tạo' and 'Nhân viên thực hiện')
    emp_names = set()
    for col in ("Nhân viên khởi tạo", "Nhân viên thực hiện"):
        if col in df.columns:
            emp_names.update(df[col].dropna().astype(str).str.strip().unique())
    emp_names.discard("")

    existing_emps = db.query(Employee.name, Employee.id).all()
    cache["employees"] = {name: id for name, id in existing_emps}
    missing_emps = [name for name in emp_names if name not in cache["employees"]]
    if missing_emps:
        new_objects = [Employee(name=name) for name in missing_emps]
        db.add_all(new_objects)
        db.commit()
        # Refresh cache
        refreshed = db.query(Employee.name, Employee.id).filter(Employee.name.in_(missing_emps)).all()
        for name, id in refreshed:
            cache["employees"][name] = id

    # 2. Groups (from 'Nhóm điều phối')
    if "Nhóm điều phối" in df.columns:
        group_names = set(df["Nhóm điều phối"].dropna().astype(str).str.strip().unique())
        group_names.discard("")
        existing_groups = db.query(Group.name, Group.id).all()
        cache["groups"] = {name: id for name, id in existing_groups}
        missing_groups = [name for name in group_names if name not in cache["groups"]]
        if missing_groups:
            db.add_all([Group(name=name) for name in missing_groups])
            db.commit()
            refreshed = db.query(Group.name, Group.id).filter(Group.name.in_(missing_groups)).all()
            for name, id in refreshed:
                cache["groups"][name] = id

    # 3. Systems (from 'Hệ thống' and 'Mã hệ thống')
    if "Hệ thống" in df.columns:
        sys_names = set(df["Hệ thống"].dropna().astype(str).str.strip().unique())
        sys_names.discard("")
        existing_sys = db.query(SystemModel.name, SystemModel.id).all()
        cache["systems"] = {name: id for name, id in existing_sys}
        missing_sys = [name for name in sys_names if name not in cache["systems"]]
        if missing_sys:
            db.add_all([SystemModel(name=name) for name in missing_sys])
            db.commit()
            refreshed = db.query(SystemModel.name, SystemModel.id).filter(SystemModel.name.in_(missing_sys)).all()
            for name, id in refreshed:
                cache["systems"][name] = id

    # 4. Units (from 'Đơn vị tạo')
    if "Đơn vị tạo" in df.columns:
        unit_names = set(df["Đơn vị tạo"].dropna().astype(str).str.strip().unique())
        unit_names.discard("")
        existing_units = db.query(Unit.name, Unit.id).all()
        cache["units"] = {name: id for name, id in existing_units}
        missing_units = [name for name in unit_names if name not in cache["units"]]
        if missing_units:
            db.add_all([Unit(name=name) for name in missing_units])
            db.commit()
            refreshed = db.query(Unit.name, Unit.id).filter(Unit.name.in_(missing_units)).all()
            for name, id in refreshed:
                cache["units"][name] = id

    # 5. Stations (from 'Mã trạm')
    if "Mã trạm" in df.columns:
        station_codes = set(df["Mã trạm"].dropna().astype(str).str.strip().unique())
        station_codes.discard("")
        existing_stations = db.query(Station.code, Station.id).all()
        cache["stations"] = {code: id for code, id in existing_stations}
        missing_stations = [code for code in station_codes if code not in cache["stations"]]
        if missing_stations:
            db.add_all([Station(code=code) for code in missing_stations])
            db.commit()
            refreshed = db.query(Station.code, Station.id).filter(Station.code.in_(missing_stations)).all()
            for code, id in refreshed:
                cache["stations"][code] = id

    # 6. Task Types (from 'Loại công việc')
    if "Loại công việc" in df.columns:
        type_names = set(df["Loại công việc"].dropna().astype(str).str.strip().unique())
        type_names.discard("")
        existing_types = db.query(TaskType.name, TaskType.id).all()
        cache["task_types"] = {name: id for name, id in existing_types}
        missing_types = [name for name in type_names if name not in cache["task_types"]]
        if missing_types:
            db.add_all([TaskType(name=name) for name in missing_types])
            db.commit()
            refreshed = db.query(TaskType.name, TaskType.id).filter(TaskType.name.in_(missing_types)).all()
            for name, id in refreshed:
                cache["task_types"][name] = id

    return cache


def process_excel_import(import_id: int, file_path: str):
    """
    Main ETL function executed in background.
    Optimized for 100k+ rows with in-memory caching and bulk chunk upsert.
    """
    db = SessionLocal()
    try:
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if not import_record:
            return

        import_record.status = "PROCESSING"
        import_record.progress_percent = 5
        db.commit()

        # Step 1: Read excel file
        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path, low_memory=False)
        else:
            df = pd.read_excel(file_path, engine="openpyxl")

        total_rows = len(df)
        import_record.total_rows = total_rows
        import_record.progress_percent = 15
        db.commit()

        # Normalize column headers
        df.columns = [str(c).strip() for c in df.columns]

        # Standardize synonyms: "Mô tả" -> "Ghi chú", "Mức độ ưu tiên" -> "Lỗi"
        if "Mô tả" in df.columns and "Ghi chú" not in df.columns:
            df["Ghi chú"] = df["Mô tả"]
        if "Mức độ ưu tiên" in df.columns and "Lỗi" not in df.columns:
            df["Lỗi"] = df["Mức độ ưu tiên"]

        # Step 2: Filter out SPM and SPM_VTNET rows
        filtered_out_count = 0
        if "Hệ thống" in df.columns:
            sys_series = df["Hệ thống"].fillna("").astype(str).str.strip().str.upper()
            is_spm = sys_series.isin(["SPM", "SPM_VTNET"])
            filtered_out_count = int(is_spm.sum())
            df_valid = df[~is_spm].copy()
        else:
            df_valid = df.copy()

        import_record.filtered_out_count = filtered_out_count
        import_record.progress_percent = 25
        db.commit()

        # Step 3: Resolve dimensions in bulk
        dim_cache = resolve_dimensions_in_bulk(db, df_valid)
        emp_cache = dim_cache["employees"]
        group_cache = dim_cache["groups"]
        sys_cache = dim_cache["systems"]
        unit_cache = dim_cache["units"]
        station_cache = dim_cache["stations"]
        type_cache = dim_cache["task_types"]

        # Invert employee and group caches for quick id -> name lookups in history
        emp_id_to_name = {v: k for k, v in emp_cache.items()}
        group_id_to_name = {v: k for k, v in group_cache.items()}

        import_record.progress_percent = 35
        db.commit()

        # Step 4: Record file size
        try:
            if os.path.exists(file_path):
                import_record.file_size_bytes = os.path.getsize(file_path)
        except Exception:
            pass

        # Step 5: Xoá sạch dữ liệu công việc cũ trong database trước khi nạp file mới
        # (Theo yêu cầu: file mới chứa đầy đủ snapshot WO hiện tại, không cần so sánh diff với file cũ)
        import_record.progress_percent = 40
        db.commit()

        db.query(TaskHistory).delete()
        db.query(Task).delete()
        db.commit()

        # Step 6: Chuẩn bị dữ liệu và Bulk Insert
        valid_rows_count = len(df_valid)
        now = datetime.utcnow()
        tasks_to_insert = []

        for _, row in df_valid.iterrows():
            ma_cv = clean_str(row.get("Mã công việc"))
            if not ma_cv:
                continue

            loai_cv = clean_str(row.get("Loại công việc"))
            task_type_id = type_cache.get(loai_cv) if loai_cv else None

            assigned_name = clean_str(row.get("Nhân viên thực hiện"))
            assigned_to_id = emp_cache.get(assigned_name) if assigned_name else None

            created_name = clean_str(row.get("Nhân viên khởi tạo"))
            created_by_id = emp_cache.get(created_name) if created_name else None

            group_name = clean_str(row.get("Nhóm điều phối"))
            group_id = group_cache.get(group_name) if group_name else None

            sys_name = clean_str(row.get("Hệ thống"))
            system_id = sys_cache.get(sys_name) if sys_name else None

            unit_name = clean_str(row.get("Đơn vị tạo"))
            unit_id = unit_cache.get(unit_name) if unit_name else None

            station_code = clean_str(row.get("Mã trạm"))
            station_id = station_cache.get(station_code) if station_code else None

            trang_thai = clean_str(row.get("Trạng thái"))
            trang_thai_ht = clean_str(row.get("Trạng thái hoàn thành"))
            thoi_diem_ft_ht = parse_datetime_safe(row.get("Thời điểm FT hoàn thành"))
            thoi_diem_cd_dong = parse_datetime_safe(row.get("Thời điểm CD đóng"))

            tasks_to_insert.append({
                "ma_cong_viec": ma_cv,
                "ma_cong_viec_cha": clean_str(row.get("Mã công việc cha")),
                "task_type_id": task_type_id,
                "loai_cong_viec": loai_cv,
                "noi_dung_cong_viec": clean_str(row.get("Nội dung công việc")),
                "ghi_chu": clean_str(row.get("Ghi chú")),
                "trang_thai": trang_thai,
                "trang_thai_hoan_thanh": trang_thai_ht,
                "system_id": system_id,
                "created_by_id": created_by_id,
                "thoi_diem_tao": parse_datetime_safe(row.get("Thời điểm tạo")),
                "group_id": group_id,
                "assigned_to_id": assigned_to_id,
                "loi": clean_str(row.get("Lỗi")),
                "thoi_diem_bat_dau_thuc_hien": parse_datetime_safe(row.get("Thời điểm bắt đầu thực hiện (dd/MM/yyyy HH:mm:ss)")),
                "thoi_diem_yeu_cau_ket_thuc": parse_datetime_safe(row.get("Thời điểm yêu cầu kết thúc (dd/MM/yyyy HH:mm:ss)")),
                "thoi_gian_con_lai": clean_float(row.get("Thời gian còn lại (H)")),
                "thoi_diem_ft_hoan_thanh": thoi_diem_ft_ht,
                "thoi_diem_cd_dong": thoi_diem_cd_dong,
                "thoi_diem_ft_tiep_nhan": parse_datetime_safe(row.get("Thời điểm FT tiếp nhận")),
                "thue_bao": clean_str(row.get("Thuê bao")),
                "unit_id": unit_id,
                "worklog": clean_str(row.get("Worklog")),
                "station_id": station_id,
                "ft_comment": clean_str(row.get("FT comment")),
                "ft_mobile": clean_str(row.get("FT mobile")),
                "created_at": now,
                "updated_at": now,
                "last_import_id": import_id,
            })

        # Bulk insert in batches of 5000 rows
        batch_size = 5000
        total_tasks = len(tasks_to_insert)
        for i in range(0, total_tasks, batch_size):
            batch = tasks_to_insert[i : i + batch_size]
            db.bulk_insert_mappings(Task, batch)
            db.commit()

            pct = 40 + int(((i + len(batch)) / max(1, total_tasks)) * 55)
            import_record.progress_percent = min(pct, 96)
            import_record.inserted_count = i + len(batch)
            db.commit()

        # Step 7: Kích hoạt file này là file đang sử dụng trong DB (is_active = 1)
        # Các file khác chuyển về is_active = 0
        db.query(ImportLog).filter(ImportLog.id != import_id).update({"is_active": 0})
        import_record.is_active = 1
        import_record.status = "COMPLETED"
        import_record.progress_percent = 100
        import_record.inserted_count = total_tasks
        import_record.updated_count = 0
        import_record.unchanged_count = 0
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
            import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
            if import_record:
                import_record.status = "FAILED"
                import_record.error_message = err_msg[:2000]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
