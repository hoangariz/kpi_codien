import threading
import time
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Set
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_, and_, distinct

from backend.database import is_sqlite
from backend.models.task_codinh import TaskCodinh
from backend.models.cabinet import Cabinet
from backend.models.note import TaskNote
from backend.models.import_log import ImportLog
from backend.services.settings_service import get_current_month_setting
from backend.services.user_mapping import get_user_full_name, get_usernames_by_name
from backend.services.codinh.org import get_org_lookup, get_org_version
from backend.services.codinh.importer import (
    get_wo_version,
    get_cabinet_version,
    _get_setting,
    _vectorize_dt_col,
)

CLOSED_STATUSES = ["Đóng", "FT hoàn thành", "FT Hoàn thành", "FT Hoàn Thành"]

_stats_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def clear_codinh_stats_cache():
    global _stats_cache
    with _cache_lock:
        _stats_cache.clear()


def _sql_duration_hours(start_col, finish_col):
    if is_sqlite:
        return (func.julianday(finish_col) - func.julianday(start_col)) * 24.0
    else:
        return func.timestampdiff(func.raw("SECOND"), start_col, finish_col) / 3600.0


def _init_metric_entry(key_name: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entry = {
        "key_name": key_name,
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
    }
    if extra:
        entry.update(extra)
    return entry


def _bump_entry(
    entry: Dict[str, Any],
    is_closed: bool,
    is_pending: bool,
    is_overdue: bool,
    finish_time: Optional[datetime],
    today_start: datetime,
    yesterday_start: datetime,
    week_start: datetime,
    is_home: bool,
    is_port: bool,
    is_pend_24h: bool,
    is_pend_72h: bool,
    is_comp_24h: bool,
    is_comp_72h: bool,
    t_cabs: int = 0,
    comp_cabs: int = 0,
    pend_cabs: int = 0,
    overdue_cabs: int = 0,
):
    entry["total_wos"] += 1
    if is_closed:
        entry["closed_wos"] += 1
        if finish_time and finish_time >= today_start:
            entry["closed_today"] += 1
        elif finish_time and yesterday_start <= finish_time < today_start:
            entry["closed_yesterday"] += 1
        if finish_time and finish_time >= week_start:
            entry["closed_week"] += 1
    else:
        entry["pending_wos"] += 1
        if is_home:
            entry["home_kem_count"] += 1
        else:
            entry["port_kem_count"] += 1

    if is_overdue:
        entry["overdue_wos"] += 1

    if is_pend_24h:
        entry["pending_under_24h"] += 1
    if is_pend_72h:
        entry["pending_under_72h"] += 1

    if is_comp_24h:
        entry["closed_within_24h"] += 1
    if is_comp_72h:
        entry["closed_within_72h"] += 1

    entry["total_cabinets"] += t_cabs
    entry["completed_cabinets"] += comp_cabs
    entry["pending_cabinets"] += pend_cabs
    entry["overdue_cabinets"] += overdue_cabs


def _finalize_entry_rates(entry: Dict[str, Any]):
    tot_w = entry["total_wos"]
    cls_w = entry["closed_wos"]
    tot_c = entry["total_cabinets"]
    cmp_c = entry["completed_cabinets"]

    entry["wo_rate"] = round((cls_w / tot_w * 100), 1) if tot_w > 0 else 0.0
    entry["cabinet_rate"] = round((cmp_c / tot_c * 100), 1) if tot_c > 0 else 0.0
    entry["kpi_24h_rate"] = round((entry["closed_within_24h"] / cls_w * 100), 1) if cls_w > 0 else 0.0
    entry["kpi_72h_rate"] = round((entry["closed_within_72h"] / cls_w * 100), 1) if cls_w > 0 else 0.0


class BaseReport:
    key: str = "base"
    title: str = "Báo Cáo CĐBR"
    description: str = ""
    task_type: str = ""
    has_cabinets: bool = False
    is_port_kem: bool = False
    exclude_closed_prior_months: bool = True

    def filter_tasks(self, q):
        if self.task_type:
            return q.filter(TaskCodinh.loai_cong_viec == self.task_type)
        return q

    def apply_month_filter(self, q, target_month: Optional[str], db: Session):
        is_all = target_month and target_month.strip().lower() == "all"
        if is_all:
            return q

        active_m = (target_month.strip() if target_month and target_month.strip() else None) or get_current_month_setting(db)
        if not active_m or active_m.strip().lower() == "all":
            return q

        try:
            y_str, m_str = active_m.strip().split("-")
            month_start = datetime(int(y_str), int(m_str), 1, 0, 0, 0)
        except Exception:
            return q

        if self.exclude_closed_prior_months:
            start_date = func.coalesce(
                TaskCodinh.thoi_diem_bat_dau_thuc_hien,
                TaskCodinh.thoi_diem_tao,
                TaskCodinh.thoi_diem_yeu_cau_ket_thuc
            )
            q = q.filter(
                or_(
                    start_date == None,
                    start_date >= month_start,
                    ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES)
                )
            )

        return q

    def get_available_months(self, db: Session) -> List[str]:
        start_expr = TaskCodinh.thoi_diem_bat_dau_thuc_hien
        if is_sqlite:
            month_expr = func.strftime('%Y-%m', start_expr)
        else:
            month_expr = func.date_format(start_expr, '%Y-%m')

        q_months = db.query(distinct(month_expr)).filter(start_expr.isnot(None))
        q_months = self.filter_tasks(q_months)
        available = [r[0] for r in q_months.order_by(desc(month_expr)).all() if r[0]]
        if not available:
            available = [datetime.utcnow().strftime("%Y-%m")]
        return available

    def compute_stats(self, db: Session, target_month: Optional[str] = None) -> Dict[str, Any]:
        wo_ver = get_wo_version()
        cab_ver = get_cabinet_version()
        org_ver = get_org_version()
        m_key = (target_month or "").strip() or "current"
        cache_key = f"{self.key}_{m_key}_w{wo_ver}_c{cab_ver}_o{org_ver}"

        with _cache_lock:
            if cache_key in _stats_cache:
                return _stats_cache[cache_key]

        now = datetime.utcnow()
        active_month = target_month or get_current_month_setting(db)
        today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
        yesterday_start = today_start - timedelta(days=1)
        week_start = today_start - timedelta(days=7)

        available_months = self.get_available_months(db)

        # 1. Fetch tasks
        q = db.query(
            TaskCodinh.ma_cong_viec,
            TaskCodinh.ma_tram,
            TaskCodinh.loai_cong_viec,
            TaskCodinh.noi_dung_cong_viec if self.is_port_kem else TaskCodinh.ma_cong_viec.label("noi_dung_dummy"),
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
        q = self.filter_tasks(q)
        q = self.apply_month_filter(q, target_month, db)
        task_tuples = q.all()

        # 2. Query cabinets if applicable
        task_keys_set = set(t[0] for t in task_tuples)
        wo_cab_stats = {}  # ma_wo -> [total, raw_completed]
        if self.has_cabinets and task_keys_set:
            cab_query = db.query(
                Cabinet.ma_wo,
                Cabinet.trang_thai_thc,
                func.count(Cabinet.id)
            ).filter(
                or_(
                    Cabinet.report_key == self.key,
                    Cabinet.report_key == None,
                    Cabinet.category_id == 13
                )
            ).group_by(Cabinet.ma_wo, Cabinet.trang_thai_thc)

            cab_rows = cab_query.all()
            for c_wo, c_status, c_cnt in cab_rows:
                if not c_wo or c_wo not in task_keys_set:
                    continue
                if c_wo not in wo_cab_stats:
                    wo_cab_stats[c_wo] = [0, 0]
                wo_cab_stats[c_wo][0] += c_cnt
                st_low = (c_status or "").lower()
                if "hoàn thành" in st_low and "đang" not in st_low:
                    wo_cab_stats[c_wo][1] += c_cnt

        has_cabinets_actual = len(wo_cab_stats) > 0 or self.has_cabinets

        # 3. Org lookup
        org = get_org_lookup(db)
        org_users = org["users"]
        org_clusters = org["clusters"]
        org_teams = org["teams"]

        # 4. Initialize entries
        summary = _init_metric_entry("Tất cả", {
            "wo_rate": 0.0,
            "cabinet_rate": 0.0,
            "kpi_24h_rate": 0.0,
            "kpi_72h_rate": 0.0,
            "has_cabinets": has_cabinets_actual,
            "is_port_kem": self.is_port_kem,
        })

        cluster_map: Dict[Any, Dict[str, Any]] = {}
        for c in org_clusters:
            cid = c["id"]
            cluster_map[cid] = _init_metric_entry(c["ten_cum"], {
                "cluster_id": cid,
                "ma_cum": c["ma_cum"],
                "ten_cum": c["ten_cum"],
                "sort_order": c["sort_order"],
                "is_other": False,
            })
        other_cluster = _init_metric_entry("Chưa phân cụm", {
            "cluster_id": None,
            "ma_cum": "OTHER",
            "ten_cum": "Chưa phân cụm",
            "sort_order": 99999,
            "is_other": True,
        })

        team_map: Dict[Any, Dict[str, Any]] = {}
        for t in org_teams:
            tid = t["id"]
            team_map[tid] = _init_metric_entry(t["ten_doi"], {
                "team_id": tid,
                "cluster_id": t["cluster_id"],
                "ma_doi": t["ma_doi"],
                "ten_doi": t["ten_doi"],
                "ma_cum": t.get("ma_cum", ""),
                "ten_cum": t.get("ten_cum", ""),
                "sort_order": t["sort_order"],
                "is_other": False,
            })
        other_team = _init_metric_entry("Chưa phân đội", {
            "team_id": None,
            "cluster_id": None,
            "ma_doi": "OTHER",
            "ten_doi": "Chưa phân đội",
            "ma_cum": "OTHER",
            "ten_cum": "Chưa phân cụm",
            "sort_order": 99999,
            "is_other": True,
        })

        emp_map: Dict[str, Dict[str, Any]] = {}
        for u_key, u_info in org_users.items():
            u_name = u_info["username"]
            full_n = get_user_full_name(u_name)
            if (not full_n or full_n == u_name) and u_info.get("ho_ten"):
                full_n = u_info["ho_ten"]
            emp_map[u_key] = _init_metric_entry(u_name, {
                "full_name": full_n,
                "group_name": u_info["ten_doi"],
                "team_name": u_info["ten_doi"],
                "cluster_name": u_info["ten_cum"],
                "team_id": u_info["team_id"],
                "cluster_id": u_info["cluster_id"],
                "employee_id": u_info["employee_id"],
                "is_leader": u_info["is_leader"],
                "is_other": False,
            })

        # 5. Process each task
        for t in task_tuples:
            ma_wo = t[0]
            noi_dung = t[3] if self.is_port_kem else ""
            trang_thai = t[4] or "Chưa rõ"
            raw_emp = t[5] or "Chưa gán"
            grp_name = t[6] or "Chưa phân nhóm"
            thoi_diem_tao = t[7]
            bat_dau = t[8]
            ket_thuc = t[9]
            thoi_gian_con_lai = t[10]
            ft_hoan_thanh = t[11]
            cd_dong = t[12]

            is_closed = trang_thai in CLOSED_STATUSES
            is_pending = not is_closed
            is_overdue = is_pending and (
                (thoi_gian_con_lai is not None and thoi_gian_con_lai < 0) or
                (ket_thuc and ket_thuc < now)
            )

            if self.is_port_kem:
                nd_low = (noi_dung or "").lower()
                is_port = ("port kém gpon" in nd_low or "port kem gpon" in nd_low or "port kém" in nd_low or "port kem" in nd_low or "gpon" in nd_low)
                is_home = ("home wifi thu kém" in nd_low or "home wifi thu kem" in nd_low or "home wifi" in nd_low or "thu kém" in nd_low or "thu kem" in nd_low)
                if not is_home and not is_port:
                    is_port = True
            else:
                is_port = False
                is_home = False

            start_time = bat_dau or thoi_diem_tao
            age_hours = (now - start_time).total_seconds() / 3600.0 if (is_pending and start_time) else None
            is_pend_24h = (age_hours is not None and age_hours <= 24.0)
            is_pend_72h = (age_hours is not None and age_hours <= 72.0)

            finish_time = ft_hoan_thanh or cd_dong
            dur_hours = (finish_time - start_time).total_seconds() / 3600.0 if (is_closed and finish_time and start_time) else None
            is_comp_24h = (dur_hours is not None and 0 <= dur_hours <= 24.0)
            is_comp_72h = (dur_hours is not None and 0 <= dur_hours <= 72.0)

            if self.has_cabinets:
                cab_stat = wo_cab_stats.get(ma_wo)
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
                    t_cabs = comp_cabs = pend_cabs = overdue_cabs = 0
            else:
                t_cabs = comp_cabs = pend_cabs = overdue_cabs = 0

            # Bump summary
            _bump_entry(
                summary, is_closed, is_pending, is_overdue,
                finish_time, today_start, yesterday_start, week_start,
                is_home, is_port, is_pend_24h, is_pend_72h, is_comp_24h, is_comp_72h,
                t_cabs, comp_cabs, pend_cabs, overdue_cabs
            )

            # Bump Employee
            emp_key = str(raw_emp).strip()
            emp_key_low = emp_key.lower()
            org_emp = org_users.get(emp_key_low)

            if org_emp:
                # Registered employee
                e_entry = emp_map.get(emp_key_low)
                if not e_entry:
                    e_entry = emp_map.get(str(org_emp.get("username", "")).lower().strip())
                if not e_entry:
                    continue
                e_entry["key_name"] = emp_key
                full_n = get_user_full_name(emp_key) if emp_key != "Chưa gán" else "Chưa gán"
                if (not full_n or full_n == emp_key) and org_emp.get("ho_ten"):
                    full_n = org_emp["ho_ten"]
                e_entry["full_name"] = full_n
                e_entry["group_name"] = grp_name
                e_entry["team_name"] = org_emp["ten_doi"]
                e_entry["cluster_name"] = org_emp["ten_cum"]
                e_entry["team_id"] = org_emp["team_id"]
                e_entry["cluster_id"] = org_emp["cluster_id"]
                e_entry["employee_id"] = org_emp["employee_id"]
                e_entry["is_leader"] = org_emp["is_leader"]
                e_entry["is_other"] = False

                _bump_entry(
                    e_entry, is_closed, is_pending, is_overdue,
                    finish_time, today_start, yesterday_start, week_start,
                    is_home, is_port, is_pend_24h, is_pend_72h, is_comp_24h, is_comp_72h,
                    t_cabs, comp_cabs, pend_cabs, overdue_cabs
                )

                # Bump Team
                tid = org_emp["team_id"]
                if tid in team_map:
                    _bump_entry(
                        team_map[tid], is_closed, is_pending, is_overdue,
                        finish_time, today_start, yesterday_start, week_start,
                        is_home, is_port, is_pend_24h, is_pend_72h, is_comp_24h, is_comp_72h,
                        t_cabs, comp_cabs, pend_cabs, overdue_cabs
                    )

                # Bump Cluster
                cid = org_emp["cluster_id"]
                if cid in cluster_map:
                    _bump_entry(
                        cluster_map[cid], is_closed, is_pending, is_overdue,
                        finish_time, today_start, yesterday_start, week_start,
                        is_home, is_port, is_pend_24h, is_pend_72h, is_comp_24h, is_comp_72h,
                        t_cabs, comp_cabs, pend_cabs, overdue_cabs
                    )
            else:
                # Account not in org (including "Chưa gán")
                is_chua_gan = (emp_key == "" or emp_key.lower() in ("chưa gán", "chua gan", "none", "nan"))
                display_key = "Chưa gán" if is_chua_gan else emp_key

                if display_key not in emp_map:
                    full_n = "Chưa gán" if is_chua_gan else get_user_full_name(display_key)
                    emp_map[display_key] = _init_metric_entry(display_key, {
                        "full_name": full_n,
                        "group_name": grp_name,
                        "team_name": "Chưa phân đội",
                        "cluster_name": "Chưa phân cụm",
                        "is_other": is_chua_gan,
                        "is_leader": False,
                    })

                e_entry = emp_map[display_key]
                e_entry["key_name"] = display_key
                e_entry["group_name"] = grp_name
                e_entry["team_name"] = "Chưa phân đội"
                e_entry["cluster_name"] = "Chưa phân cụm"
                e_entry["is_other"] = is_chua_gan
                e_entry["is_leader"] = False

                _bump_entry(
                    e_entry, is_closed, is_pending, is_overdue,
                    finish_time, today_start, yesterday_start, week_start,
                    is_home, is_port, is_pend_24h, is_pend_72h, is_comp_24h, is_comp_72h,
                    t_cabs, comp_cabs, pend_cabs, overdue_cabs
                )

                # Route to other_team and other_cluster
                _bump_entry(
                    other_team, is_closed, is_pending, is_overdue,
                    finish_time, today_start, yesterday_start, week_start,
                    is_home, is_port, is_pend_24h, is_pend_72h, is_comp_24h, is_comp_72h,
                    t_cabs, comp_cabs, pend_cabs, overdue_cabs
                )
                _bump_entry(
                    other_cluster, is_closed, is_pending, is_overdue,
                    finish_time, today_start, yesterday_start, week_start,
                    is_home, is_port, is_pend_24h, is_pend_72h, is_comp_24h, is_comp_72h,
                    t_cabs, comp_cabs, pend_cabs, overdue_cabs
                )

        # 6. Finalize rates
        _finalize_entry_rates(summary)
        summary["closed_today_wos"] = summary["closed_today"]
        summary["closed_yesterday_wos"] = summary["closed_yesterday"]
        summary["closed_week_wos"] = summary["closed_week"]
        summary["has_cabinets"] = has_cabinets_actual
        summary["is_port_kem"] = self.is_port_kem

        # Finalize by_employee
        by_employee = []
        for e in emp_map.values():
            _finalize_entry_rates(e)
            by_employee.append(e)
        by_employee.sort(key=lambda x: (x["is_other"], -x["total_cabinets"] if has_cabinets_actual else -x["total_wos"]))

        # Finalize by_cluster
        by_cluster = []
        for c in org_clusters:
            cid = c["id"]
            if cid in cluster_map:
                c_entry = cluster_map[cid]
                _finalize_entry_rates(c_entry)
                by_cluster.append(c_entry)
        if other_cluster["total_wos"] > 0:
            _finalize_entry_rates(other_cluster)
            by_cluster.append(other_cluster)

        # Finalize by_team
        by_team = []
        for t in org_teams:
            tid = t["id"]
            if tid in team_map:
                t_entry = team_map[tid]
                _finalize_entry_rates(t_entry)
                by_team.append(t_entry)
        if other_team["total_wos"] > 0:
            _finalize_entry_rates(other_team)
            by_team.append(other_team)

        # 7. Data freshness
        last_update_vn = _get_setting(db, "codinh_last_import_wo_time_vn")
        if not last_update_vn:
            last_update_vn = _get_setting(db, "codinh_last_import_cabinet_time_vn")
        if not last_update_vn:
            latest_log = db.query(ImportLog).filter(ImportLog.domain == "codinh").order_by(ImportLog.imported_at.desc()).first()
            if latest_log and latest_log.imported_at:
                vn_dt = latest_log.imported_at + timedelta(hours=7)
                last_update_vn = vn_dt.strftime("%d/%m/%Y lúc %H:%M")
            else:
                last_update_vn = (datetime.utcnow() + timedelta(hours=7)).strftime("%d/%m/%Y lúc %H:%M")

        res = {
            "active_report": {
                "key": self.key,
                "title": self.title,
                "description": self.description,
                "task_type": self.task_type,
                "has_cabinets": has_cabinets_actual,
                "is_port_kem": self.is_port_kem,
            },
            # Backwards-compatible active_category block for old frontend
            "active_category": {
                "id": 13 if self.key == "thc" else 14,
                "name": self.title,
                "loai_cong_viec": self.task_type,
                "has_cabinets": has_cabinets_actual,
                "is_port_kem": self.is_port_kem,
                "exclude_closed_prior_months": self.exclude_closed_prior_months,
            },
            "active_month": active_month,
            "target_month": target_month or active_month,
            "available_months": available_months,
            "summary": summary,
            "by_cluster": by_cluster,
            "by_team": by_team,
            "by_employee": by_employee,
            "by_group": by_cluster,  # alias for backward compatibility
            "last_data_update_vn": last_update_vn,
            "has_dedicated_tasks": True,
        }

        with _cache_lock:
            _stats_cache[cache_key] = res

        return res

    def get_drilldown(
        self,
        db: Session,
        target_month: Optional[str] = None,
        metric: str = "total",
        filter_type: Optional[str] = None,
        filter_id: Optional[Any] = None,
        target_name: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: str = "asc",
        page: int = 1,
        page_size: int = 50,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        now = datetime.utcnow()
        today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
        yesterday_start = today_start - timedelta(days=1)

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
        q = self.filter_tasks(q)
        q = self.apply_month_filter(q, target_month, db)

        org = get_org_lookup(db)
        org_users = org["users"]

        # Target filter
        ft_low = (filter_type or "").lower()
        if ft_low in ("other_team", "other_cluster"):
            registered_keys = list(org_users.keys())
            q = q.filter(or_(
                TaskCodinh.nhan_vien == None,
                TaskCodinh.nhan_vien == "",
                TaskCodinh.nhan_vien == "Chưa gán",
                ~func.lower(func.trim(TaskCodinh.nhan_vien)).in_(registered_keys)
            ))
        elif ft_low == "employee" and target_name:
            if target_name in ("Chưa gán", "Khác", "*"):
                q = q.filter(or_(TaskCodinh.nhan_vien == None, TaskCodinh.nhan_vien == "", TaskCodinh.nhan_vien == "Chưa gán"))
            else:
                matched_users = get_usernames_by_name(target_name)
                q = q.filter(or_(
                    TaskCodinh.nhan_vien == target_name,
                    func.lower(TaskCodinh.nhan_vien) == target_name.lower(),
                    func.lower(TaskCodinh.nhan_vien).in_([u.lower() for u in matched_users])
                ))
        elif ft_low in ("team", "doi"):
            if str(filter_id) in ("other", "-1", "none") or target_name == "Chưa phân đội":
                # Accounts not in org
                registered_keys = list(org_users.keys())
                q = q.filter(or_(
                    TaskCodinh.nhan_vien == None,
                    TaskCodinh.nhan_vien == "",
                    TaskCodinh.nhan_vien == "Chưa gán",
                    ~func.lower(func.trim(TaskCodinh.nhan_vien)).in_(registered_keys)
                ))
            else:
                # Find team members
                team_id_val = None
                if filter_id and str(filter_id).isdigit():
                    team_id_val = int(filter_id)
                elif target_name:
                    for t in org["teams"]:
                        if t["ten_doi"] == target_name or t["ma_doi"] == target_name:
                            team_id_val = t["id"]
                            break

                if team_id_val is not None:
                    team_members = org["team_members"].get(team_id_val, [])
                    q = q.filter(func.lower(func.trim(TaskCodinh.nhan_vien)).in_(team_members))
        elif ft_low in ("cluster", "cum"):
            if str(filter_id) in ("other", "-1", "none") or target_name == "Chưa phân cụm":
                registered_keys = list(org_users.keys())
                q = q.filter(or_(
                    TaskCodinh.nhan_vien == None,
                    TaskCodinh.nhan_vien == "",
                    TaskCodinh.nhan_vien == "Chưa gán",
                    ~func.lower(func.trim(TaskCodinh.nhan_vien)).in_(registered_keys)
                ))
            else:
                cluster_id_val = None
                if filter_id and str(filter_id).isdigit():
                    cluster_id_val = int(filter_id)
                elif target_name:
                    for c in org["clusters"]:
                        if c["ten_cum"] == target_name or c["ma_cum"] == target_name:
                            cluster_id_val = c["id"]
                            break

                if cluster_id_val is not None:
                    cluster_members = org["cluster_members"].get(cluster_id_val, [])
                    q = q.filter(func.lower(func.trim(TaskCodinh.nhan_vien)).in_(cluster_members))
        elif ft_low == "group" and target_name:
            # Backward compatibility with old group filter
            if target_name in ("Chưa phân nhóm", "Chưa phân cụm", "Khác", "*"):
                registered_keys = list(org_users.keys())
                q = q.filter(or_(
                    TaskCodinh.nhan_vien == None,
                    TaskCodinh.nhan_vien == "",
                    TaskCodinh.nhan_vien == "Chưa gán",
                    ~func.lower(TaskCodinh.nhan_vien).in_(registered_keys),
                    TaskCodinh.nhom == target_name
                ))
            else:
                # Check if matches cluster name
                c_found = None
                for c in org["clusters"]:
                    if c["ten_cum"] == target_name or c["ma_cum"] == target_name or c["ma_cum"].lower() in target_name.lower():
                        c_found = c
                        break
                if c_found:
                    cluster_members = org["cluster_members"].get(c_found["id"], [])
                    q = q.filter(func.lower(TaskCodinh.nhan_vien).in_(cluster_members))
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
        elif m_low in ("closed_week", "closed_this_week", "dong_tuan_qua", "tuan_qua"):
            week_start = today_start - timedelta(days=7)
            q = q.filter(
                TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                func.coalesce(TaskCodinh.thoi_diem_ft_hoan_thanh, TaskCodinh.thoi_diem_cd_dong) >= week_start
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
        if wo_keys and self.has_cabinets:
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

        # Fetch latest notes
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
            for k_wo, c_content in latest_notes:
                notes_map[k_wo] = c_content

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

            # Org enrichment for row
            u_clean = (r.nhan_vien or "").strip().lower()
            org_user = org_users.get(u_clean)
            team_title = org_user["ten_doi"] if org_user else "Chưa phân đội"
            cluster_title = org_user["ten_cum"] if org_user else "Chưa phân cụm"
            full_user_name = org_user["ho_ten"] if org_user else (get_user_full_name(r.nhan_vien) if r.nhan_vien else "Chưa gán")

            items.append({
                "ma_cong_viec": r.ma_cong_viec,
                "loai_cong_viec": r.loai_cong_viec or "",
                "noi_dung_cong_viec": r.noi_dung_cong_viec or "",
                "ghi_chu": r.ghi_chu or "",
                "trang_thai": r.trang_thai or "Chưa rõ",
                "employee_assigned_name": full_user_name,
                "employee_username": r.nhan_vien or "",
                "group_name": r.nhom or "Chưa phân nhóm",
                "team_name": team_title,
                "cluster_name": cluster_title,
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
