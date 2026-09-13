from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import func, case, and_, or_, desc, asc, cast, Date
from sqlalchemy.orm import Session, joinedload

from backend.models import Task, Group, Employee, SystemModel, Station, TaskNote, TaskHistory
from backend.schemas.task_schema import TaskListItem

MAINTENANCE_TASK_TYPE = "Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS"

# Common status sets
COMPLETED_STATUSES = ["Đóng", "Hoàn thành", "Đã hoàn thành", "Thành công"]
IN_PROGRESS_STATUSES = ["Đã giao FT", "FT Đang thực hiện", "FT Tiếp nhận", "Đang thực hiện", "Đang xử lý"]


def get_kpi_overview(db: Session) -> Dict[str, Any]:
    """Overall KPIs across all tasks."""
    now = datetime.utcnow()

    # Query aggregates in a single fast query
    res = db.query(
        func.count(Task.ma_cong_viec).label("total"),
        func.sum(
            case((Task.trang_thai.in_(COMPLETED_STATUSES), 1), else_=0)
        ).label("completed"),
        func.sum(
            case((Task.trang_thai.in_(IN_PROGRESS_STATUSES), 1), else_=0)
        ).label("in_progress"),
        func.sum(
            case(
                (
                    and_(
                        ~Task.trang_thai.in_(COMPLETED_STATUSES),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue"),
        func.sum(
            case((Task.loai_cong_viec == MAINTENANCE_TASK_TYPE, 1), else_=0)
        ).label("maintenance_total"),
        func.count(func.distinct(Task.group_id)).label("total_groups"),
        func.count(func.distinct(Task.assigned_to_id)).label("total_employees"),
        func.sum(
            case((Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]), 1), else_=0)
        ).label("tu_choi"),
        func.sum(
            case((Task.trang_thai == "FT từ chối", 1), else_=0)
        ).label("ft_tu_choi"),
        func.sum(
            case((Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]), 1), else_=0)
        ).label("cd_tu_choi"),
        func.sum(
            case(
                (
                    and_(
                        Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue_tu_choi"),
        func.sum(
            case((Task.trang_thai.ilike("%ft hoàn thành%"), 1), else_=0)
        ).label("ft_hoan_thanh"),
        func.sum(
            case((Task.trang_thai.ilike("%chờ%tiếp nhận%"), 1), else_=0)
        ).label("cho_cd_tiep_nhan"),
    ).first()

    total = res.total or 0
    completed = res.completed or 0
    in_progress = res.in_progress or 0
    overdue = res.overdue or 0
    maint_total = res.maintenance_total or 0
    groups_count = res.total_groups or 0
    emp_count = res.total_employees or 0

    completion_rate = round((completed / total * 100), 1) if total > 0 else 0.0

    return {
        "total_tasks": total,
        "in_progress_count": in_progress,
        "completed_count": completed,
        "overdue_count": overdue,
        "completion_rate": completion_rate,
        "total_groups": groups_count,
        "total_employees": emp_count,
        "maintenance_total": maint_total,
        "tu_choi_count": res.tu_choi or 0,
        "ft_tu_choi_count": res.ft_tu_choi or 0,
        "cd_tu_choi_count": res.cd_tu_choi or 0,
        "overdue_tu_choi_count": res.overdue_tu_choi or 0,
        "ft_hoan_thanh_count": res.ft_hoan_thanh or 0,
        "cho_cd_tiep_nhan_count": res.cho_cd_tiep_nhan or 0,
    }


def get_stats_by_group(
    db: Session,
    task_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> List[Dict[str, Any]]:
    """Group statistics with status counts and completion rate."""
    now = datetime.utcnow()

    filters = []
    if task_type:
        filters.append(Task.loai_cong_viec == task_type)
    if start_date:
        filters.append(Task.thoi_diem_tao >= start_date)
    if end_date:
        filters.append(Task.thoi_diem_tao <= end_date)

    query = db.query(
        Group.id.label("group_id"),
        func.coalesce(Group.name, "Chưa phân nhóm").label("group_name"),
        func.count(Task.ma_cong_viec).label("total"),
        func.sum(case((Task.trang_thai.in_(COMPLETED_STATUSES), 1), else_=0)).label("completed"),
        func.sum(case((Task.trang_thai.in_(IN_PROGRESS_STATUSES), 1), else_=0)).label("in_progress"),
        func.sum(
            case(
                (
                    and_(
                        ~Task.trang_thai.in_(COMPLETED_STATUSES),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue"),
    ).outerjoin(Group, Task.group_id == Group.id)

    if filters:
        query = query.filter(and_(*filters))

    results = query.group_by(Group.id, Group.name).order_by(desc("total")).all()

    output = []
    for r in results:
        tot = r.total or 0
        comp = r.completed or 0
        inp = r.in_progress or 0
        ovd = r.overdue or 0
        oth = max(0, tot - (comp + inp))
        rate = round((comp / tot * 100), 1) if tot > 0 else 0.0
        output.append({
            "group_id": r.group_id,
            "group_name": r.group_name,
            "total": tot,
            "completed": comp,
            "in_progress": inp,
            "overdue": ovd,
            "other": oth,
            "completion_rate": rate,
        })
    return output


def get_stats_by_employee(
    db: Session,
    group_id: Optional[int] = None,
    task_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """Employee statistics with status counts and optional group filter."""
    now = datetime.utcnow()

    filters = []
    if group_id:
        filters.append(Task.group_id == group_id)
    if task_type:
        filters.append(Task.loai_cong_viec == task_type)
    if start_date:
        filters.append(Task.thoi_diem_tao >= start_date)
    if end_date:
        filters.append(Task.thoi_diem_tao <= end_date)

    query = db.query(
        Employee.id.label("employee_id"),
        func.coalesce(Employee.name, "Chưa gán").label("employee_name"),
        func.coalesce(Group.name, "Chưa rõ").label("group_name"),
        func.count(Task.ma_cong_viec).label("total"),
        func.sum(case((Task.trang_thai.in_(COMPLETED_STATUSES), 1), else_=0)).label("completed"),
        func.sum(case((Task.trang_thai.in_(IN_PROGRESS_STATUSES), 1), else_=0)).label("in_progress"),
        func.sum(
            case(
                (
                    and_(
                        ~Task.trang_thai.in_(COMPLETED_STATUSES),
                        or_(
                            Task.thoi_gian_con_lai < 0,
                            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                        )
                    ),
                    1
                ),
                else_=0
            )
        ).label("overdue"),
    ).outerjoin(Employee, Task.assigned_to_id == Employee.id)\
     .outerjoin(Group, Task.group_id == Group.id)

    if filters:
        query = query.filter(and_(*filters))

    results = query.group_by(Employee.id, Employee.name, Group.name).order_by(desc("total")).limit(limit).all()

    output = []
    for r in results:
        tot = r.total or 0
        comp = r.completed or 0
        inp = r.in_progress or 0
        ovd = r.overdue or 0
        oth = max(0, tot - (comp + inp))
        rate = round((comp / tot * 100), 1) if tot > 0 else 0.0
        output.append({
            "employee_id": r.employee_id,
            "employee_name": r.employee_name,
            "group_name": r.group_name,
            "total": tot,
            "completed": comp,
            "in_progress": inp,
            "overdue": ovd,
            "other": oth,
            "completion_rate": rate,
        })
    return output


def get_special_maintenance_stats(
    db: Session,
    target_type: str = MAINTENANCE_TASK_TYPE,
    target_month: Optional[str] = None,
    board_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Dedicated statistics for user request:
    'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS'
    Rule: Bỏ đi những công việc đã đóng của tháng trước (nếu thời điểm yêu cầu kết thúc < tháng hiện tại và đã đóng).
    Tính toán: Tổng, Đóng, Tồn, Quá hạn, Đóng hôm nay, Đóng 7 ngày qua.
    Gộp nhân viên trống / cụm trống vào dòng 'Khác'.
    Hỗ trợ lọc theo custom tracking board_id.
    """
    from backend.services.settings_service import get_current_month_setting

    active_month = target_month or get_current_month_setting(db)
    
    board_obj = None
    if board_id:
        from backend.models.tracking import TrackingBoard
        board_obj = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
        if board_obj and board_obj.loai_cong_viec:
            target_type = board_obj.loai_cong_viec
        elif board_obj and not board_obj.loai_cong_viec:
            target_type = None

    # Parse month start date
    try:
        y_str, m_str = active_month.split("-")
        month_start = datetime(int(y_str), int(m_str), 1, 0, 0, 0)
    except Exception:
        now_dt = datetime.utcnow()
        active_month = now_dt.strftime("%Y-%m")
        month_start = datetime(now_dt.year, now_dt.month, 1, 0, 0, 0)

    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    seven_days_ago = today_start - timedelta(days=7)

    from backend.models.report_category import ReportCategory, ReportSubCategory

    cat_obj = None
    if target_type:
        clean_target = target_type.strip().lower()
        cat_obj = db.query(ReportCategory).filter(
            func.lower(func.trim(ReportCategory.loai_cong_viec)) == clean_target
        ).first()
        if not cat_obj:
            cat_obj = db.query(ReportCategory).filter(
                func.lower(ReportCategory.name).ilike(f"%{clean_target[:20]}%")
            ).first()
    if not cat_obj:
        cat_obj = db.query(ReportCategory).filter(ReportCategory.is_default == True).first()
        if not cat_obj:
            cat_obj = db.query(ReportCategory).first()

    exclude_closed = cat_obj.exclude_closed_prior_months if (cat_obj and hasattr(cat_obj, 'exclude_closed_prior_months') and cat_obj.exclude_closed_prior_months is not None) else True

    type_condition = [Task.loai_cong_viec == target_type] if target_type else []

    # 1. Calculate count of excluded records (Đã đóng của tháng trước)
    if exclude_closed:
        excluded_query = db.query(func.count(Task.ma_cong_viec)).filter(
            *type_condition,
            Task.trang_thai == "Đóng",
            Task.thoi_diem_yeu_cau_ket_thuc != None,
            Task.thoi_diem_yeu_cau_ket_thuc < month_start
        )
        if board_id:
            from backend.models.tracking import TrackingBoardTask
            excluded_query = excluded_query.filter(
                Task.ma_cong_viec.in_(db.query(TrackingBoardTask.ma_cong_viec).filter(TrackingBoardTask.board_id == board_id))
            )
        excluded_count = excluded_query.scalar() or 0

        # 2. Filter condition for valid records
        base_conditions = [
            *type_condition,
            or_(
                Task.thoi_diem_yeu_cau_ket_thuc == None,
                Task.thoi_diem_yeu_cau_ket_thuc >= month_start,
                Task.trang_thai != "Đóng"
            )
        ]
    else:
        excluded_count = 0
        base_conditions = [
            *type_condition
        ]

    if board_id:
        from backend.models.tracking import TrackingBoardTask
        base_conditions.append(
            Task.ma_cong_viec.in_(db.query(TrackingBoardTask.ma_cong_viec).filter(TrackingBoardTask.board_id == board_id))
        )
    valid_condition = and_(*base_conditions)

    total_valid = db.query(func.count(Task.ma_cong_viec)).filter(valid_condition).scalar() or 0

    # Reusable breakdown computer for any condition
    def compute_breakdown_for_condition(condition):
        emp_res = db.query(
            Employee.id.label("id"),
            func.coalesce(Employee.name, "Khác (Chưa gán NV)").label("key_name"),
            func.count(Task.ma_cong_viec).label("total"),
            func.sum(case((Task.trang_thai == "Đóng", 1), else_=0)).label("closed"),
            func.sum(case((Task.trang_thai != "Đóng", 1), else_=0)).label("pending"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai != "Đóng",
                            or_(
                                Task.thoi_gian_con_lai < 0,
                                and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                            )
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("overdue"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai == "Đóng",
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("closed_today"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai == "Đóng",
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= seven_days_ago
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("closed_last_7_days"),
            func.sum(
                case(
                    (
                        or_(
                            Task.trang_thai == "Chờ CD tiếp nhận",
                            Task.trang_thai == "Chờ CĐ tiếp nhận",
                            Task.trang_thai.ilike("%chờ%tiếp nhận%")
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("cho_cd_tiep_nhan"),
            func.sum(
                case(
                    (
                        or_(
                            Task.trang_thai == "FT hoàn thành",
                            Task.trang_thai.ilike("%FT hoàn thành%")
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("ft_hoan_thanh"),
            func.sum(case((Task.trang_thai == "Đã giao FT", 1), else_=0)).label("da_giao_ft"),
            func.sum(case((Task.trang_thai == "FT Đang thực hiện", 1), else_=0)).label("ft_dang_thuc_hien"),
            func.sum(
                case((Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]), 1), else_=0)
            ).label("tu_choi"),
            func.sum(
                case((Task.trang_thai == "FT từ chối", 1), else_=0)
            ).label("ft_tu_choi"),
            func.sum(
                case((Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]), 1), else_=0)
            ).label("cd_tu_choi"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                            or_(
                                Task.thoi_gian_con_lai < 0,
                                and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                            )
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("overdue_tu_choi"),
        ).outerjoin(Employee, Task.assigned_to_id == Employee.id)\
         .filter(condition)\
         .group_by(Employee.id, Employee.name)\
         .all()

        by_employee = []
        other_emp = None
        for r in emp_res:
            tot = r.total or 0
            cl = r.closed or 0
            pe = r.pending or 0
            ov = r.overdue or 0
            ct = r.closed_today or 0
            c7 = r.closed_last_7_days or 0
            c_cd = r.cho_cd_tiep_nhan or 0
            ft_ht = r.ft_hoan_thanh or 0
            t_choi = r.tu_choi or 0
            ft_tc = r.ft_tu_choi or 0
            cd_tc = r.cd_tu_choi or 0
            ov_tc = r.overdue_tu_choi or 0
            rate = round((cl / tot * 100), 1) if tot > 0 else 0.0
            is_other = (r.id is None or r.key_name == "Khác (Chưa gán NV)")
            item = {
                "id": r.id,
                "key_name": "Khác (Chưa gán NV)" if is_other else r.key_name,
                "is_other": is_other,
                "total": tot,
                "closed": cl,
                "pending": pe,
                "overdue": ov,
                "closed_today": ct,
                "closed_last_7_days": c7,
                "cho_cd_tiep_nhan": c_cd,
                "ft_hoan_thanh": ft_ht,
                "tu_choi": t_choi,
                "ft_tu_choi": ft_tc,
                "cd_tu_choi": cd_tc,
                "overdue_tu_choi": ov_tc,
                "completion_rate": rate,
                "dong": cl,
                "da_giao_ft": r.da_giao_ft or 0,
                "ft_dang_thuc_hien": r.ft_dang_thuc_hien or 0,
                "other": max(0, tot - ((r.da_giao_ft or 0) + (r.ft_dang_thuc_hien or 0) + cl))
            }
            if is_other:
                other_emp = item
            else:
                by_employee.append(item)
        by_employee.sort(key=lambda x: x["total"], reverse=True)
        if other_emp:
            by_employee.append(other_emp)

        group_res = db.query(
            Group.id.label("id"),
            func.coalesce(Group.name, "Khác (Chưa phân cụm)").label("key_name"),
            func.count(Task.ma_cong_viec).label("total"),
            func.sum(case((Task.trang_thai == "Đóng", 1), else_=0)).label("closed"),
            func.sum(case((Task.trang_thai != "Đóng", 1), else_=0)).label("pending"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai != "Đóng",
                            or_(
                                Task.thoi_gian_con_lai < 0,
                                and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                            )
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("overdue"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai == "Đóng",
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("closed_today"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai == "Đóng",
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                            func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= seven_days_ago
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("closed_last_7_days"),
            func.sum(
                case(
                    (
                        or_(
                            Task.trang_thai == "Chờ CD tiếp nhận",
                            Task.trang_thai == "Chờ CĐ tiếp nhận",
                            Task.trang_thai.ilike("%chờ%tiếp nhận%")
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("cho_cd_tiep_nhan"),
            func.sum(
                case(
                    (
                        or_(
                            Task.trang_thai == "FT hoàn thành",
                            Task.trang_thai.ilike("%FT hoàn thành%")
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("ft_hoan_thanh"),
            func.sum(case((Task.trang_thai == "Đã giao FT", 1), else_=0)).label("da_giao_ft"),
            func.sum(case((Task.trang_thai == "FT Đang thực hiện", 1), else_=0)).label("ft_dang_thuc_hien"),
            func.sum(
                case((Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]), 1), else_=0)
            ).label("tu_choi"),
            func.sum(
                case((Task.trang_thai == "FT từ chối", 1), else_=0)
            ).label("ft_tu_choi"),
            func.sum(
                case((Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]), 1), else_=0)
            ).label("cd_tu_choi"),
            func.sum(
                case(
                    (
                        and_(
                            Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                            or_(
                                Task.thoi_gian_con_lai < 0,
                                and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                            )
                        ),
                        1
                    ),
                    else_=0
                )
            ).label("overdue_tu_choi"),
        ).outerjoin(Group, Task.group_id == Group.id)\
         .filter(condition)\
         .group_by(Group.id, Group.name)\
         .all()

        by_group = []
        other_grp = None
        for r in group_res:
            tot = r.total or 0
            cl = r.closed or 0
            pe = r.pending or 0
            ov = r.overdue or 0
            ct = r.closed_today or 0
            c7 = r.closed_last_7_days or 0
            c_cd = r.cho_cd_tiep_nhan or 0
            ft_ht = r.ft_hoan_thanh or 0
            t_choi = r.tu_choi or 0
            ft_tc = r.ft_tu_choi or 0
            cd_tc = r.cd_tu_choi or 0
            ov_tc = r.overdue_tu_choi or 0
            rate = round((cl / tot * 100), 1) if tot > 0 else 0.0
            is_other = (r.id is None or r.key_name == "Khác (Chưa phân cụm)")
            item = {
                "id": r.id,
                "key_name": "Khác (Chưa phân cụm)" if is_other else r.key_name,
                "is_other": is_other,
                "total": tot,
                "closed": cl,
                "pending": pe,
                "overdue": ov,
                "closed_today": ct,
                "closed_last_7_days": c7,
                "cho_cd_tiep_nhan": c_cd,
                "ft_hoan_thanh": ft_ht,
                "tu_choi": t_choi,
                "ft_tu_choi": ft_tc,
                "cd_tu_choi": cd_tc,
                "overdue_tu_choi": ov_tc,
                "completion_rate": rate,
                "dong": cl,
                "da_giao_ft": r.da_giao_ft or 0,
                "ft_dang_thuc_hien": r.ft_dang_thuc_hien or 0,
                "other": max(0, tot - ((r.da_giao_ft or 0) + (r.ft_dang_thuc_hien or 0) + cl))
            }
            if is_other:
                other_grp = item
            else:
                by_group.append(item)
        by_group.sort(key=lambda x: x["total"], reverse=True)
        if other_grp:
            by_group.append(other_grp)

        sum_total = db.query(func.count(Task.ma_cong_viec)).filter(condition).scalar() or 0
        sum_closed = sum(x["closed"] for x in by_group)
        sum_pending = sum(x["pending"] for x in by_group)
        sum_overdue = sum(x["overdue"] for x in by_group)
        sum_closed_today = sum(x["closed_today"] for x in by_group)
        sum_closed_7_days = sum(x["closed_last_7_days"] for x in by_group)
        sum_cho_cd_tiep_nhan = sum(x["cho_cd_tiep_nhan"] for x in by_group)
        sum_ft_hoan_thanh = sum(x["ft_hoan_thanh"] for x in by_group)
        sum_tu_choi = sum(x.get("tu_choi", 0) for x in by_group)
        sum_ft_tu_choi = sum(x.get("ft_tu_choi", 0) for x in by_group)
        sum_cd_tu_choi = sum(x.get("cd_tu_choi", 0) for x in by_group)
        sum_overdue_tu_choi = sum(x.get("overdue_tu_choi", 0) for x in by_group)
        sum_rate = round((sum_closed / sum_total * 100), 1) if sum_total > 0 else 0.0

        summary = {
            "total": sum_total,
            "closed": sum_closed,
            "pending": sum_pending,
            "overdue": sum_overdue,
            "closed_today": sum_closed_today,
            "closed_last_7_days": sum_closed_7_days,
            "cho_cd_tiep_nhan": sum_cho_cd_tiep_nhan,
            "ft_hoan_thanh": sum_ft_hoan_thanh,
            "tu_choi": sum_tu_choi,
            "ft_tu_choi": sum_ft_tu_choi,
            "cd_tu_choi": sum_cd_tu_choi,
            "overdue_tu_choi": sum_overdue_tu_choi,
            "completion_rate": sum_rate,
        }

        return summary, by_employee, by_group

    # 1. Compute overall parent report stats
    parent_summary, by_employee, by_group = compute_breakdown_for_condition(valid_condition)

    # 2. Compute sub-categories stats based on 'noi_dung_cong_viec' keywords
    from backend.models.report_category import ReportCategory, ReportSubCategory

    cat_obj = None
    if target_type:
        clean_target = target_type.strip().lower()
        cat_obj = db.query(ReportCategory).filter(
            func.lower(func.trim(ReportCategory.loai_cong_viec)) == clean_target
        ).first()
        if not cat_obj:
            cat_obj = db.query(ReportCategory).filter(
                func.lower(ReportCategory.name).ilike(f"%{clean_target[:20]}%")
            ).first()
    if not cat_obj:
        cat_obj = db.query(ReportCategory).filter(ReportCategory.is_default == True).first()
        if not cat_obj:
            cat_obj = db.query(ReportCategory).first()

    if not cat_obj:
        try:
            cat_obj = ReportCategory(
                name="Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS",
                loai_cong_viec=target_type or "Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS",
                description="Báo cáo tự động loại bỏ các việc đã đóng tháng trước.",
                is_default=True,
                sort_order=1
            )
            db.add(cat_obj)
            db.commit()
            db.refresh(cat_obj)
        except Exception:
            db.rollback()

    sub_categories_stats = []
    sub_cats = []
    if cat_obj and hasattr(cat_obj, 'id') and cat_obj.id:
        sub_cats = db.query(ReportSubCategory).filter(
            ReportSubCategory.category_id == cat_obj.id
        ).order_by(ReportSubCategory.sort_order.asc(), ReportSubCategory.id.asc()).all()

    if not sub_cats:
        default_defs = [
            {"name": "Bảo dưỡng điều hòa", "keyword": "CONDITIONER", "description": "Bảo dưỡng hệ thống điều hòa", "sort_order": 1},
            {"name": "Bảo dưỡng máy phát điện", "keyword": "GENERATOR", "description": "Bảo dưỡng tổ máy phát điện", "sort_order": 2},
            {"name": "Thông gió lọc bụi", "keyword": "VENTILATION", "description": "Thông gió và hệ thống lọc bụi ICMS", "sort_order": 3},
        ]
        if cat_obj and hasattr(cat_obj, 'id') and cat_obj.id:
            try:
                for item in default_defs:
                    db.add(ReportSubCategory(
                        category_id=cat_obj.id,
                        name=item["name"],
                        keyword=item["keyword"],
                        description=item["description"],
                        sort_order=item["sort_order"]
                    ))
                db.commit()
                sub_cats = db.query(ReportSubCategory).filter(
                    ReportSubCategory.category_id == cat_obj.id
                ).order_by(ReportSubCategory.sort_order.asc(), ReportSubCategory.id.asc()).all()
            except Exception:
                db.rollback()

        if not sub_cats:
            class DummySub:
                def __init__(self, s_id, name, keyword, desc):
                    self.id = s_id
                    self.name = name
                    self.keyword = keyword
                    self.description = desc
            sub_cats = [
                DummySub(1, "Bảo dưỡng điều hòa", "CONDITIONER", "Bảo dưỡng hệ thống điều hòa"),
                DummySub(2, "Bảo dưỡng máy phát điện", "GENERATOR", "Bảo dưỡng tổ máy phát điện"),
                DummySub(3, "Thông gió lọc bụi", "VENTILATION", "Thông gió và hệ thống lọc bụi ICMS"),
            ]

    if sub_cats:
        active_kws = []
        for sub in sub_cats:
            kw = sub.keyword.strip()
            if not kw:
                continue
            active_kws.append(kw)
            sub_cond = and_(valid_condition, Task.noi_dung_cong_viec.ilike(f"%{kw}%"))
            sub_sum, sub_emp, sub_grp = compute_breakdown_for_condition(sub_cond)

            sub_categories_stats.append({
                "id": sub.id,
                "name": sub.name,
                "keyword": sub.keyword,
                "description": sub.description,
                "is_other": False,
                "summary": sub_sum,
                "by_employee": sub_emp,
                "by_group": sub_grp,
            })

        # Add "Còn lại / Khác" sub-category for tasks not matching any keyword
        if active_kws:
            not_matched_conditions = [~Task.noi_dung_cong_viec.ilike(f"%{kw}%") for kw in active_kws]
            other_cond = and_(valid_condition, *not_matched_conditions)
            other_sum, other_emp, other_grp = compute_breakdown_for_condition(other_cond)

            sub_categories_stats.append({
                "id": 0,
                "name": "Còn lại / Khác",
                "keyword": "KHÁC",
                "description": None,
                "is_other": True,
                "summary": other_sum,
                "by_employee": other_emp,
                "by_group": other_grp,
            })

    return {
        "board_name": board_obj.name if board_obj else None,
        "target_task_type": target_type,
        "active_month": active_month,
        "total_valid_records": total_valid,
        "excluded_closed_prior_months": excluded_count,
        "summary": parent_summary,
        "by_employee": by_employee,
        "by_group": by_group,
        "sub_categories": sub_categories_stats,
        "sub_categories_stats": sub_categories_stats,
    }


def get_special_maintenance_tasks(
    db: Session,
    target_type: str = MAINTENANCE_TASK_TYPE,
    target_month: Optional[str] = None,
    board_id: Optional[int] = None,
    sub_category_id: Optional[int] = None,
    metric: str = "total",
    filter_type: Optional[str] = None,
    filter_id: Optional[int] = None,
    is_other: bool = False,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "thoi_diem_yeu_cau_ket_thuc",
    sort_order: str = "desc"
) -> Dict[str, Any]:
    """
    Get paginated drilldown tasks matching the exact filter & rules of the special maintenance report.
    Guarantees 100% mathematical consistency with numbers in table.
    Hỗ trợ lọc theo custom tracking board_id và sub_category_id (bảng con).
    """
    from backend.services.settings_service import get_current_month_setting
    from backend.models.report_category import ReportCategory, ReportSubCategory

    active_month = target_month or get_current_month_setting(db)

    board_obj = None
    if board_id:
        from backend.models.tracking import TrackingBoard
        board_obj = db.query(TrackingBoard).filter(TrackingBoard.id == board_id).first()
        if board_obj and board_obj.loai_cong_viec:
            target_type = board_obj.loai_cong_viec
        elif board_obj and not board_obj.loai_cong_viec:
            target_type = None

    try:
        y_str, m_str = active_month.split("-")
        month_start = datetime(int(y_str), int(m_str), 1, 0, 0, 0)
    except Exception:
        now_dt = datetime.utcnow()
        active_month = now_dt.strftime("%Y-%m")
        month_start = datetime(now_dt.year, now_dt.month, 1, 0, 0, 0)

    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    seven_days_ago = today_start - timedelta(days=7)

    cat = None
    if target_type:
        clean_target = target_type.strip().lower()
        cat = db.query(ReportCategory).filter(
            func.lower(func.trim(ReportCategory.loai_cong_viec)) == clean_target
        ).first()
        if not cat:
            cat = db.query(ReportCategory).filter(
                func.lower(ReportCategory.name).ilike(f"%{clean_target[:20]}%")
            ).first()
    if not cat:
        cat = db.query(ReportCategory).filter(ReportCategory.is_default == True).first()
        if not cat:
            cat = db.query(ReportCategory).first()

    exclude_closed = cat.exclude_closed_prior_months if (cat and hasattr(cat, 'exclude_closed_prior_months') and cat.exclude_closed_prior_months is not None) else True

    # 1. Base maintenance valid condition (same as stats report)
    type_condition = [Task.loai_cong_viec == target_type] if target_type else []
    filters = [*type_condition]
    if exclude_closed:
        filters.append(
            or_(
                Task.thoi_diem_yeu_cau_ket_thuc == None,
                Task.thoi_diem_yeu_cau_ket_thuc >= month_start,
                Task.trang_thai != "Đóng"
            )
        )

    if board_id:
        from backend.models.tracking import TrackingBoardTask
        filters.append(
            Task.ma_cong_viec.in_(db.query(TrackingBoardTask.ma_cong_viec).filter(TrackingBoardTask.board_id == board_id))
        )

    # Filter by sub_category_id (Keyword match in 'noi_dung_cong_viec')
    if sub_category_id is not None:
        if sub_category_id > 0:
            sub = db.query(ReportSubCategory).filter(ReportSubCategory.id == sub_category_id).first()
            if sub and sub.keyword and sub.keyword.strip().upper() != "KHÁC":
                filters.append(Task.noi_dung_cong_viec.ilike(f"%{sub.keyword.strip()}%"))
        elif sub_category_id == 0:
            # Còn lại / Khác: loại trừ các từ khóa của các bảng con
            if cat:
                all_subs = db.query(ReportSubCategory).filter(ReportSubCategory.category_id == cat.id).all()
                kws = [s.keyword.strip() for s in all_subs if s.keyword.strip() and s.keyword.strip().upper() != "KHÁC"]
            else:
                kws = ["CONDITIONER", "DC_COOLING"]
            if kws:
                filters.extend([~Task.noi_dung_cong_viec.ilike(f"%{kw}%") for kw in kws])

    # 2. Dimension filter
    if filter_type == "employee":
        if is_other:
            filters.append(Task.assigned_to_id == None)
        elif filter_id is not None:
            filters.append(Task.assigned_to_id == filter_id)
    elif filter_type == "group":
        if is_other:
            filters.append(Task.group_id == None)
        elif filter_id is not None:
            filters.append(Task.group_id == filter_id)

    # 3. Metric filter
    if metric == "closed":
        filters.append(Task.trang_thai == "Đóng")
    elif metric == "pending":
        filters.append(Task.trang_thai != "Đóng")
    elif metric == "overdue":
        filters.append(
            and_(
                Task.trang_thai != "Đóng",
                or_(
                    Task.thoi_gian_con_lai < 0,
                    and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                )
            )
        )
    elif metric == "closed_today":
        filters.append(
            and_(
                Task.trang_thai == "Đóng",
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= today_start
            )
        )
    elif metric == "closed_last_7_days":
        filters.append(
            and_(
                Task.trang_thai == "Đóng",
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) != None,
                func.coalesce(Task.thoi_diem_ft_hoan_thanh, Task.thoi_diem_cd_dong) >= seven_days_ago
            )
        )
    elif metric == "cho_cd_tiep_nhan":
        filters.append(
            or_(
                Task.trang_thai == "Chờ CD tiếp nhận",
                Task.trang_thai == "Chờ CĐ tiếp nhận",
                Task.trang_thai.ilike("%chờ%tiếp nhận%")
            )
        )
    elif metric == "ft_hoan_thanh":
        filters.append(
            or_(
                Task.trang_thai == "FT hoàn thành",
                Task.trang_thai.ilike("%FT hoàn thành%")
            )
        )
    elif metric == "tu_choi":
        filters.append(Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]))
    elif metric == "ft_tu_choi":
        filters.append(Task.trang_thai == "FT từ chối")
    elif metric == "cd_tu_choi":
        filters.append(Task.trang_thai.in_(["CD từ chối", "CĐ từ chối"]))
    elif metric == "overdue_tu_choi":
        filters.append(
            and_(
                Task.trang_thai.in_(["FT từ chối", "CD từ chối", "CĐ từ chối"]),
                or_(
                    Task.thoi_gian_con_lai < 0,
                    and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
                )
            )
        )

    # 4. Search query
    if search and search.strip():
        kw = f"%{search.strip()}%"
        filters.append(
            or_(
                Task.ma_cong_viec.ilike(kw),
                Task.noi_dung_cong_viec.ilike(kw),
                Task.ghi_chu.ilike(kw),
                Task.thue_bao.ilike(kw),
                Task.station.has(Station.code.ilike(kw)),
                Task.employee_assigned.has(Employee.name.ilike(kw)),
                Task.group.has(Group.name.ilike(kw))
            )
        )

    query = db.query(Task).filter(and_(*filters))
    total = query.count()

    # Sorting
    sort_column = getattr(Task, sort_by, Task.thoi_diem_yeu_cau_ket_thuc)
    if sort_order.lower() == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    # Pagination (support large page_size up to 50000 to display all rows directly)
    page_size = min(max(1, page_size), 50000)
    offset = (page - 1) * page_size
    items_raw = query.offset(offset).limit(page_size).all()

    # Pre-fetch counts of notes, history, and latest note text
    task_keys = [t.ma_cong_viec for t in items_raw]
    note_counts = {}
    history_counts = {}
    latest_notes = {}
    if task_keys:
        nc = db.query(TaskNote.ma_cong_viec, func.count(TaskNote.id))\
            .filter(TaskNote.ma_cong_viec.in_(task_keys))\
            .group_by(TaskNote.ma_cong_viec).all()
        note_counts = {k: v for k, v in nc}

        hc = db.query(TaskHistory.ma_cong_viec, func.count(TaskHistory.id))\
            .filter(TaskHistory.ma_cong_viec.in_(task_keys))\
            .group_by(TaskHistory.ma_cong_viec).all()
        history_counts = {k: v for k, v in hc}

        all_notes = db.query(TaskNote.ma_cong_viec, TaskNote.note_content)\
            .filter(TaskNote.ma_cong_viec.in_(task_keys))\
            .order_by(TaskNote.created_at.desc())\
            .all()
        for k, content in all_notes:
            if k not in latest_notes:
                latest_notes[k] = content

    items = []
    for t in items_raw:
        item = TaskListItem(
            ma_cong_viec=t.ma_cong_viec,
            ma_cong_viec_cha=t.ma_cong_viec_cha,
            loai_cong_viec=t.loai_cong_viec,
            noi_dung_cong_viec=t.noi_dung_cong_viec,
            ghi_chu=t.ghi_chu,
            trang_thai=t.trang_thai,
            trang_thai_hoan_thanh=t.trang_thai_hoan_thanh,
            thoi_diem_tao=t.thoi_diem_tao,
            thoi_diem_bat_dau_thuc_hien=t.thoi_diem_bat_dau_thuc_hien,
            thoi_diem_yeu_cau_ket_thuc=t.thoi_diem_yeu_cau_ket_thuc,
            thoi_gian_con_lai=t.thoi_gian_con_lai,
            thoi_diem_ft_hoan_thanh=t.thoi_diem_ft_hoan_thanh,
            thoi_diem_cd_dong=t.thoi_diem_cd_dong,
            thue_bao=t.thue_bao,
            loi=t.loi,
            assigned_to_id=t.assigned_to_id,
            group_id=t.group_id,
            employee_assigned_name=t.employee_assigned.name if t.employee_assigned else None,
            employee_created_name=t.employee_created.name if t.employee_created else None,
            group_name=t.group.name if t.group else None,
            system_name=t.system.name if t.system else None,
            unit_name=t.unit.name if t.unit else None,
            station_code=t.station.code if t.station else None,
            note_count=note_counts.get(t.ma_cong_viec, 0),
            history_count=history_counts.get(t.ma_cong_viec, 0),
            latest_note=latest_notes.get(t.ma_cong_viec),
        )
        items.append(item)

    total_pages = max(1, (total + page_size - 1) // page_size)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": items,
    }


def get_timeline_stats(db: Session, days: int = 14) -> List[Dict[str, Any]]:
    """Timeline stats for created and completed tasks."""
    # Group created tasks by date string
    created_query = db.query(
        func.strftime("%Y-%m-%d", Task.thoi_diem_tao).label("d"),
        func.count(Task.ma_cong_viec).label("cnt")
    ).filter(Task.thoi_diem_tao != None)\
     .group_by("d")\
     .order_by("d")\
     .limit(days).all()

    # Create map
    created_map = {r.d: r.cnt for r in created_query if r.d}

    completed_query = db.query(
        func.strftime("%Y-%m-%d", Task.thoi_diem_cd_dong).label("d"),
        func.count(Task.ma_cong_viec).label("cnt")
    ).filter(Task.thoi_diem_cd_dong != None)\
     .group_by("d")\
     .order_by("d")\
     .limit(days).all()

    completed_map = {r.d: r.cnt for r in completed_query if r.d}

    all_dates = sorted(set(list(created_map.keys()) + list(completed_map.keys())))
    if not all_dates:
        # Fallback dummy 7 days if empty
        base = datetime.utcnow().date()
        all_dates = [(base - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7, -1, -1)]

    timeline = []
    for d in all_dates[-days:]:
        timeline.append({
            "date": d,
            "created_count": created_map.get(d, 0),
            "completed_count": completed_map.get(d, 0),
        })
    return timeline


def get_overdue_stats(db: Session, group_id: Optional[int] = None, limit: int = 20) -> Dict[str, Any]:
    """Detailed overdue summary."""
    now = datetime.utcnow()
    condition = and_(
        ~Task.trang_thai.in_(COMPLETED_STATUSES),
        or_(
            Task.thoi_gian_con_lai < 0,
            and_(Task.thoi_diem_yeu_cau_ket_thuc != None, Task.thoi_diem_yeu_cau_ket_thuc < now)
        )
    )

    total_overdue = db.query(func.count(Task.ma_cong_viec)).filter(condition).scalar() or 0

    by_group = db.query(
        Group.name.label("group_name"),
        func.count(Task.ma_cong_viec).label("count")
    ).outerjoin(Group, Task.group_id == Group.id)\
     .filter(condition)\
     .group_by(Group.name)\
     .order_by(desc("count")).limit(10).all()

    by_emp = db.query(
        Employee.name.label("employee_name"),
        func.count(Task.ma_cong_viec).label("count")
    ).outerjoin(Employee, Task.assigned_to_id == Employee.id)\
     .filter(condition)\
     .group_by(Employee.name)\
     .order_by(desc("count")).limit(10).all()

    return {
        "total_overdue": total_overdue,
        "by_group": [{"group_name": r.group_name or "Chưa rõ", "count": r.count} for r in by_group],
        "by_employee": [{"employee_name": r.employee_name or "Chưa gán", "count": r.count} for r in by_emp],
    }
