import re
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any
from collections import defaultdict
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from backend.models.codinh_org import CodinhCluster, CodinhTeam, CodinhEmployee
from backend.models.task_codinh import TaskCodinh
from backend.services.user_mapping import get_user_full_name
from backend.services.codinh.normalize import normalize_key

_org_lock = threading.Lock()
_org_version: int = 1
_org_lookup_cache: Optional[Dict[str, Any]] = None
_cached_version: int = 0


def bump_org_version():
    global _org_version, _org_lookup_cache
    with _org_lock:
        _org_version += 1
        _org_lookup_cache = None


def get_org_version() -> int:
    return _org_version


def seed_org_from_excel(db: Session, excel_path: Optional[Path] = None, force: bool = False) -> Dict[str, Any]:
    """
    Seeds organization hierarchy (Cluster -> Team -> Employee) from danhsachnhanvien_codinh.xlsx.
    If force is False, only runs if CodinhCluster table is empty.
    """
    if not force:
        existing_count = db.query(CodinhCluster).count()
        if existing_count > 0:
            return {"status": "skipped", "message": f"Danh mục đã có {existing_count} cụm"}

    if excel_path is None:
        excel_path = Path("danhsachnhanvien_codinh.xlsx")
    if not excel_path.exists():
        # Check root or parent
        alt_path = Path(__file__).resolve().parent.parent.parent.parent / "danhsachnhanvien_codinh.xlsx"
        if alt_path.exists():
            excel_path = alt_path
        else:
            return {"status": "error", "message": f"Không tìm thấy file {excel_path}"}

    try:
        df = pd.read_excel(excel_path)
    except Exception as e:
        return {"status": "error", "message": f"Lỗi đọc file Excel: {str(e)}"}

    # Identify columns
    col_user = None
    col_role = None
    col_name = None
    col_team_name = None
    col_team_code = None
    col_cluster_name = None
    col_cluster_code = None

    for col in df.columns:
        c_clean = str(col).strip().lower()
        if "username" in c_clean:
            col_user = col
        elif "chức vụ" in c_clean or "chuc vu" in c_clean:
            col_role = col
        elif "họ tên" in c_clean or "ho ten" in c_clean:
            col_name = col
        elif "tên đội" in c_clean or "ten doi" in c_clean:
            col_team_name = col
        elif "viết tắt đội" in c_clean or "viet tat doi" in c_clean or "mã đội" in c_clean:
            col_team_code = col
        elif "tên cụm" in c_clean or "ten cum" in c_clean:
            col_cluster_name = col
        elif "viết tắt cụm" in c_clean or "viet tat cum" in c_clean or "mã cụm" in c_clean:
            col_cluster_code = col

    missing = []
    if not col_user: missing.append("Username")
    if not col_name: missing.append("Họ tên")
    if not col_team_name: missing.append("Tên đội")
    if not col_cluster_name: missing.append("Tên cụm")
    if missing:
        return {"status": "error", "message": f"File Excel thiếu các cột: {', '.join(missing)}"}

    if force:
        # Clear existing org
        db.query(CodinhEmployee).delete()
        db.query(CodinhTeam).delete()
        db.query(CodinhCluster).delete()
        db.commit()

    cluster_map = {}  # ma_cum -> CodinhCluster
    team_map = {}     # (ma_cum, ma_doi) -> CodinhTeam
    created_clusters = 0
    created_teams = 0
    created_employees = 0

    cluster_sort = 0
    team_sort = 0
    emp_sort = 0

    for _, row in df.iterrows():
        raw_user = str(row[col_user] if pd.notna(row[col_user]) else "").strip()
        if not raw_user:
            continue
        if raw_user.endswith(".0"):
            raw_user = raw_user[:-2]
        user_key = raw_user.lower()

        raw_name = str(row[col_name] if pd.notna(row[col_name]) else "").strip()
        raw_team_name = str(row[col_team_name] if pd.notna(row[col_team_name]) else "").strip()
        raw_team_code = str(row[col_team_code] if col_team_code and pd.notna(row[col_team_code]) else "").strip()
        if not raw_team_code:
            raw_team_code = raw_team_name

        raw_cluster_name = str(row[col_cluster_name] if pd.notna(row[col_cluster_name]) else "").strip()
        raw_cluster_code = str(row[col_cluster_code] if col_cluster_code and pd.notna(row[col_cluster_code]) else "").strip()
        if not raw_cluster_code:
            raw_cluster_code = raw_cluster_name

        raw_role = row[col_role] if col_role and pd.notna(row[col_role]) else 0
        is_leader = False
        try:
            is_leader = int(raw_role) == 1
        except Exception:
            is_leader = str(raw_role).strip() == "1"

        # 1. Cluster
        if raw_cluster_code not in cluster_map:
            c = db.query(CodinhCluster).filter(CodinhCluster.ma_cum == raw_cluster_code).first()
            if not c:
                cluster_sort += 1
                c = CodinhCluster(
                    ma_cum=raw_cluster_code,
                    ten_cum=raw_cluster_name,
                    sort_order=cluster_sort,
                    is_active=True
                )
                db.add(c)
                db.flush()
                created_clusters += 1
            cluster_map[raw_cluster_code] = c
        cluster_obj = cluster_map[raw_cluster_code]

        # 2. Team
        team_key = (raw_cluster_code, raw_team_code)
        if team_key not in team_map:
            t = db.query(CodinhTeam).filter(
                CodinhTeam.cluster_id == cluster_obj.id,
                CodinhTeam.ma_doi == raw_team_code
            ).first()
            if not t:
                team_sort += 1
                t = CodinhTeam(
                    cluster_id=cluster_obj.id,
                    ma_doi=raw_team_code,
                    ten_doi=raw_team_name,
                    sort_order=team_sort,
                    is_active=True
                )
                db.add(t)
                db.flush()
                created_teams += 1
            team_map[team_key] = t
        team_obj = team_map[team_key]

        # 3. Employee
        emp = db.query(CodinhEmployee).filter(CodinhEmployee.username_key == user_key).first()
        ht_key = normalize_key(raw_name)
        if not emp:
            emp_sort += 1
            emp = CodinhEmployee(
                team_id=team_obj.id,
                username=raw_user,
                username_key=user_key,
                ho_ten=raw_name,
                ho_ten_key=ht_key,
                la_doi_truong=is_leader,
                sort_order=emp_sort,
                is_active=True
            )
            db.add(emp)
            created_employees += 1
        else:
            emp.team_id = team_obj.id
            emp.username = raw_user
            emp.ho_ten = raw_name
            emp.ho_ten_key = ht_key
            emp.la_doi_truong = is_leader

    db.commit()
    bump_org_version()

    return {
        "status": "success",
        "created_clusters": created_clusters,
        "created_teams": created_teams,
        "created_employees": created_employees,
        "total_clusters": len(cluster_map),
        "total_teams": len(team_map),
        "message": f"Đã nạp {created_clusters} cụm, {created_teams} đội, {created_employees} nhân viên"
    }


def get_org_lookup(db: Session) -> Dict[str, Any]:
    """
    Returns cached fast lookup dictionaries:
    - users: username_key -> {
        employee_id, username, username_key, ho_ten, is_leader,
        team_id, ma_doi, ten_doi,
        cluster_id, ma_cum, ten_cum
      }
    - clusters: list of cluster dicts ordered by sort_order
    - teams: list of team dicts ordered by sort_order
    - team_by_id: team_id -> team dict
    - cluster_by_id: cluster_id -> cluster dict
    - org_version: int
    """
    global _org_lookup_cache, _cached_version

    with _org_lock:
        if _org_lookup_cache is not None and _cached_version == _org_version:
            return _org_lookup_cache

    clusters_db = db.query(CodinhCluster).filter(CodinhCluster.is_active == True).order_by(CodinhCluster.sort_order).all()
    teams_db = db.query(CodinhTeam).filter(CodinhTeam.is_active == True).order_by(CodinhTeam.sort_order).all()
    employees_db = db.query(CodinhEmployee).filter(CodinhEmployee.is_active == True).order_by(CodinhEmployee.sort_order).all()

    cluster_dict = {}
    clusters_list = []
    for c in clusters_db:
        c_info = {
            "id": c.id,
            "ma_cum": c.ma_cum,
            "ten_cum": c.ten_cum,
            "sort_order": c.sort_order,
        }
        cluster_dict[c.id] = c_info
        clusters_list.append(c_info)

    team_dict = {}
    teams_list = []
    for t in teams_db:
        c_info = cluster_dict.get(t.cluster_id, {})
        t_info = {
            "id": t.id,
            "cluster_id": t.cluster_id,
            "ma_doi": t.ma_doi,
            "ten_doi": t.ten_doi,
            "sort_order": t.sort_order,
            "ma_cum": c_info.get("ma_cum", ""),
            "ten_cum": c_info.get("ten_cum", ""),
        }
        team_dict[t.id] = t_info
        teams_list.append(t_info)

    user_dict = {}
    ho_ten_groups = defaultdict(list)
    team_members = {}  # team_id -> list of username_keys
    cluster_members = {}  # cluster_id -> list of username_keys

    for emp in employees_db:
        t_info = team_dict.get(emp.team_id, {})
        ht_key = emp.ho_ten_key or normalize_key(emp.ho_ten)
        u_info = {
            "employee_id": emp.id,
            "username": emp.username,
            "username_key": emp.username_key,
            "ho_ten": emp.ho_ten,
            "ho_ten_key": ht_key,
            "is_leader": bool(emp.la_doi_truong),
            "team_id": emp.team_id,
            "ma_doi": t_info.get("ma_doi", ""),
            "ten_doi": t_info.get("ten_doi", ""),
            "cluster_id": t_info.get("cluster_id"),
            "ma_cum": t_info.get("ma_cum", ""),
            "ten_cum": t_info.get("ten_cum", ""),
        }
        user_dict[emp.username_key] = u_info
        ho_ten_groups[ht_key].append(u_info)

        # Track team & cluster members
        tid = emp.team_id
        if tid not in team_members:
            team_members[tid] = []
        team_members[tid].append(emp.username_key)

        cid = t_info.get("cluster_id")
        if cid is not None:
            if cid not in cluster_members:
                cluster_members[cid] = []
            cluster_members[cid].append(emp.username_key)

    # Populate users_by_ho_ten only for unique active employees
    users_by_ho_ten = {}
    duplicate_ho_ten_keys = []
    for ht_key, u_list in ho_ten_groups.items():
        if len(u_list) == 1:
            users_by_ho_ten[ht_key] = u_list[0]
        else:
            duplicate_ho_ten_keys.append({
                "ho_ten_key": ht_key,
                "employees": [{"id": x["employee_id"], "username": x["username"], "ho_ten": x["ho_ten"]} for x in u_list]
            })

    result = {
        "users": user_dict,
        "users_by_ho_ten": users_by_ho_ten,
        "duplicate_ho_ten_keys": duplicate_ho_ten_keys,
        "clusters": clusters_list,
        "teams": teams_list,
        "cluster_by_id": cluster_dict,
        "team_by_id": team_dict,
        "team_members": team_members,
        "cluster_members": cluster_members,
        "org_version": _org_version,
    }

    with _org_lock:
        _org_lookup_cache = result
        _cached_version = _org_version

    return result


def get_org_tree(db: Session) -> List[Dict[str, Any]]:
    """Returns the full 3-level tree (Cluster -> Team -> Employee) with stats."""
    clusters = db.query(CodinhCluster).order_by(CodinhCluster.sort_order).all()
    tree = []

    for c in clusters:
        teams_data = []
        for t in c.teams:
            emps_data = []
            for emp in t.employees:
                emps_data.append({
                    "id": emp.id,
                    "username": emp.username,
                    "username_key": emp.username_key,
                    "ho_ten": emp.ho_ten,
                    "la_doi_truong": bool(emp.la_doi_truong),
                    "sort_order": emp.sort_order,
                    "is_active": emp.is_active,
                })
            teams_data.append({
                "id": t.id,
                "ma_doi": t.ma_doi,
                "ten_doi": t.ten_doi,
                "sort_order": t.sort_order,
                "is_active": t.is_active,
                "employee_count": len(emps_data),
                "employees": emps_data,
            })
        tree.append({
            "id": c.id,
            "ma_cum": c.ma_cum,
            "ten_cum": c.ten_cum,
            "sort_order": c.sort_order,
            "is_active": c.is_active,
            "team_count": len(teams_data),
            "teams": teams_data,
        })

    return tree


def get_unmatched_usernames(db: Session) -> List[Dict[str, Any]]:
    """
    Finds usernames present in TaskCodinh that are NOT in CodinhEmployee.
    Requirement 2: Informative list only, ordered descending by total WOs.
    """
    # Get all registered username keys
    registered_keys = set(
        r[0] for r in db.query(CodinhEmployee.username_key).all()
    )

    # Query distinct usernames and their WO counts in codinh_tasks
    user_counts = db.query(
        TaskCodinh.nhan_vien,
        func.count(TaskCodinh.ma_cong_viec).label("total_wos")
    ).group_by(TaskCodinh.nhan_vien).order_by(desc("total_wos")).all()

    unmatched = []
    for raw_u, cnt in user_counts:
        u_str = (raw_u or "").strip()
        u_key = u_str.lower()
        if not u_str or u_str == "Chưa gán":
            continue
        if u_key not in registered_keys:
            unmatched.append({
                "username": u_str,
                "full_name": get_user_full_name(u_str),
                "total_wos": cnt
            })

    return unmatched


def set_team_leader(db: Session, team_id: int, employee_id: int) -> bool:
    """Sets an employee as the unique leader of their team."""
    team = db.query(CodinhTeam).filter(CodinhTeam.id == team_id).first()
    if not team:
        return False

    # Reset all employees in this team
    for emp in team.employees:
        emp.la_doi_truong = (emp.id == employee_id)

    db.commit()
    bump_org_version()
    return True


def ensure_org_columns_and_backfill(db: Session):
    """Ensures ho_ten_key column exists and is backfilled for all employees."""
    from backend.database import engine, is_sqlite
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            if is_sqlite:
                cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(codinh_employees)").fetchall()]
                if "ho_ten_key" not in cols:
                    conn.exec_driver_sql("ALTER TABLE codinh_employees ADD COLUMN ho_ten_key VARCHAR(255)")
            else:
                cursor = conn.execute(text("SHOW COLUMNS FROM codinh_employees LIKE 'ho_ten_key'"))
                if not cursor.first():
                    conn.execute(text("ALTER TABLE codinh_employees ADD COLUMN ho_ten_key VARCHAR(255)"))
    except Exception as e:
        pass

    try:
        from backend.models.task_qlctkt import TaskQlctkt
        TaskQlctkt.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        pass

    emps_to_fix = db.query(CodinhEmployee).filter(
        (CodinhEmployee.ho_ten_key == None) | (CodinhEmployee.ho_ten_key == "")
    ).all()
    if emps_to_fix:
        for emp in emps_to_fix:
            emp.ho_ten_key = normalize_key(emp.ho_ten)
        db.commit()
        bump_org_version()


def get_unmatched_qlctkt_names(db: Session) -> List[Dict[str, Any]]:
    """Finds employee names in TaskQlctkt that are not matched to any active CodinhEmployee."""
    from backend.models.task_qlctkt import TaskQlctkt
    org = get_org_lookup(db)
    users_by_ho_ten = org.get("users_by_ho_ten", {})

    counts = db.query(
        TaskQlctkt.nv_thuc_hien,
        TaskQlctkt.nv_key,
        func.count(TaskQlctkt.task_id).label("total_wos")
    ).group_by(TaskQlctkt.nv_thuc_hien, TaskQlctkt.nv_key).order_by(desc("total_wos")).all()

    unmatched = []
    for raw_name, nv_key, cnt in counts:
        k = nv_key or normalize_key(raw_name)
        if not k:
            continue
        if k not in users_by_ho_ten:
            unmatched.append({
                "ho_ten": raw_name or k,
                "nv_key": k,
                "total_wos": cnt
            })
    return unmatched

