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
from backend.models.dimensions import Employee, Group, SystemModel, Station
from backend.models.report_category import ReportCategory, ReportSubCategory
from backend.models.cabinet import Cabinet
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


def _build_codinh_conditions(cat: ReportCategory, db: Session):
    """Build filter conditions for Task table based on category configuration."""
    mode = (cat.filter_mode or "by_loai").strip()
    values = _parse_filter_values(cat.filter_values)

    if not values:
        if cat.loai_cong_viec and not cat.loai_cong_viec.startswith("["):
            return [Task.loai_cong_viec == cat.loai_cong_viec]
        return []

    if mode == "by_system":
        upper_values = [v.upper().strip() for v in values]
        sys_ids = db.query(SystemModel.id).filter(
            func.upper(func.trim(SystemModel.name)).in_(upper_values)
        ).scalar_subquery()
        return [Task.system_id.in_(sys_ids)]
    else:
        if len(values) == 1:
            return [Task.loai_cong_viec == values[0]]
        return [Task.loai_cong_viec.in_(values)]


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
        elif "tỉnh" in c_clean:
            col_tinh = col
        elif "khu vực" in c_clean:
            col_khu_vuc = col
        elif "quốc gia" in c_clean:
            col_quoc_gia = col

    if not col_doi_tuong or not col_wo:
        raise ValueError(
            f"Không tìm thấy cột 'Mã đối tượng' hoặc 'Mã WO' trong file. Các cột tìm thấy: {list(df.columns)}"
        )

    # Clean data & prepare batch insert
    records_to_insert = []
    unique_wos = set()
    completed_cabinets = 0
    pending_cabinets = 0

    now = datetime.utcnow()
    for _, row in df.iterrows():
        wo_val = str(row[col_wo]).strip() if pd.notna(row[col_wo]) else ""
        doi_tuong_val = str(row[col_doi_tuong]).strip() if pd.notna(row[col_doi_tuong]) else ""

        if not wo_val or not doi_tuong_val or wo_val.lower() == "nan" or doi_tuong_val.lower() == "nan":
            continue

        thc_status = str(row[col_thc_status]).strip() if col_thc_status and pd.notna(row[col_thc_status]) else "Đang thực hiện bảo dưỡng"
        tram_val = str(row[col_tram]).strip() if col_tram and pd.notna(row[col_tram]) else None
        wo_status_val = str(row[col_wo_status]).strip() if col_wo_status and pd.notna(row[col_wo_status]) else None
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
            "ma_doi_tuong": doi_tuong_val,
            "ma_tram": tram_val,
            "quoc_gia": quoc_gia_val,
            "khu_vuc": khu_vuc_val,
            "tinh": tinh_val,
            "trang_thai_wo": wo_status_val,
            "trang_thai_thc": thc_status,
            "import_filename": filename,
            "created_at": now,
            "updated_at": now,
        })

    # Clear existing cabinets if category_id specified or general replacement
    if category_id:
        db.query(Cabinet).filter(Cabinet.category_id == category_id).delete(synchronize_session=False)
    else:
        # Default replace
        db.query(Cabinet).delete(synchronize_session=False)

    db.commit()

    # Bulk insert
    BATCH_SIZE = 1000
    for i in range(0, len(records_to_insert), BATCH_SIZE):
        batch = records_to_insert[i:i + BATCH_SIZE]
        db.bulk_insert_mappings(Cabinet, batch)
        db.commit()

    rate = round((completed_cabinets / len(records_to_insert) * 100), 1) if records_to_insert else 0.0

    return {
        "filename": filename,
        "total_cabinets": len(records_to_insert),
        "unique_wos": len(unique_wos),
        "completed_cabinets": completed_cabinets,
        "pending_cabinets": pending_cabinets,
        "completion_rate": rate,
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
    """
    seed_default_codinh_if_needed(db)

    # 1. Fetch category
    query_cat = db.query(ReportCategory).filter(ReportCategory.domain == "codinh")
    if category_id:
        cat = query_cat.filter(ReportCategory.id == category_id).first()
    else:
        cat = query_cat.order_by(ReportCategory.is_default.desc(), ReportCategory.sort_order.asc()).first()

    if not cat:
        # Fallback to any category
        cat = db.query(ReportCategory).first()

    now = datetime.utcnow()
    active_month = target_month or get_current_month_setting(db)
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    yesterday_start = today_start - timedelta(days=1)

    # 2. Build tasks query for this category
    conds = _build_codinh_conditions(cat, db) if cat else []
    tasks_query = db.query(Task)
    if conds:
        tasks_query = tasks_query.filter(*conds)

    # Month filter if exclude_closed_prior_months
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

    tasks = tasks_query.all()
    task_keys = [t.ma_cong_viec for t in tasks]

    # 3. Fetch cabinets
    # Either cabinets tied to this category_id, or cabinets matching task_keys
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

    # 4. Compute metrics per task and aggregates
    emp_map = defaultdict(lambda: {
        "employee_id": None,
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
        "group_id": None,
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

    total_wos = len(tasks)
    closed_wos = 0
    pending_wos = 0
    overdue_wos = 0
    closed_today_wos = 0
    closed_yesterday_wos = 0

    wos_output = []

    for t in tasks:
        emp_name = t.employee_assigned.name if t.employee_assigned else "Chưa gán"
        emp_id = t.assigned_to_id
        grp_name = t.group.name if t.group else "Chưa phân nhóm"
        grp_id = t.group_id
        station_code = t.station.code if t.station else (t.station_code if hasattr(t, 'station_code') else "")

        is_closed = t.trang_thai in CLOSED_STATUSES
        is_overdue = not is_closed and ((t.thoi_gian_con_lai is not None and t.thoi_gian_con_lai < 0) or (t.thoi_diem_yeu_cau_ket_thuc and t.thoi_diem_yeu_cau_ket_thuc < now))

        if is_closed:
            closed_wos += 1
            finish_time = t.thoi_diem_ft_hoan_thanh or t.thoi_diem_cd_dong
            if finish_time and finish_time >= today_start:
                closed_today_wos += 1
            elif finish_time and yesterday_start <= finish_time < today_start:
                closed_yesterday_wos += 1
        else:
            pending_wos += 1

        if is_overdue:
            overdue_wos += 1

        # Cabinets for this WO
        cabs = wo_cabinets_map.get(t.ma_cong_viec, [])
        t_cabs = len(cabs)
        comp_cabs = sum(1 for c in cabs if c["is_completed"])
        pend_cabs = t_cabs - comp_cabs

        # Aggregate Employee
        emp_entry = emp_map[emp_name]
        emp_entry["employee_id"] = emp_id
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
        grp_entry["group_id"] = grp_id
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

        wos_output.append({
            "ma_cong_viec": t.ma_cong_viec,
            "station_code": station_code,
            "loai_cong_viec": t.loai_cong_viec,
            "noi_dung_cong_viec": t.noi_dung_cong_viec or "",
            "ghi_chu": t.ghi_chu or "",
            "trang_thai": t.trang_thai or "Chưa rõ",
            "employee_assigned_name": emp_name,
            "group_name": grp_name,
            "thoi_diem_tao": t.thoi_diem_tao.isoformat() if t.thoi_diem_tao else None,
            "thoi_diem_yeu_cau_ket_thuc": t.thoi_diem_yeu_cau_ket_thuc.isoformat() if t.thoi_diem_yeu_cau_ket_thuc else None,
            "thoi_gian_con_lai": t.thoi_gian_con_lai,
            "is_closed": is_closed,
            "is_overdue": is_overdue,
            "total_cabinets": t_cabs,
            "completed_cabinets": comp_cabs,
            "pending_cabinets": pend_cabs,
            "cabinets": cabs,
        })

    # Total cabinets summary
    total_cabinets = sum(e["total_cabinets"] for e in emp_map.values())
    completed_cabinets = sum(e["completed_cabinets"] for e in emp_map.values())
    pending_cabinets = total_cabinets - completed_cabinets
    cabinet_rate = round((completed_cabinets / total_cabinets * 100), 1) if total_cabinets > 0 else 0.0
    wo_rate = round((closed_wos / total_wos * 100), 1) if total_wos > 0 else 0.0

    # Format by_employee list
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

    # Format by_group list
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
        "wos": wos_output,
    }


def get_codinh_meta_options(db: Session) -> Dict[str, Any]:
    """Returns available task types and systems to facilitate report creation in /admincodinh."""
    task_types = [
        r[0] for r in db.query(distinct(Task.loai_cong_viec))
        .filter(Task.loai_cong_viec != None, Task.loai_cong_viec != "")
        .order_by(Task.loai_cong_viec.asc()).all()
    ]
    systems = [
        r[0] for r in db.query(distinct(SystemModel.name))
        .filter(SystemModel.name != None, SystemModel.name != "")
        .order_by(SystemModel.name.asc()).all()
    ]
    return {
        "task_types": task_types,
        "systems": systems,
    }
