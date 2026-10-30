import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_, distinct, text

from backend.database import is_sqlite
from backend.models.task_qlctkt import TaskQlctkt
from backend.services.codinh.base import BaseReport
from backend.services.codinh.org import get_org_lookup, get_org_version
from backend.services.codinh.importer_qlctkt import get_qlctkt_version, _get_setting
from backend.services.codinh.normalize import normalize_key

_stats_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def clear_qlctkt_stats_cache():
    global _stats_cache
    with _cache_lock:
        _stats_cache.clear()


def _init_qlctkt_entry(key_name: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entry = {
        "key_name": key_name,
        "so_nv": 0,
        "cap_nhat_ho_so": 0,
        "nghiem_thu_n": 0,
        "dd_nghiem_thu_n": 0,
        "dau_noi_n": 0,
        "nsld": 0.0,
        "ton_duong_day": 0,
        "ton_duong_day_th": 0,
        "ton_ldtb": 0,
        "ton_ldtb_th": 0,
        "ton_lt1": 0,
        "ton_lt2": 0,
        "ton_lt3": 0,
        "ton_gt3": 0,
        "tong_ton": 0,
        "qua_han": 0,
        "huy": 0,
    }
    if extra:
        entry.update(extra)
    return entry


def _bump_qlctkt_entry(target: Dict[str, Any], source: Dict[str, Any]):
    for k in (
        "cap_nhat_ho_so",
        "nghiem_thu_n",
        "dd_nghiem_thu_n",
        "dau_noi_n",
        "ton_duong_day",
        "ton_duong_day_th",
        "ton_ldtb",
        "ton_ldtb_th",
        "ton_lt1",
        "ton_lt2",
        "ton_lt3",
        "ton_gt3",
        "tong_ton",
        "qua_han",
        "huy",
    ):
        target[k] += source.get(k, 0)


def _calc_nsld(entry: Dict[str, Any]):
    so_nv = entry.get("so_nv", 0)
    nghiem_thu_n = entry.get("nghiem_thu_n", 0)
    if so_nv > 0:
        entry["nsld"] = round(nghiem_thu_n / so_nv, 2)
    else:
        entry["nsld"] = None


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


class QlctktTrienKhaiReport(BaseReport):
    key: str = "qlctkt_trien_khai"
    title: str = "Tổng Hợp TK"
    description: str = "Báo cáo tổng hợp chi tiết công việc triển khai cố định theo ngày"
    model_class = TaskQlctkt
    join_key_type: str = "ho_ten"
    time_param_type: str = "date"

    def get_available_dates(self, db: Session) -> List[str]:
        """Returns distinct dates available from ngay_tao and ngay_ket_thuc_thuc_te."""
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

        # Current datetime in Asia/Ho_Chi_Minh timezone
        tz_vn = ZoneInfo("Asia/Ho_Chi_Minh")
        if now_override:
            now = now_override
        else:
            now = datetime.now(tz_vn).replace(tzinfo=None)

        # Handle target_month if target_date was not passed
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
        cache_key = f"{self.key}_{selected_date}_qv{qlctkt_ver}_ov{org_ver}_{time_bucket}"

        with _cache_lock:
            if not bypass_cache and cache_key in _stats_cache:
                return _stats_cache[cache_key]

        # 1. SQL Conditional Aggregation by nv_key
        # Definition of Tồn: tien_do NOT IN ('Kết thúc', 'Cập nhật hồ sơ', 'Hủy') AND is_huy = False AND is_cskh_2022 = False
        cond_ton = and_(
            ~func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ", "Hủy", "huỷ"]),
            TaskQlctkt.is_huy == False,
            TaskQlctkt.is_cskh_2022 == False,
        )

        now_str = now.strftime("%Y-%m-%d %H:%M:%S")
        if is_sqlite:
            age_hours_expr = (func.julianday(now_str) - func.julianday(TaskQlctkt.ngay_tao)) * 24.0
            date_tao_expr = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_tao)
            date_kt_tt_expr = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_ket_thuc_thuc_te)
        else:
            age_hours_expr = func.timestampdiff(text("SECOND"), TaskQlctkt.ngay_tao, func.str_to_date(now_str, "%Y-%m-%d %H:%i:%s")) / 3600.0
            date_tao_expr = func.date_format(TaskQlctkt.ngay_tao, "%Y-%m-%d")
            date_kt_tt_expr = func.date_format(TaskQlctkt.ngay_ket_thuc_thuc_te, "%Y-%m-%d")

        query = db.query(
            TaskQlctkt.nv_key,
            func.sum(case((and_(func.trim(TaskQlctkt.tien_do).in_(["Cập nhật hồ sơ", "cập nhật hồ sơ"]), TaskQlctkt.is_cskh_2022 == False), 1), else_=0)).label("cap_nhat_ho_so"),
            func.sum(case((and_(func.trim(TaskQlctkt.tien_do).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ"]), date_kt_tt_expr == selected_date, TaskQlctkt.is_cskh_2022 == False), 1), else_=0)).label("nghiem_thu_n"),
            func.sum(case((and_(func.trim(TaskQlctkt.tien_do).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ"]), date_kt_tt_expr == selected_date, TaskQlctkt.is_duong_day_moi == True, TaskQlctkt.is_cskh_2022 == False), 1), else_=0)).label("dd_nghiem_thu_n"),
            func.sum(case((and_(date_tao_expr == selected_date, TaskQlctkt.is_cskh_2022 == False), 1), else_=0)).label("dau_noi_n"),
            func.sum(case((and_(cond_ton, TaskQlctkt.is_duong_day_moi == True), 1), else_=0)).label("ton_duong_day"),
            func.sum(case((and_(cond_ton, TaskQlctkt.is_duong_day_moi == True, TaskQlctkt.is_tich_hen_ok == True), 1), else_=0)).label("ton_duong_day_th"),
            func.sum(case((and_(cond_ton, or_(TaskQlctkt.is_duong_day_moi == False, TaskQlctkt.is_duong_day_moi == None)), 1), else_=0)).label("ton_ldtb"),
            func.sum(case((and_(cond_ton, or_(TaskQlctkt.is_duong_day_moi == False, TaskQlctkt.is_duong_day_moi == None), TaskQlctkt.is_tich_hen_ok == True), 1), else_=0)).label("ton_ldtb_th"),
            func.sum(case((and_(cond_ton, age_hours_expr < 24.0), 1), else_=0)).label("ton_lt1"),
            func.sum(case((and_(cond_ton, age_hours_expr >= 24.0, age_hours_expr < 48.0), 1), else_=0)).label("ton_lt2"),
            func.sum(case((and_(cond_ton, age_hours_expr >= 48.0, age_hours_expr < 72.0), 1), else_=0)).label("ton_lt3"),
            func.sum(case((and_(cond_ton, age_hours_expr >= 72.0), 1), else_=0)).label("ton_gt3"),
            func.sum(case((cond_ton, 1), else_=0)).label("tong_ton"),
            func.sum(case((and_(cond_ton, TaskQlctkt.so_gio_ton.isnot(None), TaskQlctkt.so_gio_ton > 0), 1), else_=0)).label("qua_han"),
            func.sum(case((and_(TaskQlctkt.is_huy == True, ~func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_(["Kết thúc", "kết thúc"]), TaskQlctkt.is_cskh_2022 == False), 1), else_=0)).label("huy"),
        ).filter(TaskQlctkt.is_cskh_2022 == False).group_by(TaskQlctkt.nv_key)

        agg_rows = query.all()

        # 2. Org lookup
        org = get_org_lookup(db)
        users_by_ho_ten = org.get("users_by_ho_ten", {})
        org_clusters = org["clusters"]
        org_teams = org["teams"]

        # Maps for Employee -> Team -> Cluster rollups
        cluster_map: Dict[Any, Dict[str, Any]] = {}
        for c in org_clusters:
            cid = c["id"]
            cluster_map[cid] = _init_qlctkt_entry(c["ten_cum"], {
                "cluster_id": cid,
                "ma_cum": c["ma_cum"],
                "ten_cum": c["ten_cum"],
                "sort_order": c["sort_order"],
                "is_other": False,
                "so_nv": 0,
            })

        other_cluster = _init_qlctkt_entry("Chưa phân cụm", {
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
            team_map[tid] = _init_qlctkt_entry(t["ten_doi"], {
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

        other_team = _init_qlctkt_entry("Chưa phân đội", {
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

        # Pre-populate active employees from org directory (so 0-WO employees appear)
        emp_map: Dict[str, Dict[str, Any]] = {}
        for ht_key, u in users_by_ho_ten.items():
            cid = u.get("cluster_id")
            tid = u.get("team_id")
            emp_map[ht_key] = _init_qlctkt_entry(u["ho_ten"], {
                "employee_id": u["employee_id"],
                "key_name": u["ho_ten"],
                "full_name": u["ho_ten"],
                "username": u["username"],
                "nv_key": ht_key,
                "is_leader": u.get("is_leader", False),
                "team_id": tid,
                "ma_doi": u.get("ma_doi", ""),
                "ten_doi": u.get("ten_doi", ""),
                "cluster_id": cid,
                "ma_cum": u.get("ma_cum", ""),
                "ten_cum": u.get("ten_cum", ""),
                "is_other": False,
                "so_nv": 1,
            })
            # Increment so_nv in team and cluster
            if tid in team_map:
                team_map[tid]["so_nv"] += 1
            if cid in cluster_map:
                cluster_map[cid]["so_nv"] += 1

        # Summary entry
        summary = _init_qlctkt_entry("Tất cả", {
            "so_nv": len(users_by_ho_ten),
            "report_key": self.key,
            "selected_date": selected_date,
        })

        # 3. Ingest SQL aggregated rows into employee entries and bump upwards
        other_emp_counter = 0

        for r in agg_rows:
            nv_key = r[0]
            metrics = {
                "cap_nhat_ho_so": int(r[1] or 0),
                "nghiem_thu_n": int(r[2] or 0),
                "dd_nghiem_thu_n": int(r[3] or 0),
                "dau_noi_n": int(r[4] or 0),
                "ton_duong_day": int(r[5] or 0),
                "ton_duong_day_th": int(r[6] or 0),
                "ton_ldtb": int(r[7] or 0),
                "ton_ldtb_th": int(r[8] or 0),
                "ton_lt1": int(r[9] or 0),
                "ton_lt2": int(r[10] or 0),
                "ton_lt3": int(r[11] or 0),
                "ton_gt3": int(r[12] or 0),
                "tong_ton": int(r[13] or 0),
                "qua_han": int(r[14] or 0),
                "huy": int(r[15] or 0),
            }

            _bump_qlctkt_entry(summary, metrics)

            if nv_key and nv_key in emp_map:
                emp_entry = emp_map[nv_key]
                _bump_qlctkt_entry(emp_entry, metrics)
                tid = emp_entry["team_id"]
                cid = emp_entry["cluster_id"]
                if tid in team_map:
                    _bump_qlctkt_entry(team_map[tid], metrics)
                if cid in cluster_map:
                    _bump_qlctkt_entry(cluster_map[cid], metrics)
            else:
                # Unmatched name or duplicate name -> Chưa phân đội / Chưa phân cụm
                other_emp_counter += 1
                emp_key = nv_key or f"other_{other_emp_counter}"
                unmatched_emp_entry = _init_qlctkt_entry(nv_key or "Chưa phân đội", {
                    "employee_id": None,
                    "key_name": nv_key or "Chưa phân đội",
                    "full_name": nv_key or "Chưa phân đội",
                    "username": None,
                    "nv_key": nv_key,
                    "is_leader": False,
                    "team_id": None,
                    "ma_doi": "OTHER",
                    "ten_doi": "Chưa phân đội",
                    "cluster_id": None,
                    "ma_cum": "OTHER",
                    "ten_cum": "Chưa phân cụm",
                    "is_other": True,
                    "so_nv": 0,
                })
                _bump_qlctkt_entry(unmatched_emp_entry, metrics)
                _calc_nsld(unmatched_emp_entry)
                emp_map[emp_key] = unmatched_emp_entry

                _bump_qlctkt_entry(other_team, metrics)
                _bump_qlctkt_entry(other_cluster, metrics)

        # 4. Finalize NSLĐ for all entries
        for emp_entry in emp_map.values():
            _calc_nsld(emp_entry)

        for t_entry in team_map.values():
            _calc_nsld(t_entry)
        _calc_nsld(other_team)

        for c_entry in cluster_map.values():
            _calc_nsld(c_entry)
        _calc_nsld(other_cluster)

        _calc_nsld(summary)

        # 5. Format lists
        by_cluster = [c for c in cluster_map.values()]
        by_cluster.sort(key=lambda x: x["sort_order"])
        if other_cluster["tong_ton"] > 0 or other_cluster["nghiem_thu_n"] > 0 or other_cluster["huy"] > 0 or other_cluster["dau_noi_n"] > 0 or other_cluster["cap_nhat_ho_so"] > 0:
            by_cluster.append(other_cluster)

        by_team = [t for t in team_map.values()]
        by_team.sort(key=lambda x: (x.get("ma_cum") or "", x["sort_order"]))
        if other_team["tong_ton"] > 0 or other_team["nghiem_thu_n"] > 0 or other_team["huy"] > 0 or other_team["dau_noi_n"] > 0 or other_team["cap_nhat_ho_so"] > 0:
            by_team.append(other_team)

        by_employee = list(emp_map.values())
        by_employee.sort(key=lambda x: (x.get("ten_cum") or "", x.get("ten_doi") or "", x["full_name"]))

        updated_at = _get_setting(db, "qlctkt_last_update_vn", now.strftime("%d/%m/%Y %H:%M"))

        result = {
            "key": self.key,
            "title": self.title,
            "description": self.description,
            "selected_date": selected_date,
            "available_dates": available_dates,
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

        now_str = now.strftime("%Y-%m-%d %H:%M:%S")
        if is_sqlite:
            age_hours_expr = (func.julianday(now_str) - func.julianday(TaskQlctkt.ngay_tao)) * 24.0
            date_tao_expr = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_tao)
            date_kt_tt_expr = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_ket_thuc_thuc_te)
        else:
            age_hours_expr = func.timestampdiff(text("SECOND"), TaskQlctkt.ngay_tao, func.str_to_date(now_str, "%Y-%m-%d %H:%i:%s")) / 3600.0
            date_tao_expr = func.date_format(TaskQlctkt.ngay_tao, "%Y-%m-%d")
            date_kt_tt_expr = func.date_format(TaskQlctkt.ngay_ket_thuc_thuc_te, "%Y-%m-%d")

        cond_ton = and_(
            ~func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ", "Hủy", "huỷ"]),
            TaskQlctkt.is_huy == False,
            TaskQlctkt.is_cskh_2022 == False,
        )

        q = db.query(TaskQlctkt).filter(TaskQlctkt.is_cskh_2022 == False)

        # 1. Metric filter
        m_low = (metric or "tong_ton").lower()
        if m_low == "cap_nhat_ho_so":
            q = q.filter(func.trim(TaskQlctkt.tien_do).in_(["Cập nhật hồ sơ", "cập nhật hồ sơ"]))
        elif m_low == "nghiem_thu_n":
            q = q.filter(func.trim(TaskQlctkt.tien_do).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ"]), date_kt_tt_expr == selected_date)
        elif m_low == "dd_nghiem_thu_n":
            q = q.filter(func.trim(TaskQlctkt.tien_do).in_(["Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ"]), date_kt_tt_expr == selected_date, TaskQlctkt.is_duong_day_moi == True)
        elif m_low == "dau_noi_n":
            q = q.filter(date_tao_expr == selected_date)
        elif m_low == "ton_duong_day":
            q = q.filter(cond_ton, TaskQlctkt.is_duong_day_moi == True)
        elif m_low == "ton_duong_day_th":
            q = q.filter(cond_ton, TaskQlctkt.is_duong_day_moi == True, TaskQlctkt.is_tich_hen_ok == True)
        elif m_low == "ton_ldtb":
            q = q.filter(cond_ton, or_(TaskQlctkt.is_duong_day_moi == False, TaskQlctkt.is_duong_day_moi == None))
        elif m_low == "ton_ldtb_th":
            q = q.filter(cond_ton, or_(TaskQlctkt.is_duong_day_moi == False, TaskQlctkt.is_duong_day_moi == None), TaskQlctkt.is_tich_hen_ok == True)
        elif m_low == "ton_lt1":
            q = q.filter(cond_ton, age_hours_expr < 24.0)
        elif m_low == "ton_lt2":
            q = q.filter(cond_ton, age_hours_expr >= 24.0, age_hours_expr < 48.0)
        elif m_low == "ton_lt3":
            q = q.filter(cond_ton, age_hours_expr >= 48.0, age_hours_expr < 72.0)
        elif m_low == "ton_gt3":
            q = q.filter(cond_ton, age_hours_expr >= 72.0)
        elif m_low in ("tong_ton", "ton", "total"):
            q = q.filter(cond_ton)
        elif m_low == "qua_han":
            q = q.filter(cond_ton, TaskQlctkt.so_gio_ton.isnot(None), TaskQlctkt.so_gio_ton > 0)
        elif m_low == "huy":
            q = q.filter(TaskQlctkt.is_huy == True, ~func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_(["Kết thúc", "kết thúc"]))

        # 2. Org hierarchy filter
        org = get_org_lookup(db)
        users_by_ho_ten = org.get("users_by_ho_ten", {})
        ft_low = (filter_type or "").lower()

        if ft_low in ("other_team", "other_cluster"):
            valid_keys = list(users_by_ho_ten.keys())
            q = q.filter(or_(
                TaskQlctkt.nv_key == None,
                TaskQlctkt.nv_key == "",
                ~TaskQlctkt.nv_key.in_(valid_keys)
            ))
        elif ft_low == "employee" and target_name:
            t_norm = normalize_key(target_name)
            q = q.filter(TaskQlctkt.nv_key == t_norm)
        elif ft_low in ("team", "doi") and (filter_id or target_name):
            team_keys = [k for k, u in users_by_ho_ten.items() if str(u.get("team_id")) == str(filter_id) or u.get("ten_doi") == target_name]
            q = q.filter(TaskQlctkt.nv_key.in_(team_keys))
        elif ft_low in ("cluster", "cum") and (filter_id or target_name):
            cluster_keys = [k for k, u in users_by_ho_ten.items() if str(u.get("cluster_id")) == str(filter_id) or u.get("ten_cum") == target_name]
            q = q.filter(TaskQlctkt.nv_key.in_(cluster_keys))

        # 3. Search filter
        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            q = q.filter(or_(
                func.lower(TaskQlctkt.task_id).like(s),
                func.lower(TaskQlctkt.nv_thuc_hien).like(s),
                func.lower(TaskQlctkt.ten_khach_hang).like(s),
                func.lower(TaskQlctkt.account).like(s),
                func.lower(TaskQlctkt.tram).like(s),
                func.lower(TaskQlctkt.ghi_chu_dau_moi).like(s),
                func.lower(TaskQlctkt.ly_do_tich_huy).like(s),
                func.lower(TaskQlctkt.cmtasktypename).like(s),
            ))

        total_count = q.count()

        # 4. Sort
        sort_col = getattr(TaskQlctkt, sort_by or "ngay_tao", TaskQlctkt.ngay_tao)
        if (sort_order or "desc").lower() == "asc":
            q = q.order_by(sort_col.asc())
        else:
            q = q.order_by(sort_col.desc())

        # 5. Pagination
        if page < 1:
            page = 1
        limit = min(page_size, 50000)
        offset = (page - 1) * limit
        tasks = q.offset(offset).limit(limit).all()

        items = []
        for t in tasks:
            items.append({
                "task_id": t.task_id,
                "loai_yeu_cau": t.loai_yeu_cau,
                "dich_vu": t.dich_vu,
                "account": t.account,
                "ten_khach_hang": t.ten_khach_hang,
                "dia_chi_lap_dat": t.dia_chi_lap_dat,
                "to_doi_raw": t.to_doi_raw,
                "nv_thuc_hien": t.nv_thuc_hien,
                "tram": t.tram,
                "tien_do": t.tien_do,
                "ngay_tao": t.ngay_tao.strftime("%d/%m/%Y %H:%M:%S") if t.ngay_tao else None,
                "ngay_ket_thuc_thuc_te": t.ngay_ket_thuc_thuc_te.strftime("%d/%m/%Y %H:%M:%S") if t.ngay_ket_thuc_thuc_te else None,
                "so_gio_ton": t.so_gio_ton,
                "ghi_chu_dau_moi": t.ghi_chu_dau_moi,
                "ly_do_tich_huy": t.ly_do_tich_huy,
                "tich_hen": t.tich_hen,
                "trang_thai_gpon": t.trang_thai_gpon,
                "cmtasktypename": t.cmtasktypename,
                "is_huy": t.is_huy,
                "is_duong_day_moi": t.is_duong_day_moi,
                "is_tich_hen_ok": t.is_tich_hen_ok,
            })

        return {
            "total_items": total_count,
            "page": page,
            "page_size": limit,
            "total_pages": (total_count + limit - 1) // limit if limit else 1,
            "items": items,
            "metric": metric,
            "selected_date": selected_date,
        }
