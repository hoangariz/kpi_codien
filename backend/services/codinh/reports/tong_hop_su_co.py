import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_, distinct, text

from backend.database import is_sqlite
from backend.models.task_codinh import TaskCodinh
from backend.models.task_qlctkt import TaskQlctkt
from backend.models.import_log import ImportLog
from backend.services.codinh.base import BaseReport
from backend.services.codinh.org import get_org_lookup, get_org_version
from backend.services.codinh.importer import get_wo_version, _get_setting
from backend.services.codinh.importer_qlctkt import get_qlctkt_version
from backend.services.codinh.normalize import normalize_key
from backend.services.codinh.qlctkt_metrics import (
    get_qlctkt_ton_tk_condition,
    get_qlctkt_nghiem_thu_condition,
)

_stats_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def clear_tong_hop_su_co_cache():
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


def _init_su_co_entry(key_name: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entry = {
        "key_name": key_name,
        "so_nv": 0,
        "ton_truoc": 0,
        "phat_sinh": 0,
        "xu_ly": 0,
        "ton_su_co": 0,
        "nghiem_thu_n": 0,
        "ton_tk": 0,
        "ton_su_co_tk": 0,
        "tac_vu_dong_n": 0,
        "nsld": None,
        "lte_3h": 0,
        "h3_24": 0,
        "h24_48": 0,
        "h48_72": 0,
        "gt_72h": 0,
        "tam_dung": 0,
        "tong": 0,
        "hot": 0,
        "qua_han": 0,
    }
    if extra:
        entry.update(extra)
    return entry


def _bump_su_co_entry(target: Dict[str, Any], source: Dict[str, Any]):
    for k in (
        "ton_truoc",
        "phat_sinh",
        "xu_ly",
        "ton_su_co",
        "nghiem_thu_n",
        "ton_tk",
        "tac_vu_dong_n",
        "lte_3h",
        "h3_24",
        "h24_48",
        "h48_72",
        "gt_72h",
        "tam_dung",
        "tong",
        "hot",
        "qua_han",
    ):
        target[k] += source.get(k, 0)


def _finalize_entry_calculated_fields(entry: Dict[str, Any]):
    ton_su_co = entry.get("ton_su_co", 0)
    ton_tk = entry.get("ton_tk", 0)
    entry["ton_su_co_tk"] = ton_su_co + ton_tk
    entry["tong"] = ton_su_co

    so_nv = entry.get("so_nv", 0)
    tac_vu_dong_n = entry.get("tac_vu_dong_n", 0)
    nghiem_thu_n = entry.get("nghiem_thu_n", 0)
    if so_nv > 0:
        entry["nsld"] = round((tac_vu_dong_n + nghiem_thu_n) / float(so_nv), 2)
    else:
        entry["nsld"] = None


def get_gnoc_metric_condition(
    metric: str,
    selected_date: str,
    now: datetime,
) -> Any:
    """Hàm định nghĩa chung 100% điều kiện SQL cho GNOC giữa compute_stats và get_drilldown."""
    n0 = datetime.strptime(selected_date, "%Y-%m-%d")
    n1 = n0 + timedelta(days=1)
    month_prefix = f"{n0.year:04d}-{n0.month:02d}"

    start_col = TaskCodinh.thoi_diem_bat_dau_thuc_hien
    closed_time_col = func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong)

    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    if is_sqlite:
        cung_thang_expr = (func.strftime('%Y-%m', start_col) == month_prefix)
        aging_h_expr = (func.julianday(now_str) - func.julianday(start_col)) * 24.0
    else:
        cung_thang_expr = (func.date_format(start_col, '%Y-%m') == month_prefix)
        aging_h_expr = func.timestampdiff(text("SECOND"), start_col, func.str_to_date(now_str, "%Y-%m-%d %H:%i:%s")) / 3600.0

    cond_su_co = (TaskCodinh.is_su_co == 1)
    # Định nghĩa riêng cho báo cáo này: ĐÓNG = { 'Đóng' }, OPEN = mọi trạng thái khác
    cond_open = (TaskCodinh.trang_thai != "Đóng")
    cond_closed = (TaskCodinh.trang_thai == "Đóng")

    m = metric.lower()
    if m == "ton_truoc":
        return and_(
            cond_su_co,
            start_col < n0,
            or_(cond_open, closed_time_col >= n0)
        )
    elif m == "phat_sinh":
        return and_(
            cond_su_co,
            start_col >= n0,
            start_col < n1
        )
    elif m == "xu_ly":
        return and_(
            cond_su_co,
            cond_closed,
            closed_time_col >= n0,
            closed_time_col < n1,
            cung_thang_expr
        )
    elif m in ("ton_su_co", "tong"):
        return and_(
            cond_su_co,
            cond_open
        )
    elif m == "tac_vu_dong_n":
        return and_(
            cond_closed,
            closed_time_col >= n0,
            closed_time_col < n1,
            cung_thang_expr
        )
    elif m == "lte_3h":
        return and_(
            cond_su_co,
            cond_open,
            or_(start_col > now, aging_h_expr <= 3.0)
        )
    elif m == "h3_24":
        return and_(
            cond_su_co,
            cond_open,
            aging_h_expr > 3.0,
            aging_h_expr <= 24.0
        )
    elif m == "h24_48":
        return and_(
            cond_su_co,
            cond_open,
            aging_h_expr > 24.0,
            aging_h_expr <= 48.0
        )
    elif m == "h48_72":
        return and_(
            cond_su_co,
            cond_open,
            aging_h_expr > 48.0,
            aging_h_expr <= 72.0
        )
    elif m == "gt_72h":
        return and_(
            cond_su_co,
            cond_open,
            aging_h_expr > 72.0
        )
    elif m == "tam_dung":
        return and_(
            cond_su_co,
            cond_open,
            func.lower(func.trim(TaskCodinh.trang_thai)) == "tạm dừng"
        )
    elif m == "hot":
        return and_(
            cond_su_co,
            cond_open,
            func.lower(func.trim(func.coalesce(TaskCodinh.muc_do_uu_tien, ""))) == "hot"
        )
    elif m == "qua_han":
        return and_(
            cond_su_co,
            cond_open,
            func.coalesce(TaskCodinh.thoi_gian_con_lai_num, TaskCodinh.thoi_gian_con_lai) < 0
        )
    return None


class TongHopSuCoReport(BaseReport):
    key: str = "tong_hop_su_co"
    title: str = "Tổng Hợp Sự Cố"
    description: str = "Báo cáo tổng hợp sự cố và phối hợp triển khai cố định băng rộng theo ngày"
    model_class = TaskCodinh
    join_key_type: str = "username"
    time_param_type: str = "date"

    def get_available_dates(self, db: Session) -> List[str]:
        dates = set()
        if is_sqlite:
            expr_start = func.strftime("%Y-%m-%d", TaskCodinh.thoi_diem_bat_dau_thuc_hien)
            expr_closed = func.strftime("%Y-%m-%d", func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong))
            expr_ql_tao = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_tao)
            expr_ql_kt = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_ket_thuc_thuc_te)
        else:
            expr_start = func.date_format(TaskCodinh.thoi_diem_bat_dau_thuc_hien, "%Y-%m-%d")
            expr_closed = func.date_format(func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong), "%Y-%m-%d")
            expr_ql_tao = func.date_format(TaskQlctkt.ngay_tao, "%Y-%m-%d")
            expr_ql_kt = func.date_format(TaskQlctkt.ngay_ket_thuc_thuc_te, "%Y-%m-%d")

        try:
            for r in db.query(distinct(expr_start)).filter(TaskCodinh.thoi_diem_bat_dau_thuc_hien.isnot(None)).all():
                if r[0]:
                    dates.add(r[0])
            for r in db.query(distinct(expr_closed)).filter(func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong).isnot(None)).all():
                if r[0]:
                    dates.add(r[0])
        except Exception:
            pass

        try:
            for r in db.query(distinct(expr_ql_tao)).filter(TaskQlctkt.ngay_tao.isnot(None), TaskQlctkt.is_cskh_2022 == False).all():
                if r[0]:
                    dates.add(r[0])
            for r in db.query(distinct(expr_ql_kt)).filter(TaskQlctkt.ngay_ket_thuc_thuc_te.isnot(None), TaskQlctkt.is_cskh_2022 == False).all():
                if r[0]:
                    dates.add(r[0])
        except Exception:
            pass

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
        wo_ver = get_wo_version()
        qlctkt_ver = get_qlctkt_version()
        org_ver = get_org_version()

        tz_vn = ZoneInfo("Asia/Ho_Chi_Minh")
        if now_override:
            now = now_override
        else:
            now = datetime.now(tz_vn).replace(tzinfo=None)

        if not target_date and target_month and target_month != "all":
            if len(target_month.split("-")) == 3 or len(target_month.split("/")) == 3:
                target_date = target_month

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
        cache_key = f"{self.key}_{selected_date}_wv{wo_ver}_qv{qlctkt_ver}_ov{org_ver}_{time_bucket}"

        with _cache_lock:
            if not bypass_cache and cache_key in _stats_cache:
                return _stats_cache[cache_key]

        missing_sources = []
        total_gnoc_count = db.query(TaskCodinh).count()
        if total_gnoc_count == 0:
            missing_sources.append("gnoc")
        total_qlctkt_count = db.query(TaskQlctkt).count()
        if total_qlctkt_count == 0:
            missing_sources.append("qlctkt")

        # 1. SQL Conditional Aggregation for GNOC by employee username (func.lower(func.trim(TaskCodinh.nhan_vien)))
        emp_username_expr = func.lower(func.trim(func.coalesce(TaskCodinh.nhan_vien, "")))

        c_ton_truoc = get_gnoc_metric_condition("ton_truoc", selected_date, now)
        c_phat_sinh = get_gnoc_metric_condition("phat_sinh", selected_date, now)
        c_xu_ly = get_gnoc_metric_condition("xu_ly", selected_date, now)
        c_ton_su_co = get_gnoc_metric_condition("ton_su_co", selected_date, now)
        c_tac_vu_dong_n = get_gnoc_metric_condition("tac_vu_dong_n", selected_date, now)
        c_lte_3h = get_gnoc_metric_condition("lte_3h", selected_date, now)
        c_h3_24 = get_gnoc_metric_condition("h3_24", selected_date, now)
        c_h24_48 = get_gnoc_metric_condition("h24_48", selected_date, now)
        c_h48_72 = get_gnoc_metric_condition("h48_72", selected_date, now)
        c_gt_72h = get_gnoc_metric_condition("gt_72h", selected_date, now)
        c_tam_dung = get_gnoc_metric_condition("tam_dung", selected_date, now)
        c_hot = get_gnoc_metric_condition("hot", selected_date, now)
        c_qua_han = get_gnoc_metric_condition("qua_han", selected_date, now)

        gnoc_query = db.query(
            emp_username_expr.label("username_key"),
            func.sum(case((c_ton_truoc, 1), else_=0)).label("ton_truoc"),
            func.sum(case((c_phat_sinh, 1), else_=0)).label("phat_sinh"),
            func.sum(case((c_xu_ly, 1), else_=0)).label("xu_ly"),
            func.sum(case((c_ton_su_co, 1), else_=0)).label("ton_su_co"),
            func.sum(case((c_tac_vu_dong_n, 1), else_=0)).label("tac_vu_dong_n"),
            func.sum(case((c_lte_3h, 1), else_=0)).label("lte_3h"),
            func.sum(case((c_h3_24, 1), else_=0)).label("h3_24"),
            func.sum(case((c_h24_48, 1), else_=0)).label("h24_48"),
            func.sum(case((c_h48_72, 1), else_=0)).label("h48_72"),
            func.sum(case((c_gt_72h, 1), else_=0)).label("gt_72h"),
            func.sum(case((c_tam_dung, 1), else_=0)).label("tam_dung"),
            func.sum(case((c_hot, 1), else_=0)).label("hot"),
            func.sum(case((c_qua_han, 1), else_=0)).label("qua_han"),
        ).group_by(emp_username_expr)

        gnoc_rows = gnoc_query.all() if "gnoc" not in missing_sources else []

        # 2. SQL Conditional Aggregation for QLCTKT by nv_key (ho_ten_key)
        c_ql_ton_tk = get_qlctkt_ton_tk_condition()
        c_ql_nghiem_thu = get_qlctkt_nghiem_thu_condition(selected_date)

        qlctkt_query = db.query(
            TaskQlctkt.nv_key,
            func.sum(case((c_ql_nghiem_thu, 1), else_=0)).label("nghiem_thu_n"),
            func.sum(case((c_ql_ton_tk, 1), else_=0)).label("ton_tk"),
        ).filter(TaskQlctkt.is_cskh_2022 == False).group_by(TaskQlctkt.nv_key)

        qlctkt_rows = qlctkt_query.all() if "qlctkt" not in missing_sources else []

        # 3. Org lookup
        org = get_org_lookup(db)
        org_users = org["users"]  # username.lower() -> user info
        users_by_ho_ten = org.get("users_by_ho_ten", {})
        org_clusters = org["clusters"]
        org_teams = org["teams"]

        # Maps for Employee -> Team -> Cluster rollups
        cluster_map: Dict[Any, Dict[str, Any]] = {}
        for c in org_clusters:
            cid = c["id"]
            cluster_map[cid] = _init_su_co_entry(c["ten_cum"], {
                "cluster_id": cid,
                "ma_cum": c["ma_cum"],
                "ten_cum": c["ten_cum"],
                "sort_order": c["sort_order"],
                "is_other": False,
                "so_nv": 0,
            })

        other_cluster = _init_su_co_entry("Chưa phân cụm", {
            "cluster_id": None,
            "ma_cum": "OTHER",
            "ten_cum": "Chưa phân cụm",
            "sort_order": 99999,
            "is_other": True,
            "so_nv": 0,
        })

        team_map: Dict[Any, Dict[str, Any]] = {}
        for t in org_teams:
            tid = t["id"]
            team_map[tid] = _init_su_co_entry(t["ten_doi"], {
                "team_id": tid,
                "cluster_id": t["cluster_id"],
                "ma_doi": t["ma_doi"],
                "ten_doi": t["ten_doi"],
                "ma_cum": t.get("ma_cum", ""),
                "ten_cum": t.get("ten_cum", ""),
                "sort_order": t["sort_order"],
                "is_other": False,
                "so_nv": 0,
            })

        other_team = _init_su_co_entry("Chưa phân đội", {
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

        # Pre-populate all active employees from org directory (85 employees, so_nv = 1)
        emp_map: Dict[str, Dict[str, Any]] = {}
        # Mapping from ho_ten_key -> u_key (username.lower())
        ht_to_ukey: Dict[str, str] = {}

        for u_key, u in org_users.items():
            cid = u.get("cluster_id")
            tid = u.get("team_id")
            emp_map[u_key] = _init_su_co_entry(u.get("username", u_key), {
                "employee_id": u.get("employee_id"),
                "username": u.get("username", u_key),
                "full_name": u.get("ho_ten", u_key),
                "key_name": u.get("ho_ten", u.get("username", u_key)),
                "group_name": u.get("ten_doi", ""),
                "team_name": u.get("ten_doi", ""),
                "cluster_name": u.get("ten_cum", ""),
                "team_id": tid,
                "cluster_id": cid,
                "is_leader": u.get("is_leader", False),
                "is_other": False,
                "so_nv": 1,
            })
            if tid in team_map:
                team_map[tid]["so_nv"] += 1
            if cid in cluster_map:
                cluster_map[cid]["so_nv"] += 1

            ht_norm = normalize_key(u.get("ho_ten"))
            if ht_norm:
                ht_to_ukey[ht_norm] = u_key

        # 4. Integrate GNOC metrics by username
        other_gnoc_emp_map: Dict[str, Dict[str, Any]] = {}

        for row in gnoc_rows:
            ukey = (row.username_key or "").strip().lower()
            row_metrics = {
                "ton_truoc": int(row.ton_truoc or 0),
                "phat_sinh": int(row.phat_sinh or 0),
                "xu_ly": int(row.xu_ly or 0),
                "ton_su_co": int(row.ton_su_co or 0),
                "tac_vu_dong_n": int(row.tac_vu_dong_n or 0),
                "lte_3h": int(row.lte_3h or 0),
                "h3_24": int(row.h3_24 or 0),
                "h24_48": int(row.h24_48 or 0),
                "h48_72": int(row.h48_72 or 0),
                "gt_72h": int(row.gt_72h or 0),
                "tam_dung": int(row.tam_dung or 0),
                "tong": int(row.ton_su_co or 0),
                "hot": int(row.hot or 0),
                "qua_han": int(row.qua_han or 0),
            }

            if ukey in emp_map:
                _bump_su_co_entry(emp_map[ukey], row_metrics)
            else:
                # Unmatched username -> goes to other_team / other_cluster
                disp_name = row.username_key or "Chưa gán"
                if ukey not in other_gnoc_emp_map:
                    other_gnoc_emp_map[ukey] = _init_su_co_entry(disp_name, {
                        "employee_id": None,
                        "username": disp_name,
                        "full_name": disp_name,
                        "key_name": disp_name,
                        "group_name": "Chưa phân đội",
                        "team_name": "Chưa phân đội",
                        "cluster_name": "Chưa phân cụm",
                        "team_id": None,
                        "cluster_id": None,
                        "is_leader": False,
                        "is_other": True,
                        "so_nv": 0,
                    })
                _bump_su_co_entry(other_gnoc_emp_map[ukey], row_metrics)
                _bump_su_co_entry(other_team, row_metrics)
                _bump_su_co_entry(other_cluster, row_metrics)

        # 5. Integrate QLCTKT metrics by ho_ten_key
        other_ql_emp_map: Dict[str, Dict[str, Any]] = {}

        for row in qlctkt_rows:
            ht_key = (row.nv_key or "").strip().lower()
            row_metrics = {
                "nghiem_thu_n": int(row.nghiem_thu_n or 0),
                "ton_tk": int(row.ton_tk or 0),
            }

            # Map ht_key to u_key
            target_ukey = ht_to_ukey.get(ht_key)
            if not target_ukey and ht_key in users_by_ho_ten:
                u_info = users_by_ho_ten[ht_key]
                target_ukey = str(u_info.get("username", "")).strip().lower()

            if target_ukey and target_ukey in emp_map:
                _bump_su_co_entry(emp_map[target_ukey], row_metrics)
            else:
                # Unmatched QLCTKT employee -> other_team / other_cluster
                disp_name = row.nv_key or "Chưa gán"
                if ht_key not in other_ql_emp_map:
                    other_ql_emp_map[ht_key] = _init_su_co_entry(disp_name, {
                        "employee_id": None,
                        "username": disp_name,
                        "full_name": disp_name,
                        "key_name": disp_name,
                        "group_name": "Chưa phân đội",
                        "team_name": "Chưa phân đội",
                        "cluster_name": "Chưa phân cụm",
                        "team_id": None,
                        "cluster_id": None,
                        "is_leader": False,
                        "is_other": True,
                        "so_nv": 0,
                    })
                _bump_su_co_entry(other_ql_emp_map[ht_key], row_metrics)
                _bump_su_co_entry(other_team, row_metrics)
                _bump_su_co_entry(other_cluster, row_metrics)

        # 6. Rollup registered employees into Teams and Clusters
        for u_key, e in emp_map.items():
            _finalize_entry_calculated_fields(e)
            tid = e.get("team_id")
            cid = e.get("cluster_id")
            if tid in team_map:
                _bump_su_co_entry(team_map[tid], e)
            if cid in cluster_map:
                _bump_su_co_entry(cluster_map[cid], e)

        for e in other_gnoc_emp_map.values():
            _finalize_entry_calculated_fields(e)
        for e in other_ql_emp_map.values():
            _finalize_entry_calculated_fields(e)

        # 7. Finalize Teams, Clusters, and Summary
        summary = _init_su_co_entry("Tất cả", {
            "so_nv": 0,
        })

        for t in team_map.values():
            _finalize_entry_calculated_fields(t)
        _finalize_entry_calculated_fields(other_team)

        for c in cluster_map.values():
            _finalize_entry_calculated_fields(c)
            _bump_su_co_entry(summary, c)
            summary["so_nv"] += c.get("so_nv", 0)

        _finalize_entry_calculated_fields(other_cluster)
        _bump_su_co_entry(summary, other_cluster)
        _finalize_entry_calculated_fields(summary)

        # Build list results
        list_clusters = sorted(
            [c for c in cluster_map.values()],
            key=lambda x: x.get("sort_order", 0)
        )
        if any(other_cluster[k] > 0 for k in (
            "ton_truoc", "phat_sinh", "xu_ly", "ton_su_co", "nghiem_thu_n", "ton_tk", "tac_vu_dong_n"
        )):
            list_clusters.append(other_cluster)

        list_teams = sorted(
            [t for t in team_map.values()],
            key=lambda x: (x.get("cluster_id", 0), x.get("sort_order", 0))
        )
        if any(other_team[k] > 0 for k in (
            "ton_truoc", "phat_sinh", "xu_ly", "ton_su_co", "nghiem_thu_n", "ton_tk", "tac_vu_dong_n"
        )):
            list_teams.append(other_team)

        list_employees = sorted(
            list(emp_map.values()),
            key=lambda x: (x.get("cluster_id", 0) or 9999, x.get("team_id", 0) or 9999, not x.get("is_leader", False), x.get("full_name", ""))
        )
        for e in sorted(other_gnoc_emp_map.values(), key=lambda x: x.get("full_name", "")):
            list_employees.append(e)
        for e in sorted(other_ql_emp_map.values(), key=lambda x: x.get("full_name", "")):
            list_employees.append(e)

        # Set nulls if any source is completely missing
        if "gnoc" in missing_sources:
            for d in [summary] + list_clusters + list_teams + list_employees:
                for k in ("ton_truoc", "phat_sinh", "xu_ly", "ton_su_co", "tac_vu_dong_n", "lte_3h", "h3_24", "h24_48", "h48_72", "gt_72h", "tam_dung", "tong", "hot", "qua_han", "ton_su_co_tk", "nsld"):
                    d[k] = None
        if "qlctkt" in missing_sources:
            for d in [summary] + list_clusters + list_teams + list_employees:
                for k in ("nghiem_thu_n", "ton_tk", "ton_su_co_tk", "nsld"):
                    d[k] = None

        gnoc_log = db.query(ImportLog).filter(ImportLog.domain == "codinh", ImportLog.status == "COMPLETED").order_by(ImportLog.imported_at.desc()).first()
        qlctkt_log = db.query(ImportLog).filter(ImportLog.domain == "qlctkt", ImportLog.status == "COMPLETED").order_by(ImportLog.imported_at.desc()).first()

        gnoc_updated_at = gnoc_log.imported_at.strftime("%d/%m/%Y lúc %H:%M") if gnoc_log and gnoc_log.imported_at else None
        qlctkt_updated_at = qlctkt_log.imported_at.strftime("%d/%m/%Y lúc %H:%M") if qlctkt_log and qlctkt_log.imported_at else None

        result = {
            "key": self.key,
            "title": self.title,
            "date": selected_date,
            "available_dates": available_dates,
            "now": now.strftime("%Y-%m-%d %H:%M:%S"),
            "summary": summary,
            "by_cluster": list_clusters,
            "by_team": list_teams,
            "by_employee": list_employees,
            "gnoc_updated_at": gnoc_updated_at,
            "qlctkt_updated_at": qlctkt_updated_at,
            "missing_sources": missing_sources,
        }

        with _cache_lock:
            _stats_cache[cache_key] = result

        return result

    def get_drilldown(
        self,
        db: Session,
        target_date: Optional[str] = None,
        target_month: Optional[str] = None,
        metric: str = "ton_su_co",
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
        """Drilldown hỗ trợ cả nguồn GNOC và QLCTKT."""
        tz_vn = ZoneInfo("Asia/Ho_Chi_Minh")
        now = now_override or datetime.now(tz_vn).replace(tzinfo=None)
        norm_d = normalize_target_date(target_date or target_month)
        selected_date = norm_d or now.strftime("%Y-%m-%d")

        m_low = (metric or "ton_su_co").lower()

        # Route metric to source
        if m_low in ("nghiem_thu_n", "ton_tk"):
            source = "qlctkt"
        elif m_low == "ton_su_co_tk":
            sub_m = kwargs.get("sub_metric") or kwargs.get("sub_source")
            if sub_m in ("ton_tk", "qlctkt"):
                source = "qlctkt"
                m_low = "ton_tk"
            else:
                source = "gnoc"
                m_low = "ton_su_co"
        else:
            source = "gnoc"

        org = get_org_lookup(db)
        org_users = org["users"]
        users_by_ho_ten = org.get("users_by_ho_ten", {})

        ft_low = (filter_type or "").lower()

        # Handle QLCTKT Drilldown
        if source == "qlctkt":
            q_ql = db.query(TaskQlctkt).filter(TaskQlctkt.is_cskh_2022 == False)
            if m_low == "nghiem_thu_n":
                q_ql = q_ql.filter(get_qlctkt_nghiem_thu_condition(selected_date))
            elif m_low == "ton_tk":
                q_ql = q_ql.filter(get_qlctkt_ton_tk_condition())

            # Filter by hierarchy
            if ft_low in ("other_team", "other_cluster"):
                valid_ht_keys = list(users_by_ho_ten.keys())
                q_ql = q_ql.filter(or_(
                    TaskQlctkt.nv_key == None,
                    TaskQlctkt.nv_key == "",
                    ~TaskQlctkt.nv_key.in_(valid_ht_keys)
                ))
            elif ft_low == "employee" and target_name:
                t_norm = normalize_key(target_name)
                # Check if target_name is username or ho_ten
                u_info = org_users.get(t_norm)
                if u_info and u_info.get("ho_ten"):
                    ht_norm = normalize_key(u_info["ho_ten"])
                    q_ql = q_ql.filter(or_(TaskQlctkt.nv_key == t_norm, TaskQlctkt.nv_key == ht_norm))
                else:
                    q_ql = q_ql.filter(TaskQlctkt.nv_key == t_norm)
            elif ft_low in ("team", "doi") and (filter_id or target_name):
                team_ht_keys = [k for k, u in users_by_ho_ten.items() if str(u.get("team_id")) == str(filter_id) or u.get("ten_doi") == target_name]
                q_ql = q_ql.filter(TaskQlctkt.nv_key.in_(team_ht_keys))
            elif ft_low in ("cluster", "cum") and (filter_id or target_name):
                cluster_ht_keys = [k for k, u in users_by_ho_ten.items() if str(u.get("cluster_id")) == str(filter_id) or u.get("ten_cum") == target_name]
                q_ql = q_ql.filter(TaskQlctkt.nv_key.in_(cluster_ht_keys))

            if search and search.strip():
                s = f"%{search.strip().lower()}%"
                q_ql = q_ql.filter(or_(
                    func.lower(TaskQlctkt.task_id).like(s),
                    func.lower(TaskQlctkt.nv_thuc_hien).like(s),
                    func.lower(TaskQlctkt.ten_khach_hang).like(s),
                    func.lower(TaskQlctkt.account).like(s),
                    func.lower(TaskQlctkt.tram).like(s),
                ))

            total_count = q_ql.count()
            limit = min(page_size, 50000)
            offset = max(0, page - 1) * limit
            tasks = q_ql.offset(offset).limit(limit).all()

            items = []
            for t in tasks:
                items.append({
                    "task_id": t.task_id,
                    "so_hop_dong": t.account,
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

        # Handle GNOC Drilldown
        q_gnoc = db.query(TaskCodinh)
        cond = get_gnoc_metric_condition(m_low, selected_date, now)
        if cond is not None:
            q_gnoc = q_gnoc.filter(cond)

        emp_username_expr = func.lower(func.trim(func.coalesce(TaskCodinh.nhan_vien, "")))

        if ft_low in ("other_team", "other_cluster"):
            valid_usernames = list(org_users.keys())
            q_gnoc = q_gnoc.filter(or_(
                TaskCodinh.nhan_vien == None,
                TaskCodinh.nhan_vien == "",
                ~emp_username_expr.in_(valid_usernames)
            ))
        elif ft_low == "employee" and target_name:
            t_norm = normalize_key(target_name)
            # Find username if target_name is full name
            matched_u = [k for k, u in org_users.items() if k == t_norm or normalize_key(u.get("ho_ten")) == t_norm]
            if matched_u:
                q_gnoc = q_gnoc.filter(emp_username_expr.in_(matched_u))
            else:
                q_gnoc = q_gnoc.filter(emp_username_expr == t_norm)
        elif ft_low in ("team", "doi") and (filter_id or target_name):
            team_usernames = [k for k, u in org_users.items() if str(u.get("team_id")) == str(filter_id) or u.get("ten_doi") == target_name]
            q_gnoc = q_gnoc.filter(emp_username_expr.in_(team_usernames))
        elif ft_low in ("cluster", "cum") and (filter_id or target_name):
            cluster_usernames = [k for k, u in org_users.items() if str(u.get("cluster_id")) == str(filter_id) or u.get("ten_cum") == target_name]
            q_gnoc = q_gnoc.filter(emp_username_expr.in_(cluster_usernames))

        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            q_gnoc = q_gnoc.filter(or_(
                func.lower(TaskCodinh.ma_cong_viec).like(s),
                func.lower(TaskCodinh.loai_cong_viec).like(s),
                func.lower(TaskCodinh.noi_dung_cong_viec).like(s),
                func.lower(TaskCodinh.nhan_vien).like(s),
                func.lower(TaskCodinh.ma_tram).like(s),
                func.lower(TaskCodinh.trang_thai).like(s),
            ))

        total_count = q_gnoc.count()
        limit = min(page_size, 50000)
        offset = max(0, page - 1) * limit
        tasks = q_gnoc.offset(offset).limit(limit).all()

        items = []
        for t in tasks:
            items.append({
                "ma_cong_viec": t.ma_cong_viec,
                "loai_cong_viec": t.loai_cong_viec,
                "noi_dung_cong_viec": t.noi_dung_cong_viec,
                "trang_thai": t.trang_thai,
                "nhan_vien": t.nhan_vien,
                "employee_assigned_name": t.nhan_vien,
                "employee_username": t.nhan_vien,
                "nhom": t.nhom,
                "group_name": t.nhom,
                "ma_tram": t.ma_tram,
                "station_code": t.ma_tram,
                "muc_do_uu_tien": t.muc_do_uu_tien,
                "thoi_diem_tao": t.thoi_diem_tao.strftime("%d/%m/%Y %H:%M:%S") if t.thoi_diem_tao else None,
                "thoi_diem_bat_dau_thuc_hien": t.thoi_diem_bat_dau_thuc_hien.strftime("%d/%m/%Y %H:%M:%S") if t.thoi_diem_bat_dau_thuc_hien else None,
                "thoi_diem_yeu_cau_ket_thuc": (t.thoi_diem_cd_dong or t.thoi_diem_ft_hoan_thanh).strftime("%d/%m/%Y %H:%M:%S") if (t.thoi_diem_cd_dong or t.thoi_diem_ft_hoan_thanh) else None,
                "thoi_gian_con_lai": t.thoi_gian_con_lai_num if t.thoi_gian_con_lai_num is not None else t.thoi_gian_con_lai,
                "thoi_diem_ft_hoan_thanh": t.thoi_diem_ft_hoan_thanh.strftime("%d/%m/%Y %H:%M:%S") if t.thoi_diem_ft_hoan_thanh else None,
                "thoi_diem_cd_dong": t.thoi_diem_cd_dong.strftime("%d/%m/%Y %H:%M:%S") if t.thoi_diem_cd_dong else None,
                "cabinets": [],
            })

        return {
            "source": "gnoc",
            "report": self.key,
            "metric": metric,
            "date": selected_date,
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "items": items,
        }
