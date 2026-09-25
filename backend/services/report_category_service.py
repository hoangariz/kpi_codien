import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_, and_

from backend.models import Task, ReportCategory
from backend.models.dimensions import SystemModel
from backend.schemas.report_category_schema import ReportCategoryCreate, ReportCategoryUpdate
from backend.services.settings_service import get_current_month_setting


CLOSED_STATUSES = ["Đóng", "FT hoàn thành", "FT Hoàn thành", "FT Hoàn Thành"]


def _parse_filter_values(raw: Optional[str]) -> List[str]:
    """Deserialize filter_values JSON string → list. Returns [] on error."""
    if not raw:
        return []
    try:
        vals = json.loads(raw)
        return [v for v in vals if v and str(v).strip()] if isinstance(vals, list) else []
    except Exception:
        return []


def _build_type_conditions(cat, db: Session):
    """
    Build SQLAlchemy filter conditions based on cat.filter_mode and cat.filter_values.
    Returns a list of conditions to be passed to .filter(*conds).
    """
    mode = (cat.filter_mode or "by_loai").strip()
    values = _parse_filter_values(cat.filter_values)

    if not values:
        # Fallback: dùng loai_cong_viec cũ
        if cat.loai_cong_viec and not cat.loai_cong_viec.startswith("["):
            return [Task.loai_cong_viec == cat.loai_cong_viec]
        return []

    if mode == "by_system":
        # Lọc theo hệ thống: join Task → SystemModel, filter name IN values
        upper_values = [v.upper().strip() for v in values]
        sys_ids = db.query(SystemModel.id).filter(
            func.upper(func.trim(SystemModel.name)).in_(upper_values)
        ).scalar_subquery()
        return [Task.system_id.in_(sys_ids)]
    else:
        # by_loai (default): lọc theo loai_cong_viec IN values
        if len(values) == 1:
            return [Task.loai_cong_viec == values[0]]
        return [Task.loai_cong_viec.in_(values)]


def get_report_categories(
    db: Session,
    target_month: Optional[str] = None,
    include_summary: bool = True,
    domain: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get report categories, optionally filtered by domain ('codien' | 'codinh').
    Optionally computes mini summary (total, closed, pending, overdue, rate)
    using the active month time rule. Supports multi-value filter_mode/filter_values.
    """
    query = db.query(ReportCategory)
    if domain:
        query = query.filter(ReportCategory.domain == domain)

    cats = query.order_by(
        ReportCategory.sort_order.asc(),
        ReportCategory.created_at.asc()
    ).all()

    now = datetime.utcnow()
    active_month = target_month or get_current_month_setting(db)
    try:
        y_str, m_str = active_month.split("-")
        month_start = datetime(int(y_str), int(m_str), 1, 0, 0, 0)
    except Exception:
        month_start = datetime(now.year, now.month, 1, 0, 0, 0)

    output = []
    for cat in cats:
        item = {
            "id": cat.id,
            "name": cat.name,
            "loai_cong_viec": cat.loai_cong_viec,
            "description": cat.description,
            "icon": cat.icon,
            "sort_order": cat.sort_order,
            "is_default": cat.is_default,
            "exclude_closed_prior_months": cat.exclude_closed_prior_months,
            "filter_mode": cat.filter_mode or "by_loai",
            "filter_values": _parse_filter_values(cat.filter_values),
            "domain": getattr(cat, "domain", "codien") or "codien",
            "created_at": cat.created_at,
            "updated_at": cat.updated_at,
            "summary": None
        }

        if include_summary:
            base_conds = _build_type_conditions(cat, db)
            if not base_conds:
                item["summary"] = {"total": 0, "closed": 0, "pending": 0, "overdue": 0, "completion_rate": 0.0}
                # Still process sub_categories
                item["sub_categories"] = [
                    {
                        "id": sub.id,
                        "category_id": sub.category_id,
                        "name": sub.name,
                        "keyword": sub.keyword,
                        "description": sub.description,
                        "sort_order": sub.sort_order,
                        "created_at": sub.created_at,
                        "updated_at": sub.updated_at,
                        "summary": None
                    }
                    for sub in (cat.sub_categories or [])
                ]
                output.append(item)
                continue

            exclude_closed = cat.exclude_closed_prior_months if cat.exclude_closed_prior_months is not None else True
            if exclude_closed:
                base_conds.append(
                    or_(
                        Task.thoi_diem_yeu_cau_ket_thuc == None,
                        Task.thoi_diem_yeu_cau_ket_thuc >= month_start,
                        ~Task.trang_thai.in_(CLOSED_STATUSES)
                    )
                )

            res = db.query(
                func.count(Task.ma_cong_viec).label("total"),
                func.sum(case((Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("closed"),
                func.sum(case((~Task.trang_thai.in_(CLOSED_STATUSES), 1), else_=0)).label("pending"),
                func.sum(
                    case(
                        (
                            and_(
                                ~Task.trang_thai.in_(CLOSED_STATUSES),
                                or_(
                                    Task.thoi_gian_con_lai < 0,
                                    and_(
                                        Task.thoi_diem_yeu_cau_ket_thuc != None,
                                        Task.thoi_diem_yeu_cau_ket_thuc < now
                                    )
                                )
                            ),
                            1
                        ),
                        else_=0
                    )
                ).label("overdue")
            ).filter(*base_conds).first()

            tot = (res.total if res else 0) or 0
            cl = (res.closed if res else 0) or 0
            pe = (res.pending if res else 0) or 0
            ov = (res.overdue if res else 0) or 0
            rate = round((cl / tot * 100), 1) if tot > 0 else 0.0

            item["summary"] = {
                "total": tot,
                "closed": cl,
                "pending": pe,
                "overdue": ov,
                "completion_rate": rate
            }

        # Include sub_categories
        item["sub_categories"] = [
            {
                "id": sub.id,
                "category_id": sub.category_id,
                "name": sub.name,
                "keyword": sub.keyword,
                "description": sub.description,
                "sort_order": sub.sort_order,
                "created_at": sub.created_at,
                "updated_at": sub.updated_at,
                "summary": None
            }
            for sub in (cat.sub_categories or [])
        ]

        output.append(item)

    return output


def get_report_category_by_id(db: Session, cat_id: int) -> Optional[ReportCategory]:
    return db.query(ReportCategory).filter(ReportCategory.id == cat_id).first()


def create_report_category(db: Session, payload: ReportCategoryCreate) -> ReportCategory:
    clean_name = payload.name.strip()
    if not clean_name:
        raise ValueError("Tên bảng báo cáo không được để trống")

    mode = (payload.filter_mode or "by_loai").strip()
    values = [v.strip() for v in (payload.filter_values or []) if v and v.strip()]

    if not values and payload.loai_cong_viec and payload.loai_cong_viec.strip():
        # Backward compat: nếu chỉ dùng loai_cong_viec cũ
        values = [payload.loai_cong_viec.strip()]

    if not values:
        raise ValueError("Vui lòng chọn ít nhất một giá trị lọc (loại công việc hoặc hệ thống)")

    # Populate loai_cong_viec for backward compat
    if mode == "by_loai":
        clean_type = values[0]
    else:
        clean_type = f"[Hệ thống: {', '.join(values)}]"

    cat = ReportCategory(
        name=clean_name,
        loai_cong_viec=clean_type,
        description=payload.description.strip() if payload.description else None,
        icon=payload.icon.strip() if payload.icon else None,
        sort_order=payload.sort_order or 0,
        is_default=False,
        exclude_closed_prior_months=payload.exclude_closed_prior_months if payload.exclude_closed_prior_months is not None else True,
        filter_mode=mode,
        filter_values=json.dumps(values, ensure_ascii=False),
        domain=(payload.domain or "codien").strip(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def update_report_category(
    db: Session,
    cat_id: int,
    payload: ReportCategoryUpdate
) -> Optional[ReportCategory]:
    cat = db.query(ReportCategory).filter(ReportCategory.id == cat_id).first()
    if not cat:
        return None

    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise ValueError("Tên bảng báo cáo không được để trống")
        cat.name = clean_name

    # Handle filter_mode + filter_values update
    if payload.filter_values is not None:
        mode = (payload.filter_mode or cat.filter_mode or "by_loai").strip()
        values = [v.strip() for v in payload.filter_values if v and v.strip()]
        if values:
            cat.filter_mode = mode
            cat.filter_values = json.dumps(values, ensure_ascii=False)
            if mode == "by_loai":
                cat.loai_cong_viec = values[0]
            else:
                cat.loai_cong_viec = f"[Hệ thống: {', '.join(values)}]"
    elif payload.filter_mode is not None:
        cat.filter_mode = payload.filter_mode.strip()

    # Backward compat: direct loai_cong_viec update (only if filter_values not provided)
    if payload.loai_cong_viec is not None and payload.filter_values is None:
        clean_type = payload.loai_cong_viec.strip()
        if not clean_type:
            raise ValueError("Loại công việc không được để trống")
        cat.loai_cong_viec = clean_type
        cat.filter_mode = "by_loai"
        cat.filter_values = json.dumps([clean_type], ensure_ascii=False)

    if payload.description is not None:
        cat.description = payload.description.strip() if payload.description.strip() else None

    if payload.icon is not None:
        cat.icon = payload.icon.strip() if payload.icon.strip() else None

    if payload.exclude_closed_prior_months is not None:
        cat.exclude_closed_prior_months = payload.exclude_closed_prior_months

    if payload.sort_order is not None:
        cat.sort_order = payload.sort_order

    if payload.domain is not None:
        cat.domain = payload.domain.strip()

    cat.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cat)
    return cat


def delete_report_category(db: Session, cat_id: int) -> bool:
    cat = db.query(ReportCategory).filter(ReportCategory.id == cat_id).first()
    if not cat:
        return False
    if cat.is_default:
        raise ValueError("Không thể xoá loại báo cáo mặc định của hệ thống")

    db.delete(cat)
    db.commit()
    return True


# =========================================================================
# SUB-CATEGORIES (ĐẦU VIỆC CON CẤU HÌNH THEO TỪ KHÓA)
# =========================================================================

from backend.models.report_category import ReportSubCategory
from backend.schemas.report_category_schema import ReportSubCategoryCreate, ReportSubCategoryUpdate


def create_sub_category(
    db: Session,
    category_id: int,
    payload: ReportSubCategoryCreate
) -> ReportSubCategory:
    """
    Tạo đầu việc con (bảng con) theo từ khóa trong 'Nội dung công việc'.
    Kiểm tra trùng lặp keyword: Nếu keyword đã được dùng ở bảng con khác trong cùng category, báo lỗi ngay!
    """
    cat = db.query(ReportCategory).filter(ReportCategory.id == category_id).first()
    if not cat:
        raise ValueError("Không tìm thấy bảng báo cáo mẹ")

    clean_name = payload.name.strip()
    clean_kw = payload.keyword.strip()

    if not clean_name:
        raise ValueError("Tên bảng con không được để trống")
    if not clean_kw:
        raise ValueError("Từ khóa (keyword) không được để trống")

    # Kiểm tra trùng lặp keyword không phân biệt chữ hoa / thường trong cùng category_id
    existing = db.query(ReportSubCategory).filter(
        ReportSubCategory.category_id == category_id,
        func.lower(ReportSubCategory.keyword) == clean_kw.lower()
    ).first()

    if existing:
        raise ValueError(
            f"Từ khóa '{clean_kw}' đã được sử dụng ở bảng con '{existing.name}'. Mỗi đầu việc con phải có từ khóa riêng biệt!"
        )

    sub = ReportSubCategory(
        category_id=category_id,
        name=clean_name,
        keyword=clean_kw,
        description=payload.description.strip() if payload.description else None,
        sort_order=payload.sort_order or 0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def update_sub_category(
    db: Session,
    sub_id: int,
    payload: ReportSubCategoryUpdate
) -> Optional[ReportSubCategory]:
    """Cập nhật thông tin bảng con, kiểm tra trùng lặp từ khóa."""
    sub = db.query(ReportSubCategory).filter(ReportSubCategory.id == sub_id).first()
    if not sub:
        return None

    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise ValueError("Tên bảng con không được để trống")
        sub.name = clean_name

    if payload.keyword is not None:
        clean_kw = payload.keyword.strip()
        if not clean_kw:
            raise ValueError("Từ khóa không được để trống")

        # Kiểm tra trùng lặp với các bảng con khác trong cùng category
        existing = db.query(ReportSubCategory).filter(
            ReportSubCategory.category_id == sub.category_id,
            ReportSubCategory.id != sub.id,
            func.lower(ReportSubCategory.keyword) == clean_kw.lower()
        ).first()

        if existing:
            raise ValueError(
                f"Từ khóa '{clean_kw}' đã được sử dụng ở bảng con '{existing.name}'. Mỗi đầu việc con phải có từ khóa riêng biệt!"
            )
        sub.keyword = clean_kw

    if payload.description is not None:
        sub.description = payload.description.strip() if payload.description.strip() else None

    if payload.sort_order is not None:
        sub.sort_order = payload.sort_order

    sub.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(sub)
    return sub


def delete_sub_category(db: Session, sub_id: int) -> bool:
    """Xóa một bảng con."""
    sub = db.query(ReportSubCategory).filter(ReportSubCategory.id == sub_id).first()
    if not sub:
        return False

    db.delete(sub)
    db.commit()
    return True
