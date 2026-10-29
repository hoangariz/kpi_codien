import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, text, case, and_, or_, distinct
from sqlalchemy.orm import Session

from backend.database import is_sqlite
from backend.models.task_qlctkt import TaskQlctkt
from backend.models.import_log import ImportLog
from backend.services.codinh.base import BaseReport
from backend.services.codinh.org import get_org_lookup, get_org_version
from backend.services.codinh.importer_qlctkt import get_qlctkt_version
from backend.services.codinh.importer import _get_setting

_stats_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def clear_ton_tk_theo_ngay_cache():
    global _stats_cache
    with _cache_lock:
        _stats_cache.clear()


def normalize_target_date(d: Optional[str]) -> Optional[str]:
    if not d:
        return None
    s = str(d).strip().split("T")[0].split(" ")[0]
    if s.lower() in ("null", "undefined", "none", "", "all", "today", "latest", "now"):
        return None
    p_dash = s.split("-")
    if len(p_dash) == 3:
        if len(p_dash[0]) == 4:
            try:
                return f"{int(p_dash[0]):04d}-{int(p_dash[1]):02d}-{int(p_dash[2]):02d}"
            except Exception:
                pass
        elif len(p_dash[2]) == 4:
            try:
                return f"{int(p_dash[2]):04d}-{int(p_dash[1]):02d}-{int(p_dash[0]):02d}"
            except Exception:
                pass
    p_slash = s.split("/")
    if len(p_slash) == 3:
        if len(p_slash[2]) == 4:
            try:
                return f"{int(p_slash[2]):04d}-{int(p_slash[1]):02d}-{int(p_slash[0]):02d}"
            except Exception:
                pass
        elif len(p_slash[0]) == 4:
            try:
                return f"{int(p_slash[0]):04d}-{int(p_slash[1]):02d}-{int(p_slash[2]):02d}"
            except Exception:
                pass
    return s


def get_30_days_list(ref_date_str: str) -> List[str]:
    """Trả về danh sách 30 ngày từ ref_date lùi dần về quá khứ [D, D-1, ..., D-29]."""
    ref_dt = datetime.strptime(ref_date_str, "%Y-%m-%d")
    days = []
    for i in range(30):
        d = ref_dt - timedelta(days=i)
        days.append(d.strftime("%Y-%m-%d"))
    return days


class TonTkTheoNgayReport(BaseReport):
    key: str = "ton_tk_theo_ngay"
    title: str = "Tồn TK theo ngày"
    description: str = "Báo cáo phân tích công việc tồn triển khai (QLCTKT) phân bổ theo ngày tạo trong 30 ngày gần nhất"
    model_class = TaskQlctkt
    join_key_type: str = "full_name"
    time_param_type: str = "date"

    def get_available_dates(self, db: Session) -> List[str]:
        """Lấy danh sách các ngày có dữ liệu từ ngay_tao và ngay_ket_thuc_thuc_te."""
        dates = set()
        if is_sqlite:
            expr_tao = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_tao)
            expr_kt = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_ket_thuc_thuc_te)
        else:
            expr_tao = func.date_format(TaskQlctkt.ngay_tao, "%Y-%m-%d")
            expr_kt = func.date_format(TaskQlctkt.ngay_ket_thuc_thuc_te, "%Y-%m-%d")

        for r in db.query(distinct(expr_tao)).filter(TaskQlctkt.ngay_tao.isnot(None), TaskQlctkt.is_cskh_2022 == False).all():
            if r[0]:
                dates.add(r[0])
        for r in db.query(distinct(expr_kt)).filter(TaskQlctkt.ngay_ket_thuc_thuc_te.isnot(None), TaskQlctkt.is_cskh_2022 == False).all():
            if r[0]:
                dates.add(r[0])

        sorted_dates = sorted(list(dates), reverse=True)
        if not sorted_dates:
            vn_today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).strftime("%Y-%m-%d")
            sorted_dates = [vn_today]
        return sorted_dates

    def compute_stats(
        self,
        db: Session,
        target_date: Optional[str] = None,
        target_month: Optional[str] = None,
        now_override: Optional[datetime] = None,
        bypass_cache: bool = False,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        qlctkt_ver = get_qlctkt_version()
        org_ver = get_org_version()

        tz_vn = ZoneInfo("Asia/Ho_Chi_Minh")
        if now_override:
            now = now_override
        else:
            now = datetime.now(tz_vn).replace(tzinfo=None)

        available_dates = self.get_available_dates(db)
        norm_date = normalize_target_date(target_date)

        if norm_date:
            selected_date = norm_date
        else:
            today_str = now.strftime("%Y-%m-%d")
            if today_str in available_dates:
                selected_date = today_str
            else:
                selected_date = available_dates[0] if available_dates else today_str

        # 5-minute round bucket for cache key
        now_minute_bucket = (now.minute // 5) * 5
        time_bucket = f"{now.strftime('%Y%m%d%H')}{now_minute_bucket:02d}"
        cache_key = f"{self.key}_{selected_date}_qv{qlctkt_ver}_ov{org_ver}_{time_bucket}"

        with _cache_lock:
            if not bypass_cache and cache_key in _stats_cache:
                return _stats_cache[cache_key]

        # Tạo danh sách 30 ngày lùi về quá khứ từ selected_date
        past_30_days = get_30_days_list(selected_date)
        oldest_day = past_30_days[-1]  # D-29

        # Điều kiện Tồn: tien_do NOT IN ('Kết thúc', 'Cập nhật hồ sơ', 'Hủy') AND is_huy = False AND is_cskh_2022 = False
        cond_ton = and_(
            ~func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ", "Hủy", "huỷ"]),
            TaskQlctkt.is_huy == False,
            TaskQlctkt.is_cskh_2022 == False,
        )

        if is_sqlite:
            date_tao_expr = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_tao)
        else:
            date_tao_expr = func.date_format(TaskQlctkt.ngay_tao, "%Y-%m-%d")

        # Xây dựng truy vấn tổng hợp SQL cho 30 ngày + gt_30d + tong_ton
        query_cols = [
            TaskQlctkt.nv_key,
            func.sum(case((cond_ton, 1), else_=0)).label("tong_ton"),
        ]

        # 30 ngày
        for d_str in past_30_days:
            col_label = f"d_{d_str.replace('-', '_')}"
            c_day = and_(cond_ton, date_tao_expr == d_str)
            query_cols.append(func.sum(case((c_day, 1), else_=0)).label(col_label))

        # Cột tồn quá 30 ngày (cũ hơn ngày xa nhất trong 30 ngày)
        c_gt_30d = and_(cond_ton, date_tao_expr < oldest_day)
        query_cols.append(func.sum(case((c_gt_30d, 1), else_=0)).label("gt_30d"))

        agg_query = db.query(*query_cols).filter(TaskQlctkt.is_cskh_2022 == False).group_by(TaskQlctkt.nv_key)
        agg_rows = agg_query.all()

        # Tổ chức nhân sự CĐBR
        org = get_org_lookup(db)
        users_by_ho_ten = org.get("users_by_ho_ten", {})
        org_clusters = org["clusters"]
        org_teams = org["teams"]

        def _init_entry(key_name: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
            e = {
                "key_name": key_name,
                "so_nv": 0,
                "tong_ton": 0,
                "gt_30d": 0,
            }
            for d in past_30_days:
                e[f"d_{d.replace('-', '_')}"] = 0
            if extra:
                e.update(extra)
            return e

        def _bump_entry(target: Dict[str, Any], source: Dict[str, Any]):
            target["tong_ton"] += source.get("tong_ton", 0)
            target["gt_30d"] += source.get("gt_30d", 0)
            for d in past_30_days:
                col_key = f"d_{d.replace('-', '_')}"
                target[col_key] += source.get(col_key, 0)

        # Khởi tạo bản đồ Cụm
        cluster_map: Dict[Any, Dict[str, Any]] = {}
        for c in org_clusters:
            cid = c["id"]
            cluster_map[cid] = _init_entry(c["ten_cum"], {
                "cluster_id": cid,
                "ma_cum": c["ma_cum"],
                "ten_cum": c["ten_cum"],
                "sort_order": c["sort_order"],
                "is_other": False,
                "so_nv": 0,
            })

        other_cluster = _init_entry("Chưa phân cụm", {
            "cluster_id": None,
            "ma_cum": "OTHER",
            "ten_cum": "Chưa phân cụm",
            "sort_order": 99999,
            "is_other": True,
            "so_nv": 0,
        })

        # Khởi tạo bản đồ Đội
        team_map: Dict[Any, Dict[str, Any]] = {}
        for t in org_teams:
            tid = t["id"]
            cid = t.get("cluster_id")
            team_map[tid] = _init_entry(t["ten_doi"], {
                "team_id": tid,
                "cluster_id": cid,
                "ma_doi": t["ma_doi"],
                "ten_doi": t["ten_doi"],
                "ma_cum": t.get("ma_cum", ""),
                "ten_cum": t.get("ten_cum", ""),
                "sort_order": t["sort_order"],
                "is_other": False,
                "so_nv": 0,
            })

        other_team = _init_entry("Chưa phân đội", {
            "team_id": None,
            "cluster_id": None,
            "ma_doi": "OTHER",
            "ten_doi": "Chưa phân đội",
            "ma_cum": "OTHER",
            "ten_cum": "Chưa phân cụm",
            "sort_order": 99999,
            "is_other": True,
            "so_nv": 0,
        })

        # Khởi tạo danh sách Nhân viên từ danh mục tổ chức
        emp_map: Dict[str, Dict[str, Any]] = {}
        for ht_key, u in users_by_ho_ten.items():
            cid = u.get("cluster_id")
            tid = u.get("team_id")
            emp_map[ht_key] = _init_entry(u.get("ho_ten", ht_key), {
                "employee_id": u.get("employee_id"),
                "username": u.get("username", ""),
                "full_name": u.get("ho_ten", ht_key),
                "key_name": u.get("ho_ten", ht_key),
                "group_name": u.get("ten_doi", ""),
                "team_name": u.get("ten_doi", ""),
                "cluster_name": u.get("ten_cum", ""),
                "team_id": tid,
                "ten_doi": u.get("ten_doi", ""),
                "cluster_id": cid,
                "ma_cum": u.get("ma_cum", ""),
                "ten_cum": u.get("ten_cum", ""),
                "is_other": False,
                "so_nv": 1,
            })
            if tid in team_map:
                team_map[tid]["so_nv"] += 1
            if cid in cluster_map:
                cluster_map[cid]["so_nv"] += 1

        summary = _init_entry("Tất cả", {
            "so_nv": len(users_by_ho_ten),
            "report_key": self.key,
            "selected_date": selected_date,
        })

        # Nạp dữ liệu SQL tổng hợp vào nhân viên và cộng dồn lên cấp Đội, Cụm
        other_emp_counter = 0

        for r in agg_rows:
            nv_key = r[0]
            tong_ton_val = int(r[1] or 0)
            metrics = {
                "tong_ton": tong_ton_val,
            }
            # 30 ngày
            for idx, d_str in enumerate(past_30_days):
                col_key = f"d_{d_str.replace('-', '_')}"
                metrics[col_key] = int(r[2 + idx] or 0)
            # gt_30d
            metrics["gt_30d"] = int(r[2 + len(past_30_days)] or 0)

            _bump_entry(summary, metrics)

            if nv_key and nv_key in emp_map:
                emp_entry = emp_map[nv_key]
                _bump_entry(emp_entry, metrics)
                tid = emp_entry["team_id"]
                cid = emp_entry["cluster_id"]
                if tid in team_map:
                    _bump_entry(team_map[tid], metrics)
                if cid in cluster_map:
                    _bump_entry(cluster_map[cid], metrics)
            else:
                other_emp_counter += 1
                emp_key = nv_key or f"other_{other_emp_counter}"
                unmatched_emp_entry = _init_entry(nv_key or "Chưa phân đội", {
                    "employee_id": None,
                    "key_name": nv_key or "Chưa phân đội",
                    "full_name": nv_key or "Chưa phân đội",
                    "group_name": "Chưa phân đội",
                    "team_name": "Chưa phân đội",
                    "cluster_name": "Chưa phân cụm",
                    "team_id": None,
                    "ten_doi": "Chưa phân đội",
                    "cluster_id": None,
                    "ten_cum": "Chưa phân cụm",
                    "is_other": True,
                    "so_nv": 0,
                })
                _bump_entry(unmatched_emp_entry, metrics)
                emp_map[emp_key] = unmatched_emp_entry
                _bump_entry(other_team, metrics)
                _bump_entry(other_cluster, metrics)

        # Định dạng danh sách theo cấp
        by_cluster = [c for c in cluster_map.values()]
        by_cluster.sort(key=lambda x: x["sort_order"])
        if other_cluster["tong_ton"] > 0:
            by_cluster.append(other_cluster)

        by_team = [t for t in team_map.values()]
        by_team.sort(key=lambda x: (x.get("ma_cum") or "", x["sort_order"]))
        if other_team["tong_ton"] > 0:
            by_team.append(other_team)

        by_employee = list(emp_map.values())
        by_employee.sort(key=lambda x: (x.get("ten_cum") or "", x.get("ten_doi") or "", x["full_name"]))

        updated_at = _get_setting(db, "qlctkt_last_update_vn", now.strftime("%d/%m/%Y %H:%M"))

        # Danh sách cấu hình cột 30 ngày để frontend tự động render
        date_columns_meta = []
        for d_str in past_30_days:
            dt_obj = datetime.strptime(d_str, "%Y-%m-%d")
            col_key = f"d_{d_str.replace('-', '_')}"
            date_columns_meta.append({
                "key": col_key,
                "date": d_str,
                "label": dt_obj.strftime("%d/%m"),
                "full_date_vn": dt_obj.strftime("%d/%m/%Y"),
                "is_today": (d_str == now.strftime("%Y-%m-%d")),
                "day_of_week": dt_obj.weekday(),  # 5: T7, 6: CN
            })

        result = {
            "key": self.key,
            "title": self.title,
            "description": self.description,
            "selected_date": selected_date,
            "available_dates": available_dates,
            "past_30_days": past_30_days,
            "date_columns_meta": date_columns_meta,
            "summary": summary,
            "by_cluster": by_cluster,
            "by_team": by_team,
            "by_employee": by_employee,
            "last_data_update_vn": updated_at,
        }

        with _cache_lock:
            _stats_cache[cache_key] = result

        return result

    def get_drilldown(
        self,
        db: Session,
        target_month: Optional[str] = None,
        target_date: Optional[str] = None,
        metric: str = "tong_ton",
        filter_type: Optional[str] = None,
        filter_id: Optional[Any] = None,
        target_name: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: str = "asc",
        page: int = 1,
        page_size: int = 50,
        now_override: Optional[datetime] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        tz_vn = ZoneInfo("Asia/Ho_Chi_Minh")
        if now_override:
            now = now_override
        else:
            now = datetime.now(tz_vn).replace(tzinfo=None)

        norm_d = normalize_target_date(target_date or target_month)
        selected_date = norm_d or now.strftime("%Y-%m-%d")

        past_30_days = get_30_days_list(selected_date)
        oldest_day = past_30_days[-1]

        if is_sqlite:
            date_tao_expr = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_tao)
        else:
            date_tao_expr = func.date_format(TaskQlctkt.ngay_tao, "%Y-%m-%d")

        cond_ton = and_(
            ~func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ", "Hủy", "huỷ"]),
            TaskQlctkt.is_huy == False,
            TaskQlctkt.is_cskh_2022 == False,
        )

        q = db.query(TaskQlctkt).filter(TaskQlctkt.is_cskh_2022 == False, cond_ton)

        # Xử lý điều kiện theo metric
        m_low = (metric or "tong_ton").lower()
        if m_low.startswith("d_"):
            # Metric là cột ngày cụ thể, ví dụ d_2026_10_16 -> 2026-10-16
            day_target = m_low[2:].replace("_", "-")
            q = q.filter(date_tao_expr == day_target)
        elif m_low == "gt_30d":
            q = q.filter(date_tao_expr < oldest_day)
        # elif m_low == "tong_ton": filter cond_ton đã áp dụng

        # Lọc theo tổ chức (Cụm / Đội / Nhân viên)
        org = get_org_lookup(db)
        users_by_ho_ten = org.get("users_by_ho_ten", {})

        ft_low = (filter_type or "").lower()
        if ft_low in ("other_team", "other_cluster"):
            valid_ht_keys = list(users_by_ho_ten.keys())
            q = q.filter(or_(
                TaskQlctkt.nv_key == None,
                TaskQlctkt.nv_key == "",
                ~TaskQlctkt.nv_key.in_(valid_ht_keys)
            ))
        elif ft_low == "employee" and target_name:
            t_norm = target_name.strip()
            q = q.filter(TaskQlctkt.nv_key == t_norm)
        elif ft_low in ("team", "doi") and (filter_id or target_name):
            team_ht_keys = [k for k, u in users_by_ho_ten.items() if str(u.get("team_id")) == str(filter_id) or u.get("ten_doi") == target_name]
            q = q.filter(TaskQlctkt.nv_key.in_(team_ht_keys))
        elif ft_low in ("cluster", "cum") and (filter_id or target_name):
            cluster_ht_keys = [k for k, u in users_by_ho_ten.items() if str(u.get("cluster_id")) == str(filter_id) or u.get("ten_cum") == target_name]
            q = q.filter(TaskQlctkt.nv_key.in_(cluster_ht_keys))

        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            q = q.filter(or_(
                func.lower(TaskQlctkt.task_id).like(s),
                func.lower(TaskQlctkt.account).like(s),
                func.lower(TaskQlctkt.ten_khach_hang).like(s),
                func.lower(TaskQlctkt.nv_thuc_hien).like(s),
                func.lower(TaskQlctkt.tram).like(s),
                func.lower(TaskQlctkt.dich_vu).like(s),
                func.lower(TaskQlctkt.dia_chi_lap_dat).like(s),
            ))

        total_count = q.count()

        # Sắp xếp
        sb_low = (sort_by or "ngay_tao").lower()
        order_asc = (sort_order.lower() == "asc")

        col_map = {
            "task_id": TaskQlctkt.task_id,
            "ngay_tao": TaskQlctkt.ngay_tao,
            "ngay_giao": TaskQlctkt.ngay_giao,
            "tien_do": TaskQlctkt.tien_do,
            "nv_thuc_hien": TaskQlctkt.nv_thuc_hien,
            "tram": TaskQlctkt.tram,
            "so_gio_ton": TaskQlctkt.so_gio_ton,
            "account": TaskQlctkt.account,
            "ten_khach_hang": TaskQlctkt.ten_khach_hang,
        }
        order_col = col_map.get(sb_low, TaskQlctkt.ngay_tao)
        q = q.order_by(order_col.asc() if order_asc else order_col.desc())

        limit = min(page_size, 20000)
        offset = max(0, page - 1) * limit
        tasks = q.offset(offset).limit(limit).all()

        items = []
        for t in tasks:
            items.append({
                "task_id": t.task_id,
                "account": t.account,
                "ten_khach_hang": t.ten_khach_hang,
                "dich_vu": t.dich_vu,
                "loai_yeu_cau": t.loai_yeu_cau,
                "dia_chi_lap_dat": t.dia_chi_lap_dat,
                "to_doi_raw": t.to_doi_raw,
                "tram": t.tram,
                "tien_do": t.tien_do,
                "nv_thuc_hien": t.nv_thuc_hien,
                "ngay_tao": t.ngay_tao.strftime("%d/%m/%Y %H:%M:%S") if t.ngay_tao else None,
                "ngay_ket_thuc_thuc_te": t.ngay_ket_thuc_thuc_te.strftime("%d/%m/%Y %H:%M:%S") if t.ngay_ket_thuc_thuc_te else None,
                "so_gio_ton": t.so_gio_ton,
                "ghi_chu_dau_moi": t.ghi_chu_dau_moi,
                "ly_do_tich_huy": t.ly_do_tich_huy,
                "ngay_tich_huy": t.ngay_tich_huy,
                "tich_hen": t.tich_hen,
                "trang_thai_gpon": t.trang_thai_gpon,
                "cmtasktypename": t.cmtasktypename,
            })

        return {
            "source": "qlctkt",
            "report": self.key,
            "metric": metric,
            "date": selected_date,
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "items": items,
        }
