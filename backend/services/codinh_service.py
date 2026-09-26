import os
import json
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from collections import defaultdict
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_, and_, case, distinct

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


def _set_setting(db: Session, key: str, value: str):
    item = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if item:
        item.value = value
        item.updated_at = datetime.utcnow()
    else:
        item = SystemSetting(key=key, value=value, updated_at=datetime.utcnow())
        db.add(item)
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
    Uses resilient parsing matching etl_service.py: calamine/openpyxl, 25-row header scan, BOM strip, column synonyms.
    """
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File {file_path} không tồn tại")

    import_record = None
    if import_id:
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if import_record:
            import_record.status = "PROCESSING"
            import_record.progress_percent = 15
            db.commit()

    file_path_str = str(path_obj)
    file_path_lower = file_path_str.lower()
    if file_path_lower.endswith(".csv"):
        df = pd.read_csv(file_path_str, low_memory=False, encoding_errors="replace")
    elif file_path_lower.endswith(".xls"):
        try:
            df = pd.read_excel(file_path_str, engine="xlrd")
        except Exception:
            try:
                df = pd.read_excel(file_path_str)
            except Exception as ex:
                raise ValueError(f"Không thể đọc file .xls (Excel 97-2003): {ex}")
    else:
        try:
            import calamine
            df = pd.read_excel(file_path_str, engine="calamine")
        except Exception:
            try:
                df = pd.read_excel(file_path_str, engine="openpyxl", engine_kwargs={"read_only": True, "data_only": True})
            except Exception:
                df = pd.read_excel(file_path_str, engine="openpyxl")

    if import_record:
        import_record.total_rows = len(df)
        import_record.progress_percent = 30
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

    # Clean DataFrame
    df_valid = df[df[col_map["ma_cong_viec"]].notna()].copy()
    df_valid["ma_cong_viec_clean"] = df_valid[col_map["ma_cong_viec"]].astype(str).str.strip()
    df_valid = df_valid[df_valid["ma_cong_viec_clean"] != ""]
    df_valid = df_valid.drop_duplicates(subset=["ma_cong_viec_clean"], keep="last")

    now = datetime.utcnow()
    records_to_insert = []
    closed_cnt = 0
    pending_cnt = 0

    if import_record:
        import_record.progress_percent = 50
        db.commit()

    for _, row in df_valid.iterrows():
        ma_cv = row["ma_cong_viec_clean"]
        loai_cv = str(row[col_map["loai_cong_viec"]]).strip() if "loai_cong_viec" in col_map and pd.notna(row[col_map["loai_cong_viec"]]) else None
        noi_dung = str(row[col_map["noi_dung_cong_viec"]]).strip() if "noi_dung_cong_viec" in col_map and pd.notna(row[col_map["noi_dung_cong_viec"]]) else None
        ghi_chu = str(row[col_map["ghi_chu"]]).strip() if "ghi_chu" in col_map and pd.notna(row[col_map["ghi_chu"]]) else None
        trang_thai = str(row[col_map["trang_thai"]]).strip() if "trang_thai" in col_map and pd.notna(row[col_map["trang_thai"]]) else "Chưa rõ"
        he_thong = str(row[col_map["he_thong"]]).strip() if "he_thong" in col_map and pd.notna(row[col_map["he_thong"]]) else None
        nhan_vien = str(row[col_map["nhan_vien"]]).strip() if "nhan_vien" in col_map and pd.notna(row[col_map["nhan_vien"]]) else "Chưa gán"
        nhom = str(row[col_map["nhom"]]).strip() if "nhom" in col_map and pd.notna(row[col_map["nhom"]]) else "Chưa phân nhóm"
        ma_tram = str(row[col_map["ma_tram"]]).strip() if "ma_tram" in col_map and pd.notna(row[col_map["ma_tram"]]) else None

        t_tao = _parse_date_safe(row.get(col_map.get("thoi_diem_tao"))) if "thoi_diem_tao" in col_map else None
        t_bat_dau = _parse_date_safe(row.get(col_map.get("thoi_diem_bat_dau_thuc_hien"))) if "thoi_diem_bat_dau_thuc_hien" in col_map else None
        t_ket_thuc = _parse_date_safe(row.get(col_map.get("thoi_diem_yeu_cau_ket_thuc"))) if "thoi_diem_yeu_cau_ket_thuc" in col_map else None
        t_ft_ht = _parse_date_safe(row.get(col_map.get("thoi_diem_ft_hoan_thanh"))) if "thoi_diem_ft_hoan_thanh" in col_map else None
        t_cd_dong = _parse_date_safe(row.get(col_map.get("thoi_diem_cd_dong"))) if "thoi_diem_cd_dong" in col_map else None

        tg_con_lai = None
        if "thoi_gian_con_lai" in col_map and pd.notna(row[col_map["thoi_gian_con_lai"]]):
            try:
                tg_con_lai = float(row[col_map["thoi_gian_con_lai"]])
            except Exception:
                pass

        if trang_thai in CLOSED_STATUSES:
            closed_cnt += 1
        else:
            pending_cnt += 1

        records_to_insert.append({
            "ma_cong_viec": ma_cv,
            "loai_cong_viec": loai_cv,
            "noi_dung_cong_viec": noi_dung,
            "ghi_chu": ghi_chu,
            "trang_thai": trang_thai,
            "he_thong": he_thong,
            "nhan_vien": nhan_vien,
            "nhom": nhom,
            "ma_tram": ma_tram,
            "thoi_diem_tao": t_tao,
            "thoi_diem_bat_dau_thuc_hien": t_bat_dau,
            "thoi_diem_yeu_cau_ket_thuc": t_ket_thuc,
            "thoi_gian_con_lai": tg_con_lai,
            "thoi_diem_ft_hoan_thanh": t_ft_ht,
            "thoi_diem_cd_dong": t_cd_dong,
            "import_filename": filename,
            "created_at": now,
            "updated_at": now,
        })

    if import_record:
        import_record.progress_percent = 70
        db.commit()

    # Clear old codinh_tasks and insert new
    db.query(TaskCodinh).delete(synchronize_session=False)
    db.commit()

    BATCH_SIZE = 1000
    for i in range(0, len(records_to_insert), BATCH_SIZE):
        batch = records_to_insert[i:i + BATCH_SIZE]
        db.bulk_insert_mappings(TaskCodinh, batch)
        db.commit()

    # Update settings
    vn_now = now + timedelta(hours=7)
    vn_time_str = vn_now.strftime("%d/%m/%Y lúc %H:%M")
    _set_setting(db, "codinh_last_import_wo_time", now.isoformat())
    _set_setting(db, "codinh_last_import_wo_time_vn", vn_time_str)
    _set_setting(db, "codinh_last_import_wo_filename", filename)
    _set_setting(db, "codinh_last_import_wo_count", str(len(records_to_insert)))

    # Update ImportLog
    if import_record:
        # Deactivate previous active codinh imports
        db.query(ImportLog).filter(ImportLog.domain == "codinh", ImportLog.id != import_record.id).update({"is_active": 0})
        import_record.total_rows = len(df)
        import_record.inserted_count = len(records_to_insert)
        import_record.status = "COMPLETED"
        import_record.progress_percent = 100
        import_record.is_active = 1
        db.commit()
    else:
        # Create an ImportLog record if none was provided
        try:
            db.query(ImportLog).filter(ImportLog.domain == "codinh").update({"is_active": 0})
            file_size = path_obj.stat().st_size if path_obj.exists() else 0
            new_log = ImportLog(
                file_name=filename,
                stored_filename=path_obj.name,
                file_size_bytes=file_size,
                is_active=1,
                imported_at=now,
                total_rows=len(df),
                inserted_count=len(records_to_insert),
                status="COMPLETED",
                progress_percent=100,
                domain="codinh",
            )
            db.add(new_log)
            db.commit()
        except Exception:
            db.rollback()

    return {
        "filename": filename,
        "total_wos": len(records_to_insert),
        "closed_wos": closed_cnt,
        "pending_wos": pending_cnt,
        "imported_at_vn": vn_time_str,
    }


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
        db.rollback()
        import_record = db.query(ImportLog).filter(ImportLog.id == import_id).first()
        if import_record:
            import_record.status = "FAILED"
            import_record.error_message = str(ex)
            db.commit()
    finally:
        db.close()


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
        if "hoàn thành" in thc_status.lower() and "đang" not in thc_status.lower():
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
            "trang_thai_thc": thc_status,
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

    return {
        "filename": filename,
        "total_cabinets": len(records_to_insert),
        "unique_wos": len(unique_wos),
        "completed_cabinets": completed_cabinets,
        "pending_cabinets": pending_cabinets,
        "completion_rate": rate,
        "imported_at_vn": vn_time_str,
    }


def seed_default_codinh_if_needed(db: Session):
    """Seed default Cố Định Băng Rộng category and demo cabinets if database is empty."""
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

    # Auto-repair codinh_tasks user assignments if old import misidentified creator as assignee
    if _get_setting(db, "codinh_fix_user_v2") != "1":
        active_log = db.query(ImportLog).filter(ImportLog.domain == "codinh", ImportLog.status == "COMPLETED").order_by(desc(ImportLog.imported_at)).first()
        if active_log and active_log.stored_filename:
            file_path = UPLOAD_DIR / active_log.stored_filename
            if file_path.exists():
                try:
                    import_codinh_wos_from_excel(db, str(file_path), active_log.file_name, import_id=active_log.id)
                except Exception as e:
                    print(f"Notice: re-import codinh failed: {e}")
        _set_setting(db, "codinh_fix_user_v2", "1")


def get_codinh_stats(
    db: Session,
    category_id: Optional[int] = None,
    target_month: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get dual statistics (WO + Cabinets) for a specific Cố Định Băng Rộng category.
    Prioritizes codinh_tasks if uploaded, otherwise falls back to tasks table.
    Supports ĐH Port Kém specific metrics (Home kém, Port kém, Tồn <24h/72h, KPI 1d/3d).
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
    all_dates = []

    # Check if dedicated codinh_tasks table has matching records
    has_dedicated_tasks = db.query(TaskCodinh).count() > 0
    codinh_rows = []
    if has_dedicated_tasks:
        q = db.query(TaskCodinh)
        if values:
            if mode == "by_system":
                q = q.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
            else:
                q = q.filter(TaskCodinh.loai_cong_viec.in_(values))
        codinh_rows = q.all()

    if codinh_rows:
        for t in codinh_rows:
            eff_date = t.thoi_diem_bat_dau_thuc_hien or t.thoi_diem_tao
            if eff_date:
                all_dates.append(eff_date)
            raw_items.append({
                "ma_cong_viec": t.ma_cong_viec,
                "station_code": t.ma_tram or "",
                "loai_cong_viec": t.loai_cong_viec or "",
                "noi_dung_cong_viec": t.noi_dung_cong_viec or "",
                "ghi_chu": t.ghi_chu or "",
                "trang_thai": t.trang_thai or "Chưa rõ",
                "employee_name": t.nhan_vien or "Chưa gán",
                "group_name": t.nhom or "Chưa phân nhóm",
                "thoi_diem_tao": t.thoi_diem_tao,
                "thoi_diem_bat_dau_thuc_hien": t.thoi_diem_bat_dau_thuc_hien,
                "thoi_diem_yeu_cau_ket_thuc": t.thoi_diem_yeu_cau_ket_thuc,
                "thoi_gian_con_lai": t.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": t.thoi_diem_ft_hoan_thanh,
                "thoi_diem_cd_dong": t.thoi_diem_cd_dong,
            })
    else:
        # Fallback to Task table
        tasks_query = db.query(Task).outerjoin(Task.employee_assigned).outerjoin(Task.group)
        if values:
            if mode == "by_system":
                upper_values = [v.upper().strip() for v in values]
                sys_ids = db.query(SystemModel.id).filter(
                    func.upper(func.trim(SystemModel.name)).in_(upper_values)
                ).scalar_subquery()
                tasks_query = tasks_query.filter(Task.system_id.in_(sys_ids))
            else:
                tasks_query = tasks_query.filter(Task.loai_cong_viec.in_(values))

        task_rows = tasks_query.all()
        for t in task_rows:
            emp_name = t.employee_assigned.name if t.employee_assigned else "Chưa gán"
            grp_name = t.group.name if t.group else "Chưa phân nhóm"
            st_code = t.station.code if t.station else (t.station_code if hasattr(t, "station_code") else "")
            eff_date = (t.thoi_diem_bat_dau_thuc_hien if hasattr(t, "thoi_diem_bat_dau_thuc_hien") else None) or t.thoi_diem_tao
            if eff_date:
                all_dates.append(eff_date)
            raw_items.append({
                "ma_cong_viec": t.ma_cong_viec,
                "station_code": st_code,
                "loai_cong_viec": t.loai_cong_viec or "",
                "noi_dung_cong_viec": t.noi_dung_cong_viec or "",
                "ghi_chu": t.ghi_chu or "",
                "trang_thai": t.trang_thai or "Chưa rõ",
                "employee_name": emp_name,
                "group_name": grp_name,
                "thoi_diem_tao": t.thoi_diem_tao,
                "thoi_diem_bat_dau_thuc_hien": t.thoi_diem_bat_dau_thuc_hien if hasattr(t, "thoi_diem_bat_dau_thuc_hien") else None,
                "thoi_diem_yeu_cau_ket_thuc": t.thoi_diem_yeu_cau_ket_thuc,
                "thoi_gian_con_lai": t.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": t.thoi_diem_ft_hoan_thanh,
                "thoi_diem_cd_dong": t.thoi_diem_cd_dong,
            })

    # Available months list
    distinct_months = set()
    for dt in all_dates:
        if isinstance(dt, datetime):
            distinct_months.add(dt.strftime("%Y-%m"))
    if not distinct_months:
        distinct_months.add(now.strftime("%Y-%m"))
    available_months = sorted(list(distinct_months), reverse=True)

    # Month filter if specified and not 'all' (Strictly only WOs within target month based on start time)
    if target_month and target_month != "all":
        try:
            import calendar
            y, m = target_month.split("-")
            m_start = datetime(int(y), int(m), 1, 0, 0, 0)
            _, last_day = calendar.monthrange(int(y), int(m))
            m_end = datetime(int(y), int(m), last_day, 23, 59, 59)
            filtered_items = []
            for item in raw_items:
                eff_date = item.get("thoi_diem_bat_dau_thuc_hien") or item.get("thoi_diem_tao")
                if eff_date and m_start <= eff_date <= m_end:
                    filtered_items.append(item)
            raw_items = filtered_items
        except Exception:
            pass
    elif not is_port_kem and cat and cat.exclude_closed_prior_months:
        # Default prior month exclusion for THC
        try:
            y, m = active_month.split("-")
            m_start = datetime(int(y), int(m), 1, 0, 0, 0)
            raw_items = [
                item for item in raw_items
                if (
                    item["trang_thai"] not in CLOSED_STATUSES or
                    ((item["thoi_diem_ft_hoan_thanh"] or item["thoi_diem_cd_dong"]) and (item["thoi_diem_ft_hoan_thanh"] or item["thoi_diem_cd_dong"]) >= m_start) or
                    ((item.get("thoi_diem_bat_dau_thuc_hien") or item["thoi_diem_tao"]) and (item.get("thoi_diem_bat_dau_thuc_hien") or item["thoi_diem_tao"]) >= m_start)
                )
            ]
        except Exception:
            pass

    task_keys = [item["ma_cong_viec"] for item in raw_items]

    # Cabinets only for non-Port Kém categories
    wo_cabinets_map = defaultdict(list)
    has_cabinets = False
    if not is_port_kem:
        cab_query = db.query(Cabinet)
        if cat:
            cab_query = cab_query.filter(
                or_(
                    Cabinet.category_id == cat.id,
                    Cabinet.ma_wo.in_(task_keys) if task_keys else False
                )
            )
        cabinets_list = cab_query.all()
        for c in cabinets_list:
            is_completed = "hoàn thành" in (c.trang_thai_thc or "").lower() and "đang" not in (c.trang_thai_thc or "").lower()
            wo_cabinets_map[c.ma_wo].append({
                "id": c.id,
                "ma_doi_tuong": c.ma_doi_tuong,
                "ma_tram": c.ma_tram or "",
                "trang_thai_thc": c.trang_thai_thc or "Đang thực hiện bảo dưỡng",
                "is_completed": is_completed,
                "tinh": c.tinh or "",
                "khu_vuc": c.khu_vuc or ""
            })
        has_cabinets = len(cabinets_list) > 0

    # 4. Compute metrics per employee and per group
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

        nd = (item["noi_dung_cong_viec"] or "").lower()
        is_port = ("port kém gpon" in nd or "port kem gpon" in nd or "port kém" in nd or "port kem" in nd or "gpon" in nd)
        is_home = ("home wifi thu kém" in nd or "home wifi thu kem" in nd or "home wifi" in nd or "thu kém" in nd or "thu kem" in nd)

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
            cabs = wo_cabinets_map.get(item["ma_cong_viec"], [])
            t_cabs = len(cabs)
            comp_cabs = sum(1 for c in cabs if c["is_completed"])
            pend_cabs = t_cabs - comp_cabs
            overdue_cabs = pend_cabs if is_overdue else 0
            emp_entry["total_cabinets"] += t_cabs
            emp_entry["completed_cabinets"] += comp_cabs
            emp_entry["pending_cabinets"] += pend_cabs
            emp_entry["overdue_cabinets"] += overdue_cabs
            grp_entry["total_cabinets"] += t_cabs
            grp_entry["completed_cabinets"] += comp_cabs
            grp_entry["pending_cabinets"] += pend_cabs
            grp_entry["overdue_cabinets"] += overdue_cabs

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
        latest_log = db.query(ImportLog).order_by(ImportLog.imported_at.desc()).first()
        if latest_log and latest_log.imported_at:
            vn_dt = latest_log.imported_at + timedelta(hours=7)
            last_update_vn = vn_dt.strftime("%d/%m/%Y lúc %H:%M")
        else:
            vn_dt = datetime.utcnow() + timedelta(hours=7)
            last_update_vn = vn_dt.strftime("%d/%m/%Y lúc %H:%M")

    return {
        "active_category": {
            "id": cat.id if cat else None,
            "name": cat.name if cat else "Báo Cáo Cố Định Băng Rộng",
            "loai_cong_viec": cat.loai_cong_viec if cat else "",
            "filter_mode": cat.filter_mode if cat else "by_loai",
            "filter_values": _parse_filter_values(cat.filter_values) if cat else [],
            "description": cat.description if cat else None,
            "has_cabinets": has_cabinets,
            "is_port_kem": is_port_kem,
        },
        "target_month": target_month or "all",
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
        "has_dedicated_tasks": bool(codinh_rows),
    }


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
    page_size: int = 20000,
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
    q_check = db.query(TaskCodinh)
    if values:
        if mode == "by_system":
            q_check = q_check.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
        else:
            q_check = q_check.filter(TaskCodinh.loai_cong_viec.in_(values))
    has_dedicated_tasks = q_check.count() > 0

    if has_dedicated_tasks:
        q = db.query(TaskCodinh)
        if values:
            if mode == "by_system":
                q = q.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
            else:
                q = q.filter(TaskCodinh.loai_cong_viec.in_(values))

        effective_date = func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao)

        # Month filter (Strictly only WOs within target month based on start time)
        if target_month and target_month.strip() and target_month.strip().lower() != "all":
            try:
                tm_y, tm_m = target_month.strip().split("-")
                tm_year, tm_month = int(tm_y), int(tm_m)
                m_start = datetime(tm_year, tm_month, 1, 0, 0, 0)
                if tm_month == 12:
                    m_end = datetime(tm_year + 1, 1, 1, 0, 0, 0)
                else:
                    m_end = datetime(tm_year, tm_month + 1, 1, 0, 0, 0)
                q = q.filter(
                    effective_date >= m_start,
                    effective_date < m_end
                )
            except Exception:
                pass
        elif cat and cat.exclude_closed_prior_months:
            active_month = get_current_month_setting(db)
            try:
                y, m = active_month.split("-")
                m_start = datetime(int(y), int(m), 1, 0, 0, 0)
                q = q.filter(
                    or_(
                        ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= m_start,
                        effective_date >= m_start
                    )
                )
            except Exception:
                pass

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
                Cabinet.trang_thai_thc.ilike("%hoàn thành%"),
                ~Cabinet.trang_thai_thc.ilike("%đang%")
            ).distinct().scalar_subquery()
            q = q.filter(TaskCodinh.ma_cong_viec.in_(comp_wos))
        elif m_low in ("cabinet_pending", "pending_cabinets", "tu_ton"):
            pend_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    ~Cabinet.trang_thai_thc.ilike("%hoàn thành%"),
                    Cabinet.trang_thai_thc.ilike("%đang%")
                )
            ).distinct().scalar_subquery()
            q = q.filter(TaskCodinh.ma_cong_viec.in_(pend_wos))
        elif m_low in ("cabinet_overdue", "overdue_cabinets", "tu_qua_han"):
            pend_cabs_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    ~Cabinet.trang_thai_thc.ilike("%hoàn thành%"),
                    Cabinet.trang_thai_thc.ilike("%đang%")
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
                effective_date >= past_24h
            )
        elif m_low in ("pending_under_72h", "ton_duoi_72h"):
            past_72h = now - timedelta(hours=72)
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                effective_date >= past_72h
            )
        elif m_low in ("kpi_24h", "closed_24h", "closed_within_24h", "kpi_1_ngay"):
            q = q.filter(TaskCodinh.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("kpi_72h", "closed_72h", "closed_within_72h", "kpi_3_ngay"):
            q = q.filter(TaskCodinh.trang_thai.in_(CLOSED_STATUSES))

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

        # Handle KPI duration memory filtering if needed (Calculated from start time)
        if m_low in ("kpi_24h", "closed_24h", "closed_within_24h", "kpi_1_ngay"):
            all_closed = q.all()
            filtered_kpi = []
            for r in all_closed:
                ft = r.thoi_diem_ft_hoan_thanh or r.thoi_diem_cd_dong
                st = r.thoi_diem_bat_dau_thuc_hien or r.thoi_diem_tao
                if ft and st:
                    dur = (ft - st).total_seconds() / 3600.0
                    if 0 <= dur <= 24.0:
                        filtered_kpi.append(r)
            total = len(filtered_kpi)
            offset = (page - 1) * page_size
            rows = filtered_kpi[offset:offset + page_size]
        elif m_low in ("kpi_72h", "closed_72h", "closed_within_72h", "kpi_3_ngay"):
            all_closed = q.all()
            filtered_kpi = []
            for r in all_closed:
                ft = r.thoi_diem_ft_hoan_thanh or r.thoi_diem_cd_dong
                st = r.thoi_diem_bat_dau_thuc_hien or r.thoi_diem_tao
                if ft and st:
                    dur = (ft - st).total_seconds() / 3600.0
                    if 0 <= dur <= 72.0:
                        filtered_kpi.append(r)
            total = len(filtered_kpi)
            offset = (page - 1) * page_size
            rows = filtered_kpi[offset:offset + page_size]
        else:
            total = q.count()
            offset = (page - 1) * page_size
            rows = q.offset(offset).limit(page_size).all()

        wo_keys = [r.ma_cong_viec for r in rows]

        # Fetch child cabinets
        cabs_map = defaultdict(list)
        if wo_keys:
            cabs = db.query(Cabinet).filter(Cabinet.ma_wo.in_(wo_keys)).all()
            for c in cabs:
                is_comp = "hoàn thành" in (c.trang_thai_thc or "").lower() and "đang" not in (c.trang_thai_thc or "").lower()
                cabs_map[c.ma_wo].append({
                    "id": c.id,
                    "ma_doi_tuong": c.ma_doi_tuong,
                    "ma_tram": c.ma_tram or "",
                    "trang_thai_thc": c.trang_thai_thc or "Đang thực hiện bảo dưỡng",
                    "trang_thai_wo": c.trang_thai_wo or "",
                    "is_completed": is_comp,
                })

        # Fetch latest notes
        notes_map = {}
        if wo_keys:
            all_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content)\
                .filter(TaskNote.ma_cong_viec.in_(wo_keys))\
                .order_by(TaskNote.created_at.desc())\
                .all()
            for k, c in all_notes:
                if k not in notes_map:
                    notes_map[k] = c

        items = []
        for r in rows:
            is_closed = r.trang_thai in CLOSED_STATUSES
            is_overdue = not is_closed and (
                (r.thoi_gian_con_lai is not None and r.thoi_gian_con_lai < 0) or
                (r.thoi_diem_yeu_cau_ket_thuc and r.thoi_diem_yeu_cau_ket_thuc < now)
            )
            wo_cabs = cabs_map.get(r.ma_cong_viec, [])
            comp_cabs = sum(1 for c in wo_cabs if c["is_completed"])
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
                "pending_cabinets": len(wo_cabs) - comp_cabs,
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
        q = db.query(Task).outerjoin(Task.employee_assigned).outerjoin(Task.group)
        if values:
            if mode == "by_system":
                upper_values = [v.upper().strip() for v in values]
                sys_ids = db.query(SystemModel.id).filter(
                    func.upper(func.trim(SystemModel.name)).in_(upper_values)
                ).scalar_subquery()
                q = q.filter(Task.system_id.in_(sys_ids))
            else:
                q = q.filter(Task.loai_cong_viec.in_(values))

        effective_date = func.coalesce(Task.thoi_diem_bat_dau_thuc_hien, Task.thoi_diem_tao)

        # Month filter (Strictly only WOs within target month based on start time)
        if target_month and target_month.strip() and target_month.strip().lower() != "all":
            try:
                tm_y, tm_m = target_month.strip().split("-")
                tm_year, tm_month = int(tm_y), int(tm_m)
                m_start = datetime(tm_year, tm_month, 1, 0, 0, 0)
                if tm_month == 12:
                    m_end = datetime(tm_year + 1, 1, 1, 0, 0, 0)
                else:
                    m_end = datetime(tm_year, tm_month + 1, 1, 0, 0, 0)
                q = q.filter(
                    effective_date >= m_start,
                    effective_date < m_end
                )
            except Exception:
                pass
        elif cat and cat.exclude_closed_prior_months:
            active_month = get_current_month_setting(db)
            try:
                y, m = active_month.split("-")
                m_start = datetime(int(y), int(m), 1, 0, 0, 0)
                q = q.filter(
                    or_(
                        ~Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= m_start,
                        effective_date >= m_start
                    )
                )
            except Exception:
                pass

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
                Cabinet.trang_thai_thc.ilike("%hoàn thành%"),
                ~Cabinet.trang_thai_thc.ilike("%đang%")
            ).distinct().scalar_subquery()
            q = q.filter(Task.ma_cong_viec.in_(comp_wos))
        elif m_low in ("cabinet_pending", "pending_cabinets", "tu_ton"):
            pend_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    ~Cabinet.trang_thai_thc.ilike("%hoàn thành%"),
                    Cabinet.trang_thai_thc.ilike("%đang%")
                )
            ).distinct().scalar_subquery()
            q = q.filter(Task.ma_cong_viec.in_(pend_wos))
        elif m_low in ("cabinet_overdue", "overdue_cabinets", "tu_qua_han"):
            pend_cabs_wos = db.query(Cabinet.ma_wo).filter(
                or_(
                    ~Cabinet.trang_thai_thc.ilike("%hoàn thành%"),
                    Cabinet.trang_thai_thc.ilike("%đang%")
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
                effective_date >= past_24h
            )
        elif m_low in ("pending_under_72h", "ton_duoi_72h"):
            past_72h = now - timedelta(hours=72)
            q = q.filter(
                ~Task.trang_thai.in_(CLOSED_STATUSES),
                effective_date >= past_72h
            )
        elif m_low in ("kpi_24h", "closed_24h", "closed_within_24h", "kpi_1_ngay"):
            q = q.filter(Task.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("kpi_72h", "closed_72h", "closed_within_72h", "kpi_3_ngay"):
            q = q.filter(Task.trang_thai.in_(CLOSED_STATUSES))

        # Search filter
        if search and search.strip():
            s_val = f"%{search.strip()}%"
            cab_search_wos = db.query(Cabinet.ma_wo).filter(Cabinet.ma_doi_tuong.ilike(s_val)).distinct().scalar_subquery()
            q = q.outerjoin(Task.station).filter(
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

        # Handle KPI duration memory filtering if needed (Calculated from start time)
        if m_low in ("kpi_24h", "closed_24h", "closed_within_24h", "kpi_1_ngay"):
            all_closed = q.all()
            filtered_kpi = []
            for r in all_closed:
                ft = r.thoi_diem_ft_hoan_thanh or r.thoi_diem_cd_dong
                st = r.thoi_diem_bat_dau_thuc_hien or r.thoi_diem_tao
                if ft and st:
                    dur = (ft - st).total_seconds() / 3600.0
                    if 0 <= dur <= 24.0:
                        filtered_kpi.append(r)
            total = len(filtered_kpi)
            offset = (page - 1) * page_size
            rows = filtered_kpi[offset:offset + page_size]
        elif m_low in ("kpi_72h", "closed_72h", "closed_within_72h", "kpi_3_ngay"):
            all_closed = q.all()
            filtered_kpi = []
            for r in all_closed:
                ft = r.thoi_diem_ft_hoan_thanh or r.thoi_diem_cd_dong
                st = r.thoi_diem_bat_dau_thuc_hien or r.thoi_diem_tao
                if ft and st:
                    dur = (ft - st).total_seconds() / 3600.0
                    if 0 <= dur <= 72.0:
                        filtered_kpi.append(r)
            total = len(filtered_kpi)
            offset = (page - 1) * page_size
            rows = filtered_kpi[offset:offset + page_size]
        else:
            total = q.count()
            offset = (page - 1) * page_size
            rows = q.offset(offset).limit(page_size).all()

        wo_keys = [r.ma_cong_viec for r in rows]

        # Fetch child cabinets
        cabs_map = defaultdict(list)
        if wo_keys:
            cabs = db.query(Cabinet).filter(Cabinet.ma_wo.in_(wo_keys)).all()
            for c in cabs:
                is_comp = "hoàn thành" in (c.trang_thai_thc or "").lower() and "đang" not in (c.trang_thai_thc or "").lower()
                cabs_map[c.ma_wo].append({
                    "id": c.id,
                    "ma_doi_tuong": c.ma_doi_tuong,
                    "ma_tram": c.ma_tram or "",
                    "trang_thai_thc": c.trang_thai_thc or "Đang thực hiện bảo dưỡng",
                    "trang_thai_wo": c.trang_thai_wo or "",
                    "is_completed": is_comp,
                })

        # Fetch latest notes
        notes_map = {}
        if wo_keys:
            all_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content)\
                .filter(TaskNote.ma_cong_viec.in_(wo_keys))\
                .order_by(TaskNote.created_at.desc())\
                .all()
            for k, c in all_notes:
                if k not in notes_map:
                    notes_map[k] = c

        items = []
        for r in rows:
            is_closed = r.trang_thai in CLOSED_STATUSES
            is_overdue = not is_closed and (
                (r.thoi_gian_con_lai is not None and r.thoi_gian_con_lai < 0) or
                (r.thoi_diem_yeu_cau_ket_thuc and r.thoi_diem_yeu_cau_ket_thuc < now)
            )
            wo_cabs = cabs_map.get(r.ma_cong_viec, [])
            comp_cabs = sum(1 for c in wo_cabs if c["is_completed"])
            emp_name = r.employee_assigned.name if r.employee_assigned else "Chưa gán"
            grp_name = r.group.name if r.group else "Chưa phân nhóm"
            st_code = r.station.code if r.station else ""
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
                "thoi_diem_bat_dau_thuc_hien": r.thoi_diem_bat_dau_thuc_hien.isoformat() if hasattr(r, "thoi_diem_bat_dau_thuc_hien") and r.thoi_diem_bat_dau_thuc_hien else None,
                "thoi_diem_yeu_cau_ket_thuc": r.thoi_diem_yeu_cau_ket_thuc.isoformat() if r.thoi_diem_yeu_cau_ket_thuc else None,
                "thoi_gian_con_lai": r.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": r.thoi_diem_ft_hoan_thanh.isoformat() if r.thoi_diem_ft_hoan_thanh else None,
                "thoi_diem_cd_dong": r.thoi_diem_cd_dong.isoformat() if r.thoi_diem_cd_dong else None,
                "latest_note": notes_map.get(r.ma_cong_viec),
                "is_overdue": is_overdue,
                "total_cabinets": len(wo_cabs),
                "completed_cabinets": comp_cabs,
                "pending_cabinets": len(wo_cabs) - comp_cabs,
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
    if log.is_active == 1:
        db.query(TaskCodinh).delete()
    db.delete(log)
    db.commit()
    return True
