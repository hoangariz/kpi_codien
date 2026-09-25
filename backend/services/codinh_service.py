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
        elif any(k in c_low for k in ("nhân viên thực hiện", "nhan vien thuc hien", "người thực hiện", "nhân viên", "nhan vien")) or c_low == "ft":
            if "nhan_vien" not in col_map: col_map["nhan_vien"] = c
        elif any(k in c_low for k in ("nhóm điều phối", "nhom dieu phoi", "cụm", "cum", "nhóm", "nhom")):
            if "nhom" not in col_map: col_map["nhom"] = c
        elif any(k in c_low for k in ("mã trạm", "ma tram", "trạm", "tram")):
            if "ma_tram" not in col_map: col_map["ma_tram"] = c
        elif any(k in c_low for k in ("thời điểm tạo", "thoi diem tao", "ngày tạo")):
            if "thoi_diem_tao" not in col_map: col_map["thoi_diem_tao"] = c
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
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File {file_path} không tồn tại")

    # Read first 20 rows to detect header row
    df_preview = pd.read_excel(path_obj, header=None, nrows=20)
    header_row_idx = 0
    for idx, row in df_preview.iterrows():
        row_strs = [str(x).strip().lower() for x in row.values if pd.notna(x)]
        if any("mã đối tượng" in s or "mã wo" in s for s in row_strs):
            header_row_idx = idx
            break

    df = pd.read_excel(path_obj, header=header_row_idx)

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
        if "mã đối tượng" in c_clean or c_clean == "ma_doi_tuong":
            col_doi_tuong = col
        elif "mã wo" in c_clean or c_clean == "ma_wo" or "mã công việc" in c_clean:
            col_wo = col
        elif "trạng thái thc" in c_clean or "trạng thái đối tượng" in c_clean:
            col_thc_status = col
        elif "mã trạm" in c_clean:
            col_tram = col
        elif "trạng thái wo" in c_clean:
            col_wo_status = col
        elif "tỉnh" in c_clean or "tinh" in c_clean:
            col_tinh = col
        elif "khu vực" in c_clean or "khu_vuc" in c_clean:
            col_khu_vuc = col
        elif "quốc gia" in c_clean or "quoc_gia" in c_clean:
            col_quoc_gia = col

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

    for _, row in df_valid.iterrows():
        wo_val = row["ma_wo_clean"]
        dt_val = row["ma_doi_tuong_clean"]
        tram_val = str(row[col_tram]).strip() if col_tram and pd.notna(row[col_tram]) else None
        thc_status = str(row[col_thc_status]).strip() if col_thc_status and pd.notna(row[col_thc_status]) else "Đang thực hiện bảo dưỡng"
        wo_status = str(row[col_wo_status]).strip() if col_wo_status and pd.notna(row[col_wo_status]) else None
        tinh_val = str(row[col_tinh]).strip() if col_tinh and pd.notna(row[col_tinh]) else None
        khu_vuc_val = str(row[col_khu_vuc]).strip() if col_khu_vuc and pd.notna(row[col_khu_vuc]) else None
        quoc_gia_val = str(row[col_quoc_gia]).strip() if col_quoc_gia and pd.notna(row[col_quoc_gia]) else None

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


def get_codinh_stats(
    db: Session,
    category_id: Optional[int] = None,
    target_month: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get dual statistics (WO + Cabinets) for a specific Cố Định Băng Rộng category.
    Prioritizes codinh_tasks if uploaded, otherwise falls back to tasks table.
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

    # 2. Check if dedicated codinh_tasks table has records
    has_dedicated_tasks = db.query(TaskCodinh).count() > 0

    mode = (cat.filter_mode or "by_loai").strip() if cat else "by_loai"
    values = _parse_filter_values(cat.filter_values) if cat else []
    if not values and cat and cat.loai_cong_viec and not cat.loai_cong_viec.startswith("["):
        values = [cat.loai_cong_viec]

    raw_items = []

    if has_dedicated_tasks:
        # Query from dedicated codinh_tasks
        q = db.query(TaskCodinh)
        if values:
            if mode == "by_system":
                q = q.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
            else:
                q = q.filter(TaskCodinh.loai_cong_viec.in_(values))

        # Month filter
        if cat and cat.exclude_closed_prior_months:
            try:
                y, m = active_month.split("-")
                m_start = datetime(int(y), int(m), 1, 0, 0, 0)
                q = q.filter(
                    or_(
                        ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= m_start,
                        TaskCodinh.thoi_diem_tao >= m_start
                    )
                )
            except Exception:
                pass

        codinh_rows = q.all()
        for t in codinh_rows:
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
                "thoi_diem_yeu_cau_ket_thuc": t.thoi_diem_yeu_cau_ket_thuc,
                "thoi_gian_con_lai": t.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": t.thoi_diem_ft_hoan_thanh,
                "thoi_diem_cd_dong": t.thoi_diem_cd_dong,
            })
    else:
        # Fallback to Task table
        tasks_query = db.query(Task)
        if values:
            if mode == "by_system":
                upper_values = [v.upper().strip() for v in values]
                sys_ids = db.query(SystemModel.id).filter(
                    func.upper(func.trim(SystemModel.name)).in_(upper_values)
                ).scalar_subquery()
                tasks_query = tasks_query.filter(Task.system_id.in_(sys_ids))
            else:
                tasks_query = tasks_query.filter(Task.loai_cong_viec.in_(values))

        if cat and cat.exclude_closed_prior_months:
            try:
                y, m = active_month.split("-")
                m_start = datetime(int(y), int(m), 1, 0, 0, 0)
                tasks_query = tasks_query.filter(
                    or_(
                        ~Task.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= m_start,
                        Task.thoi_diem_tao >= m_start
                    )
                )
            except Exception:
                pass

        task_rows = tasks_query.all()
        for t in task_rows:
            emp_name = t.employee_assigned.name if t.employee_assigned else "Chưa gán"
            grp_name = t.group.name if t.group else "Chưa phân nhóm"
            st_code = t.station.code if t.station else (t.station_code if hasattr(t, "station_code") else "")
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
                "thoi_diem_yeu_cau_ket_thuc": t.thoi_diem_yeu_cau_ket_thuc,
                "thoi_gian_con_lai": t.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": t.thoi_diem_ft_hoan_thanh,
                "thoi_diem_cd_dong": t.thoi_diem_cd_dong,
            })

    task_keys = [item["ma_cong_viec"] for item in raw_items]

    # 3. Fetch cabinets
    cab_query = db.query(Cabinet)
    if cat:
        cab_query = cab_query.filter(
            or_(
                Cabinet.category_id == cat.id,
                Cabinet.ma_wo.in_(task_keys) if task_keys else False
            )
        )
    cabinets_list = cab_query.all()

    # Map cabinets by ma_wo
    wo_cabinets_map = defaultdict(list)
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
        "total_cabinets": 0,
        "completed_cabinets": 0,
        "pending_cabinets": 0,
    })

    grp_map = defaultdict(lambda: {
        "key_name": "Chưa phân nhóm",
        "total_wos": 0,
        "closed_wos": 0,
        "pending_wos": 0,
        "overdue_wos": 0,
        "closed_today": 0,
        "closed_yesterday": 0,
        "total_cabinets": 0,
        "completed_cabinets": 0,
        "pending_cabinets": 0,
    })

    total_wos = len(raw_items)
    closed_wos = 0
    pending_wos = 0
    overdue_wos = 0
    closed_today_wos = 0
    closed_yesterday_wos = 0

    for item in raw_items:
        emp_name = item["employee_name"]
        grp_name = item["group_name"]
        is_closed = item["trang_thai"] in CLOSED_STATUSES
        is_overdue = not is_closed and (
            (item["thoi_gian_con_lai"] is not None and item["thoi_gian_con_lai"] < 0) or
            (item["thoi_diem_yeu_cau_ket_thuc"] and item["thoi_diem_yeu_cau_ket_thuc"] < now)
        )

        if is_closed:
            closed_wos += 1
            finish_time = item["thoi_diem_ft_hoan_thanh"] or item["thoi_diem_cd_dong"]
            if finish_time and finish_time >= today_start:
                closed_today_wos += 1
            elif finish_time and yesterday_start <= finish_time < today_start:
                closed_yesterday_wos += 1
        else:
            pending_wos += 1

        if is_overdue:
            overdue_wos += 1

        # Cabinets for this WO
        cabs = wo_cabinets_map.get(item["ma_cong_viec"], [])
        t_cabs = len(cabs)
        comp_cabs = sum(1 for c in cabs if c["is_completed"])
        pend_cabs = t_cabs - comp_cabs

        # Aggregate Employee
        emp_entry = emp_map[emp_name]
        emp_entry["key_name"] = emp_name
        emp_entry["group_name"] = grp_name
        emp_entry["total_wos"] += 1
        if is_closed:
            emp_entry["closed_wos"] += 1
        else:
            emp_entry["pending_wos"] += 1
        if is_overdue:
            emp_entry["overdue_wos"] += 1
        emp_entry["total_cabinets"] += t_cabs
        emp_entry["completed_cabinets"] += comp_cabs
        emp_entry["pending_cabinets"] += pend_cabs

        # Aggregate Group
        grp_entry = grp_map[grp_name]
        grp_entry["key_name"] = grp_name
        grp_entry["total_wos"] += 1
        if is_closed:
            grp_entry["closed_wos"] += 1
        else:
            grp_entry["pending_wos"] += 1
        if is_overdue:
            grp_entry["overdue_wos"] += 1
        grp_entry["total_cabinets"] += t_cabs
        grp_entry["completed_cabinets"] += comp_cabs
        grp_entry["pending_cabinets"] += pend_cabs

    total_cabinets = sum(e["total_cabinets"] for e in emp_map.values())
    completed_cabinets = sum(e["completed_cabinets"] for e in emp_map.values())
    pending_cabinets = total_cabinets - completed_cabinets
    cabinet_rate = round((completed_cabinets / total_cabinets * 100), 1) if total_cabinets > 0 else 0.0
    wo_rate = round((closed_wos / total_wos * 100), 1) if total_wos > 0 else 0.0

    by_employee = []
    for k, v in emp_map.items():
        c_rate = round((v["completed_cabinets"] / v["total_cabinets"] * 100), 1) if v["total_cabinets"] > 0 else 0.0
        w_rate = round((v["closed_wos"] / v["total_wos"] * 100), 1) if v["total_wos"] > 0 else 0.0
        by_employee.append({
            **v,
            "cabinet_rate": c_rate,
            "wo_rate": w_rate,
            "is_other": k == "Chưa gán",
        })
    by_employee.sort(key=lambda x: (x["is_other"], -x["total_cabinets"] if has_cabinets else -x["total_wos"]))

    by_group = []
    for k, v in grp_map.items():
        c_rate = round((v["completed_cabinets"] / v["total_cabinets"] * 100), 1) if v["total_cabinets"] > 0 else 0.0
        w_rate = round((v["closed_wos"] / v["total_wos"] * 100), 1) if v["total_wos"] > 0 else 0.0
        by_group.append({
            **v,
            "cabinet_rate": c_rate,
            "wo_rate": w_rate,
            "is_other": k == "Chưa phân nhóm",
        })
    by_group.sort(key=lambda x: (x["is_other"], -x["total_cabinets"] if has_cabinets else -x["total_wos"]))

    # 5. Determine data freshness timestamp formatted in GMT+7
    last_update_vn = _get_setting(db, "codinh_last_import_wo_time_vn")
    if not last_update_vn:
        last_update_vn = _get_setting(db, "codinh_last_import_cabinet_time_vn")
    if not last_update_vn:
        # Fallback to latest import log
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
        },
        "summary": {
            "total_wos": total_wos,
            "closed_wos": closed_wos,
            "pending_wos": pending_wos,
            "overdue_wos": overdue_wos,
            "closed_today_wos": closed_today_wos,
            "closed_yesterday_wos": closed_yesterday_wos,
            "wo_rate": wo_rate,
            "total_cabinets": total_cabinets,
            "completed_cabinets": completed_cabinets,
            "pending_cabinets": pending_cabinets,
            "cabinet_rate": cabinet_rate,
            "has_cabinets": has_cabinets,
        },
        "by_employee": by_employee,
        "by_group": by_group,
        "last_data_update_vn": last_update_vn,
        "has_dedicated_tasks": has_dedicated_tasks,
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

    has_dedicated_tasks = db.query(TaskCodinh).count() > 0

    if has_dedicated_tasks:
        q = db.query(TaskCodinh)
        if values:
            if mode == "by_system":
                q = q.filter(func.upper(TaskCodinh.he_thong).in_([v.upper().strip() for v in values]))
            else:
                q = q.filter(TaskCodinh.loai_cong_viec.in_(values))

        if cat and cat.exclude_closed_prior_months:
            active_month = get_current_month_setting(db)
            try:
                y, m = active_month.split("-")
                m_start = datetime(int(y), int(m), 1, 0, 0, 0)
                q = q.filter(
                    or_(
                        ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                        func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= m_start,
                        TaskCodinh.thoi_diem_tao >= m_start
                    )
                )
            except Exception:
                pass

        # Target filter (Employee or Group)
        if filter_type == "employee" and target_name:
            if target_name in ("Chưa gán", "Khác", "*"):
                q = q.filter(or_(TaskCodinh.nhan_vien == None, TaskCodinh.nhan_vien == "", TaskCodinh.nhan_vien == "Chưa gán"))
            else:
                q = q.filter(TaskCodinh.nhan_vien == target_name)
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
                "employee_assigned_name": r.nhan_vien or "Chưa gán",
                "group_name": r.nhom or "Chưa phân nhóm",
                "station_code": r.ma_tram or "",
                "thoi_diem_tao": r.thoi_diem_tao.isoformat() if r.thoi_diem_tao else None,
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

    return {"total": 0, "page": 1, "page_size": page_size, "total_pages": 1, "items": []}


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
