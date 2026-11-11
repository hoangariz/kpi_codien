import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, or_, and_, distinct

from backend.database import is_sqlite
from backend.models.task_codinh import TaskCodinh
from backend.models.note import TaskNote
from backend.models.import_log import ImportLog
from backend.services.settings_service import get_current_month_setting
from backend.services.user_mapping import get_user_full_name, get_usernames_by_name
from backend.services.codinh.base import (
    BaseReport,
    CLOSED_STATUSES,
    _get_setting,
)
from backend.services.codinh.org import get_org_lookup, get_org_version
from backend.services.codinh.importer import get_wo_version

_stats_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def clear_bao_hong_thc_cache():
    global _stats_cache
    with _cache_lock:
        _stats_cache.clear()


def _init_bao_hong_entry(key_name: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entry = {
        "key_name": key_name,
        "total_wos": 0,
        "closed_wos": 0,
        "wo_rate": 0.0,
        "pending_wos": 0,
        "overdue_wos": 0,
        "ton_pda": 0,
        "qua_han_pda": 0,
        "ton_thay_hop": 0,
        "qua_han_thay_hop": 0,
    }
    if extra:
        entry.update(extra)
    return entry


def _bump_bao_hong_entry(
    entry: Dict[str, Any],
    is_closed: bool,
    is_pending: bool,
    is_overdue: bool,
    is_pda: bool,
    is_thay_hop: bool,
):
    entry["total_wos"] += 1
    if is_closed:
        entry["closed_wos"] += 1
    if is_pending:
        entry["pending_wos"] += 1
        if is_pda:
            entry["ton_pda"] += 1
        if is_thay_hop:
            entry["ton_thay_hop"] += 1
    if is_overdue:
        entry["overdue_wos"] += 1
        if is_pda:
            entry["qua_han_pda"] += 1
        if is_thay_hop:
            entry["qua_han_thay_hop"] += 1


def _finalize_entry_rates(entry: Dict[str, Any]):
    tot_w = entry["total_wos"]
    cls_w = entry["closed_wos"]
    entry["wo_rate"] = round((cls_w / tot_w * 100), 1) if tot_w > 0 else 0.0


class BaoHongThcReport(BaseReport):
    key: str = "bao_hong_thc"
    title: str = "Báo hỏng Tủ hộp cáp (THC)"
    description: str = "Báo cáo xử lý báo hỏng tủ hộp cáp mạng lưới theo WO GNOC"
    task_type: str = "Báo hỏng hạ tầng mạng lưới"
    has_cabinets: bool = False
    is_port_kem: bool = False
    exclude_closed_prior_months: bool = True

    def filter_tasks(self, q):
        return q.filter(
            TaskCodinh.loai_cong_viec == self.task_type,
            TaskCodinh.noi_dung_cong_viec.ilike("%THC%")
        )

    def get_available_months(self, db: Session) -> List[str]:
        date_expr = func.coalesce(TaskCodinh.thoi_diem_bat_dau_thuc_hien, TaskCodinh.thoi_diem_tao)
        if is_sqlite:
            month_expr = func.strftime('%Y-%m', date_expr)
        else:
            month_expr = func.date_format(date_expr, '%Y-%m')

        q_months = db.query(distinct(month_expr)).filter(date_expr.isnot(None))
        q_months = self.filter_tasks(q_months)
        available = [r[0] for r in q_months.order_by(desc(month_expr)).all() if r[0]]
        if not available:
            available = [datetime.utcnow().strftime("%Y-%m")]
        return available

    def compute_stats(self, db: Session, target_month: Optional[str] = None) -> Dict[str, Any]:
        wo_ver = get_wo_version()
        org_ver = get_org_version()
        m_key = (target_month or "").strip() or "current"
        cache_key = f"{self.key}_{m_key}_w{wo_ver}_o{org_ver}"

        with _cache_lock:
            if cache_key in _stats_cache:
                return _stats_cache[cache_key]

        now = datetime.utcnow()
        active_month = target_month or get_current_month_setting(db)
        available_months = self.get_available_months(db)

        # 1. Fetch tasks
        q = db.query(
            TaskCodinh.ma_cong_viec,
            TaskCodinh.ma_tram,
            TaskCodinh.loai_cong_viec,
            TaskCodinh.noi_dung_cong_viec,
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

        # 2. Org lookup
        org = get_org_lookup(db)
        org_users = org["users"]
        org_clusters = org["clusters"]
        org_teams = org["teams"]

        # 3. Initialize entries
        summary = _init_bao_hong_entry("Tất cả", {
            "has_cabinets": False,
            "is_port_kem": False,
        })

        cluster_map: Dict[Any, Dict[str, Any]] = {}
        for c in org_clusters:
            cid = c["id"]
            cluster_map[cid] = _init_bao_hong_entry(c["ten_cum"], {
                "cluster_id": cid,
                "ma_cum": c["ma_cum"],
                "ten_cum": c["ten_cum"],
                "sort_order": c["sort_order"],
                "is_other": False,
            })
        other_cluster = _init_bao_hong_entry("Chưa phân cụm", {
            "cluster_id": None,
            "ma_cum": "OTHER",
            "ten_cum": "Chưa phân cụm",
            "sort_order": 99999,
            "is_other": True,
        })

        team_map: Dict[Any, Dict[str, Any]] = {}
        for t in org_teams:
            tid = t["id"]
            team_map[tid] = _init_bao_hong_entry(t["ten_doi"], {
                "team_id": tid,
                "cluster_id": t["cluster_id"],
                "ma_doi": t["ma_doi"],
                "ten_doi": t["ten_doi"],
                "ma_cum": t.get("ma_cum", ""),
                "ten_cum": t.get("ten_cum", ""),
                "sort_order": t["sort_order"],
                "is_other": False,
            })
        other_team = _init_bao_hong_entry("Chưa phân đội", {
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
            emp_map[u_key] = _init_bao_hong_entry(u_name, {
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

        # 4. Process each task
        for t in task_tuples:
            ma_wo = t[0]
            noi_dung = t[3] or ""
            trang_thai = t[4] or "Chưa rõ"
            raw_emp = t[5] or "Chưa gán"
            grp_name = t[6] or "Chưa phân nhóm"
            thoi_diem_tao = t[7]
            bat_dau = t[8]
            ket_thuc = t[9]
            thoi_gian_con_lai = t[10]

            is_closed = trang_thai in CLOSED_STATUSES
            is_pending = not is_closed
            is_overdue = is_pending and (
                (thoi_gian_con_lai is not None and thoi_gian_con_lai < 0) or
                (ket_thuc and ket_thuc < now)
            )

            nd_low = noi_dung.lower()
            is_pda = "pda" in nd_low
            is_thay_hop = "thực hiện thay thế hộp" in nd_low

            # Bump summary
            _bump_bao_hong_entry(
                summary, is_closed, is_pending, is_overdue, is_pda, is_thay_hop
            )

            # Bump Employee / Team / Cluster
            emp_key = str(raw_emp).strip()
            emp_key_low = emp_key.lower()
            org_emp = org_users.get(emp_key_low)

            if org_emp:
                e_entry = emp_map.get(emp_key_low)
                if not e_entry:
                    e_entry = emp_map.get(str(org_emp.get("username", "")).lower().strip())
                if e_entry:
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

                    _bump_bao_hong_entry(e_entry, is_closed, is_pending, is_overdue, is_pda, is_thay_hop)

                tid = org_emp["team_id"]
                if tid in team_map:
                    _bump_bao_hong_entry(team_map[tid], is_closed, is_pending, is_overdue, is_pda, is_thay_hop)

                cid = org_emp["cluster_id"]
                if cid in cluster_map:
                    _bump_bao_hong_entry(cluster_map[cid], is_closed, is_pending, is_overdue, is_pda, is_thay_hop)
            else:
                is_chua_gan = (emp_key == "" or emp_key.lower() in ("chưa gán", "chua gan", "none", "nan"))
                display_key = "Chưa gán" if is_chua_gan else emp_key

                if display_key not in emp_map:
                    full_n = "Chưa gán" if is_chua_gan else get_user_full_name(display_key)
                    emp_map[display_key] = _init_bao_hong_entry(display_key, {
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

                _bump_bao_hong_entry(e_entry, is_closed, is_pending, is_overdue, is_pda, is_thay_hop)
                _bump_bao_hong_entry(other_team, is_closed, is_pending, is_overdue, is_pda, is_thay_hop)
                _bump_bao_hong_entry(other_cluster, is_closed, is_pending, is_overdue, is_pda, is_thay_hop)

        # 5. Finalize rates
        _finalize_entry_rates(summary)
        summary["has_cabinets"] = False
        summary["is_port_kem"] = False

        by_employee = []
        for e in emp_map.values():
            _finalize_entry_rates(e)
            by_employee.append(e)
        by_employee.sort(key=lambda x: (x["is_other"], -x["total_wos"]))

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

        # 6. Data freshness
        last_update_vn = _get_setting(db, "codinh_last_import_wo_time_vn")
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
                "has_cabinets": False,
                "is_port_kem": False,
            },
            "active_category": {
                "id": 15,
                "name": self.title,
                "loai_cong_viec": self.task_type,
                "has_cabinets": False,
                "is_port_kem": False,
                "exclude_closed_prior_months": self.exclude_closed_prior_months,
            },
            "active_month": active_month,
            "target_month": target_month or active_month,
            "available_months": available_months,
            "summary": summary,
            "by_cluster": by_cluster,
            "by_team": by_team,
            "by_employee": by_employee,
            "by_group": by_cluster,
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

        # Target org filter
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
                registered_keys = list(org_users.keys())
                q = q.filter(or_(
                    TaskCodinh.nhan_vien == None,
                    TaskCodinh.nhan_vien == "",
                    TaskCodinh.nhan_vien == "Chưa gán",
                    ~func.lower(func.trim(TaskCodinh.nhan_vien)).in_(registered_keys)
                ))
            else:
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

        # Metric filter
        m_low = (metric or "total").lower()
        if m_low in ("closed", "da_dong", "dong", "closed_wos"):
            q = q.filter(TaskCodinh.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("pending", "ton", "ton_viec", "pending_wos"):
            q = q.filter(~TaskCodinh.trang_thai.in_(CLOSED_STATUSES))
        elif m_low in ("overdue", "qua_han", "tre_han", "overdue_wos"):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    TaskCodinh.thoi_gian_con_lai < 0,
                    and_(TaskCodinh.thoi_diem_yeu_cau_ket_thuc.isnot(None), TaskCodinh.thoi_diem_yeu_cau_ket_thuc < now)
                )
            )
        elif m_low in ("ton_pda",):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                TaskCodinh.noi_dung_cong_viec.ilike("%PDA%")
            )
        elif m_low in ("qua_han_pda",):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    TaskCodinh.thoi_gian_con_lai < 0,
                    and_(TaskCodinh.thoi_diem_yeu_cau_ket_thuc.isnot(None), TaskCodinh.thoi_diem_yeu_cau_ket_thuc < now)
                ),
                TaskCodinh.noi_dung_cong_viec.ilike("%PDA%")
            )
        elif m_low in ("ton_thay_hop", "ton_thay_the_hop", "thay_thu_ton"):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                TaskCodinh.noi_dung_cong_viec.ilike("%Thực hiện thay thế hộp%")
            )
        elif m_low in ("qua_han_thay_hop", "qua_han_thay_the_hop", "thay_thu_qua_han"):
            q = q.filter(
                ~TaskCodinh.trang_thai.in_(CLOSED_STATUSES),
                or_(
                    TaskCodinh.thoi_gian_con_lai < 0,
                    and_(TaskCodinh.thoi_diem_yeu_cau_ket_thuc.isnot(None), TaskCodinh.thoi_diem_yeu_cau_ket_thuc < now)
                ),
                TaskCodinh.noi_dung_cong_viec.ilike("%Thực hiện thay thế hộp%")
            )

        # Search filter
        if search and search.strip():
            s_val = f"%{search.strip()}%"
            q = q.filter(
                or_(
                    TaskCodinh.ma_cong_viec.ilike(s_val),
                    TaskCodinh.ma_tram.ilike(s_val),
                    TaskCodinh.nhan_vien.ilike(s_val),
                    TaskCodinh.nhom.ilike(s_val),
                    TaskCodinh.noi_dung_cong_viec.ilike(s_val),
                    TaskCodinh.ghi_chu.ilike(s_val),
                    TaskCodinh.loai_cong_viec.ilike(s_val),
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

        # Latest notes
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
                "total_cabinets": 0,
                "completed_cabinets": 0,
                "pending_cabinets": 0,
                "cabinets": [],
            })

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "items": items,
        }

