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
    filename: str
) -> Dict[str, Any]:
    """
    Parse separate base WO Excel file for Cố Định Băng Rộng (CĐBR) and save into codinh_tasks table.
    Completely isolated from the main dashboard (Cơ điện) tasks table.
    """
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"File {file_path} không tồn tại")

    # Detect header row in first 15 rows
    df_preview = pd.read_excel(path_obj, header=None, nrows=15)
    header_row_idx = 0
    for idx, row in df_preview.iterrows():
        row_strs = [str(x).strip().lower() for x in row.values if pd.notna(x)]
        if any("mã công việc" in s or "ma cong viec" in s or s == "wo" for s in row_strs):
            header_row_idx = idx
            break

    df = pd.read_excel(path_obj, header=header_row_idx)

    # Detect columns
    col_map = {}
    for c in df.columns:
        c_low = str(c).strip().lower()
        if "mã công việc" in c_low or "ma cong viec" in c_low or c_low == "wo":
            col_map["ma_cong_viec"] = c
        elif "loại công việc" in c_low or "loai cong viec" in c_low:
            col_map["loai_cong_viec"] = c
        elif "nội dung" in c_low or "noi dung" in c_low:
            col_map["noi_dung_cong_viec"] = c
        elif "ghi chú" in c_low or "ghi chu" in c_low:
            col_map["ghi_chu"] = c
        elif "trạng thái" in c_low or "trang thai" in c_low:
            col_map["trang_thai"] = c
        elif "hệ thống" in c_low or "he thong" in c_low:
            col_map["he_thong"] = c
        elif "nhân viên thực hiện" in c_low or "nhan vien thuc hien" in c_low or c_low == "ft":
            col_map["nhan_vien"] = c
        elif "nhóm điều phối" in c_low or "nhom dieu phoi" in c_low or "cụm" in c_low or "nhóm" in c_low:
            col_map["nhom"] = c
        elif "mã trạm" in c_low or "ma tram" in c_low or "trạm" in c_low:
            col_map["ma_tram"] = c
        elif "thời điểm tạo" in c_low or "thoi diem tao" in c_low or "ngày tạo" in c_low:
            col_map["thoi_diem_tao"] = c
        elif "yêu cầu kết thúc" in c_low or "hạn hoàn thành" in c_low or "han hoan thanh" in c_low:
            col_map["thoi_diem_yeu_cau_ket_thuc"] = c
        elif "thời gian còn lại" in c_low or "thoi gian con lai" in c_low:
            col_map["thoi_gian_con_lai"] = c
        elif "ft hoàn thành" in c_low or "ft hoan thanh" in c_low:
            col_map["thoi_diem_ft_hoan_thanh"] = c
        elif "cđ đóng" in c_low or "cd dong" in c_low or "thời điểm đóng" in c_low:
            col_map["thoi_diem_cd_dong"] = c

    if "ma_cong_viec" not in col_map:
        raise ValueError("File Excel thiếu cột bắt buộc 'Mã công việc'!")

    # Clean DataFrame
    df_valid = df[df[col_map["ma_cong_viec"]].notna()].copy()
    df_valid["ma_cong_viec_clean"] = df_valid[col_map["ma_cong_viec"]].astype(str).str.strip()
    df_valid = df_valid[df_valid["ma_cong_viec_clean"] != ""]
    df_valid = df_valid.drop_duplicates(subset=["ma_cong_viec_clean"], keep="last")

    now = datetime.utcnow()
    records_to_insert = []
    closed_cnt = 0
    pending_cnt = 0

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

    return {
        "filename": filename,
        "total_wos": len(records_to_insert),
        "closed_wos": closed_cnt,
        "pending_wos": pending_cnt,
        "imported_at_vn": vn_time_str,
    }


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
