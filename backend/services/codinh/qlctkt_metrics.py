from sqlalchemy import and_, or_, func, case
from backend.database import is_sqlite
from backend.models.task_qlctkt import TaskQlctkt


def get_qlctkt_ton_tk_condition():
    """Điều kiện Tồn TK theo định nghĩa chuẩn dùng chung cho QLCTKT và Tổng hợp Sự cố:
    - tien_do ∉ {'Kết thúc', 'Cập nhật hồ sơ', 'Hủy'}
    - NOT is_huy
    - NOT is_cskh (is_cskh_2022 == False)
    """
    return and_(
        ~func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_([
            "Kết thúc", "kết thúc", "Cập nhật hồ sơ", "cập nhật hồ sơ", "Hủy", "huỷ"
        ]),
        TaskQlctkt.is_huy == False,
        TaskQlctkt.is_cskh_2022 == False,
    )


def get_qlctkt_nghiem_thu_condition(selected_date: str):
    """Điều kiện Nghiệm thu trong ngày n dùng chung:
    - tien_do == 'Kết thúc'
    - date(ngay_ket_thuc_thuc_te) == selected_date
    - NOT is_cskh (is_cskh_2022 == False)
    """
    if is_sqlite:
        date_expr = func.strftime("%Y-%m-%d", TaskQlctkt.ngay_ket_thuc_thuc_te)
    else:
        date_expr = func.date_format(TaskQlctkt.ngay_ket_thuc_thuc_te, "%Y-%m-%d")

    return and_(
        func.trim(func.coalesce(TaskQlctkt.tien_do, "")).in_(["Kết thúc", "kết thúc"]),
        date_expr == selected_date,
        TaskQlctkt.is_cskh_2022 == False,
    )
