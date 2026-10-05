import io
import csv
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import func, distinct
from sqlalchemy.orm import Session

from backend.models.device_recall import DeviceRecall
from backend.models.settings import SystemSetting
from backend.config import BASE_DIR


def _set_setting(db: Session, key: str, value: str):
    item = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if item:
        item.value = value
        item.updated_at = datetime.utcnow()
    else:
        db.add(SystemSetting(key=key, value=value))
    db.commit()


def _get_setting(db: Session, key: str, default: str = "") -> str:
    item = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return item.value if item else default


def extract_short_cluster(cum_xa: str) -> str:
    """Rút gọn mã cụm xã, ví dụ: HTH-007-SGG -> SGG."""
    if not cum_xa:
        return ""
    parts = cum_xa.strip().split("-")
    if len(parts) >= 3:
        return parts[-1].strip().upper()
    return cum_xa.strip()


def parse_device_recall_text(content: str) -> tuple[List[dict], int, int]:
    """
    Phân tích nội dung file .txt dạng TSV có sẵn header.
    Loại bỏ các dòng không có 'Trung tâm Cụm xã'.
    Trả về: (records_to_insert, total_rows, skipped_no_cluster)
    """
    f = io.StringIO(content)
    reader = csv.reader(f, delimiter='\t')
    rows = list(reader)

    if not rows:
        return [], 0, 0

    header_row = rows[0]
    total_raw_rows = len(rows) - 1

    # Map column headers accurately with specific prioritization
    col_map = {
        "so_thue_bao": 0,
        "dich_vu": 1,
        "dia_chi_khach_hang": 2,
        "muc_thue_bao": 3,
        "muc_thiet_bi": 4,
        "tong_tbi_phai_thu": 5,
        "loai_thiet_bi": 6,
        "tuoi_tho_mesh": 7,
        "so_tbi_mesh_phai_thu": 8,
        "cum_xa": 9,
        "ten_ft": 10,
        "ma_nv": 11,
    }
    for idx, col in enumerate(header_row):
        c = str(col).strip().lower().replace('\n', ' ')
        if "tuổi thọ" in c:
            col_map["tuoi_tho_mesh"] = idx
        elif "số tbi mesh" in c or "mesh phải thu" in c:
            col_map["so_tbi_mesh_phai_thu"] = idx
        elif "mức thuê bao" in c:
            col_map["muc_thue_bao"] = idx
        elif "mức thiết bị" in c:
            col_map["muc_thiet_bi"] = idx
        elif "tổng tbi" in c or "tổng thiết bị" in c:
            col_map["tong_tbi_phai_thu"] = idx
        elif "số thuê bao" in c or c in ("số tb", "so_thue_bao", "thuê bao"):
            col_map["so_thue_bao"] = idx
        elif "tb thường" in c or "loại thiết bị" in c:
            col_map["loai_thiet_bi"] = idx
        elif "dịch vụ" in c or "dich_vu" in c:
            col_map["dich_vu"] = idx
        elif "địa chỉ" in c:
            col_map["dia_chi_khach_hang"] = idx
        elif "trung tâm cụm" in c or "cụm xã" in c:
            col_map["cum_xa"] = idx
        elif "tên ft" in c or "nhân viên" in c:
            col_map["ten_ft"] = idx
        elif "mnv" in c or "mã nv" in c:
            col_map["ma_nv"] = idx

    idx_stb = col_map["so_thue_bao"]
    idx_dv  = col_map["dich_vu"]
    idx_dc  = col_map["dia_chi_khach_hang"]
    idx_mtb = col_map["muc_thue_bao"]
    idx_mtbi= col_map["muc_thiet_bi"]
    idx_ttbi= col_map["tong_tbi_phai_thu"]
    idx_ltb = col_map["loai_thiet_bi"]
    idx_ttm = col_map["tuoi_tho_mesh"]
    idx_stbm= col_map["so_tbi_mesh_phai_thu"]
    idx_cum = col_map["cum_xa"]
    idx_ft  = col_map["ten_ft"]
    idx_mnv = col_map["ma_nv"]

    records = []
    skipped_no_cluster = 0
    now = datetime.utcnow()

    for row in rows[1:]:
        if not row:
            continue

        cum_xa = str(row[idx_cum]).strip() if len(row) > idx_cum else ""
        # YÊU CẦU: Xoá / bỏ qua các dòng không có Trung tâm Cụm xã
        if not cum_xa:
            skipped_no_cluster += 1
            continue

        stb = str(row[idx_stb]).strip() if len(row) > idx_stb else ""
        if not stb:
            continue

        dich_vu = str(row[idx_dv]).strip() if len(row) > idx_dv else None
        dia_chi = str(row[idx_dc]).strip() if len(row) > idx_dc else None
        muc_tb  = str(row[idx_mtb]).strip() if len(row) > idx_mtb else None
        muc_tbi = str(row[idx_mtbi]).strip() if len(row) > idx_mtbi else None

        # Tổng tbi phải thu (int)
        raw_ttbi = str(row[idx_ttbi]).strip() if len(row) > idx_ttbi else "0"
        try:
            tong_tbi = int(float(raw_ttbi))
        except Exception:
            tong_tbi = 0

        loai_tb  = str(row[idx_ltb]).strip() if len(row) > idx_ltb else None
        tuoi_tho = str(row[idx_ttm]).strip() if len(row) > idx_ttm else None
        stb_mesh = str(row[idx_stbm]).strip() if len(row) > idx_stbm else None
        ten_ft   = str(row[idx_ft]).strip() if len(row) > idx_ft else "Chưa gán FT"
        ma_nv    = str(row[idx_mnv]).strip() if len(row) > idx_mnv else None

        records.append({
            "so_thue_bao": stb,
            "dich_vu": dich_vu or None,
            "dia_chi_khach_hang": dia_chi or None,
            "muc_thue_bao": muc_tb or None,
            "muc_thiet_bi": muc_tbi or None,
            "tong_tbi_phai_thu": tong_tbi,
            "loai_thiet_bi": loai_tb or None,
            "tuoi_tho_mesh": tuoi_tho or None,
            "so_tbi_mesh_phai_thu": stb_mesh or None,
            "cum_xa": cum_xa,
            "ten_ft": ten_ft or "Chưa gán FT",
            "ma_nv": ma_nv or None,
            "created_at": now,
        })

    return records, total_raw_rows, skipped_no_cluster


def import_device_recall_content(db: Session, content: str, filename: str) -> dict:
    """
    Import danh sách thiết bị cần thu hồi từ chuỗi nội dung văn bản.
    Xóa sạch dữ liệu cũ và chèn danh sách mới.
    """
    records, total_rows, skipped_no_cluster = parse_device_recall_text(content)

    if not records:
        raise ValueError(
            "Không tìm thấy dòng dữ liệu hợp lệ nào có chứa 'Trung tâm Cụm xã'. "
            "Vui lòng kiểm tra lại định dạng file!"
        )

    # Gán filename
    for r in records:
        r["import_filename"] = filename

    # Xóa sạch dữ liệu cũ
    db.query(DeviceRecall).delete(synchronize_session=False)
    db.commit()

    # Bulk insert theo batch 1000 dòng
    BATCH_SIZE = 1000
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        db.bulk_insert_mappings(DeviceRecall, batch)
        db.commit()

    # Thống kê metadata
    unique_clusters = sorted(list(set(r["cum_xa"] for r in records)))
    unique_fts = sorted(list(set(r["ten_ft"] for r in records)))
    total_devices = sum(r["tong_tbi_phai_thu"] for r in records)

    now = datetime.utcnow()
    vn_now = now + timedelta(hours=7)
    vn_time_str = vn_now.strftime("%d/%m/%Y lúc %H:%M")

    _set_setting(db, "device_recall_last_import_time", now.isoformat())
    _set_setting(db, "device_recall_last_import_time_vn", vn_time_str)
    _set_setting(db, "device_recall_last_filename", filename)
    _set_setting(db, "device_recall_total_count", str(len(records)))
    _set_setting(db, "device_recall_skipped_count", str(skipped_no_cluster))
    _set_setting(db, "device_recall_clusters_count", str(len(unique_clusters)))
    _set_setting(db, "device_recall_fts_count", str(len(unique_fts)))
    _set_setting(db, "device_recall_total_devices", str(total_devices))

    return {
        "filename": filename,
        "total_raw_rows": total_rows,
        "valid_rows": len(records),
        "skipped_no_cluster": skipped_no_cluster,
        "total_clusters": len(unique_clusters),
        "total_fts": len(unique_fts),
        "total_devices": total_devices,
        "clusters": unique_clusters,
        "imported_at_vn": vn_time_str,
    }


def get_device_recall_clusters(db: Session) -> List[dict]:
    """
    Lấy danh sách các cụm UNIQUE trong Trung tâm Cụm xã cùng thống kê tổng quan.
    """
    # Group by cum_xa
    rows = (
        db.query(
            DeviceRecall.cum_xa,
            func.count(DeviceRecall.id).label("subscribers_count"),
            func.sum(DeviceRecall.tong_tbi_phai_thu).label("total_devices"),
            func.count(distinct(DeviceRecall.ten_ft)).label("fts_count"),
        )
        .group_by(DeviceRecall.cum_xa)
        .order_by(DeviceRecall.cum_xa)
        .all()
    )

    result = []
    for r in rows:
        cum_name = r.cum_xa
        short_code = extract_short_cluster(cum_name)
        result.append({
            "cum_xa": cum_name,
            "short_code": short_code,
            "subscribers_count": int(r.subscribers_count or 0),
            "total_devices": int(r.total_devices or 0),
            "fts_count": int(r.fts_count or 0),
        })

    return result


def get_device_recall_fts_by_cluster(db: Session, cluster: str) -> List[dict]:
    """
    Lấy danh sách các nhân viên (Tên FT, MNV) trong cụm được chọn.
    """
    if not cluster:
        return []

    rows = (
        db.query(
            DeviceRecall.ten_ft,
            DeviceRecall.ma_nv,
            func.count(DeviceRecall.id).label("subscribers_count"),
            func.sum(DeviceRecall.tong_tbi_phai_thu).label("total_devices"),
        )
        .filter(DeviceRecall.cum_xa == cluster)
        .group_by(DeviceRecall.ten_ft, DeviceRecall.ma_nv)
        .order_by(DeviceRecall.ten_ft)
        .all()
    )

    result = []
    for r in rows:
        result.append({
            "ten_ft": r.ten_ft,
            "ma_nv": r.ma_nv or "",
            "subscribers_count": int(r.subscribers_count or 0),
            "total_devices": int(r.total_devices or 0),
        })

    return result


def get_device_recall_items(
    db: Session,
    cluster: str,
    ft_name: Optional[str] = None,
    search: Optional[str] = None
) -> dict:
    """
    Lấy danh sách chi tiết các thiết bị cần thu hồi cho cụm và FT đã chọn.
    LƯU Ý: Không trả về Trung tâm Cụm xã, Tên FT, MNV trong mảng items theo yêu cầu.
    """
    if not cluster:
        return {
            "cluster": "",
            "ft_name": "",
            "items": [],
            "summary": {
                "total_subscribers": 0,
                "total_devices": 0,
                "mesh_devices": 0,
                "regular_devices": 0,
            }
        }

    query = db.query(DeviceRecall).filter(DeviceRecall.cum_xa == cluster)

    if ft_name:
        query = query.filter(DeviceRecall.ten_ft == ft_name)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (DeviceRecall.so_thue_bao.like(s)) |
            (DeviceRecall.dia_chi_khach_hang.like(s)) |
            (DeviceRecall.dich_vu.like(s))
        )

    items_db = query.order_by(DeviceRecall.tong_tbi_phai_thu.desc(), DeviceRecall.so_thue_bao.asc()).all()

    items = []
    total_devices = 0
    mesh_devices = 0
    regular_devices = 0

    for item in items_db:
        tbi_val = item.tong_tbi_phai_thu or 0
        total_devices += tbi_val

        is_mesh = (item.loai_thiet_bi and "mesh" in str(item.loai_thiet_bi).lower())
        if is_mesh:
            mesh_devices += tbi_val
        else:
            regular_devices += tbi_val

        items.append({
            "id": item.id,
            "so_thue_bao": item.so_thue_bao,
            "dich_vu": item.dich_vu or "-",
            "dia_chi_khach_hang": item.dia_chi_khach_hang or "-",
            "muc_thue_bao": item.muc_thue_bao or "-",
            "muc_thiet_bi": item.muc_thiet_bi or "-",
            "tong_tbi_phai_thu": tbi_val,
            "loai_thiet_bi": "MESH" if is_mesh else "Thường (0)",
            "loai_thiet_bi_raw": item.loai_thiet_bi or "-",
            "tuoi_tho_mesh": item.tuoi_tho_mesh or "-",
            "so_tbi_mesh_phai_thu": item.so_tbi_mesh_phai_thu or "-",
            "ma_nv": item.ma_nv or "",
            "ten_ft": item.ten_ft or "",
            "cum_xa": item.cum_xa or "",
        })

    return {
        "cluster": cluster,
        "ft_name": ft_name or "",
        "items": items,
        "summary": {
            "total_subscribers": len(items),
            "total_devices": total_devices,
            "mesh_devices": mesh_devices,
            "regular_devices": regular_devices,
        }
    }


def export_device_recall_csv(
    db: Session,
    cluster: str,
    ft_name: Optional[str] = None,
    search: Optional[str] = None
) -> str:
    """
    Xuất danh sách thiết bị cần thu hồi dưới dạng CSV (có UTF-8 BOM cho Excel).
    Bao gồm cột Mã nhân viên, Họ và tên theo yêu cầu.
    """
    data = get_device_recall_items(db, cluster=cluster, ft_name=ft_name, search=search)
    items = data.get("items", [])

    output = io.StringIO()
    # Ghi BOM UTF-8 để Microsoft Excel hiển thị tiếng Việt chuẩn
    output.write('\ufeff')
    writer = csv.writer(output)

    writer.writerow([
        "STT",
        "Mã nhân viên",
        "Họ và tên",
        "Cụm xã",
        "Số Thuê Bao",
        "Dịch Vụ",
        "Địa Chỉ Khách Hàng",
        "Mức Thuê Bao",
        "Mức Thiết Bị",
        "Tổng Tbi Phải Thu",
        "Loại Thiết Bị",
        "Tuổi Thọ Mesh",
        "Số Tbi Mesh Phải Thu",
    ])

    for idx, it in enumerate(items, 1):
        writer.writerow([
            idx,
            it.get("ma_nv", ""),
            it.get("ten_ft", ""),
            it.get("cum_xa", ""),
            it.get("so_thue_bao", ""),
            it.get("dich_vu", ""),
            it.get("dia_chi_khach_hang", ""),
            it.get("muc_thue_bao", ""),
            it.get("muc_thiet_bi", ""),
            it.get("tong_tbi_phai_thu", 0),
            it.get("loai_thiet_bi", ""),
            it.get("tuoi_tho_mesh", ""),
            it.get("so_tbi_mesh_phai_thu", ""),
        ])

    return output.getvalue()


def get_device_recall_meta(db: Session) -> dict:
    """Lấy thông tin metadata về lần cập nhật gần nhất."""
    total_count = _get_setting(db, "device_recall_total_count", "0")
    total_int = int(total_count) if total_count.isdigit() else 0

    # Auto-seed if empty and file exists
    if total_int == 0:
        file_path = BASE_DIR / "thuhoithietbi.txt"
        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                import_device_recall_content(db, content, "thuhoithietbi.txt")
                total_int = int(_get_setting(db, "device_recall_total_count", "0"))
            except Exception as e:
                print(f"Auto seed error: {e}")

    return {
        "last_import_time": _get_setting(db, "device_recall_last_import_time"),
        "last_import_time_vn": _get_setting(db, "device_recall_last_import_time_vn"),
        "filename": _get_setting(db, "device_recall_last_filename", "thuhoithietbi.txt"),
        "total_count": total_int,
        "clusters_count": int(_get_setting(db, "device_recall_clusters_count", "0")),
        "fts_count": int(_get_setting(db, "device_recall_fts_count", "0")),
        "total_devices": int(_get_setting(db, "device_recall_total_devices", "0")),
        "skipped_count": int(_get_setting(db, "device_recall_skipped_count", "0")),
    }
