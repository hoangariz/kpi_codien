import re
import unicodedata
from typing import Optional


def normalize_key(val: Optional[str]) -> str:
    """Chuẩn hóa chuỗi dùng chung cho CĐBR / QLCTKT:
    - unicodedata.normalize('NFC')
    - gom nhiều khoảng trắng thành một
    - strip()
    - lower()
    """
    if val is None:
        return ""
    s = unicodedata.normalize("NFC", str(val))
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


# Hằng số chuẩn hóa cấu hình tập trung cho phân hệ Sự cố GNOC
SU_CO_TASK_TYPE_NORM = "vtnet_wo do bộ phận quản lý sự cố tạo"
SU_CO_KEYWORD_NORM = "sự cố"
HOT_PRIORITY_NORM = "hot"


def is_su_co_task(loai_cong_viec: Optional[str], noi_dung_cong_viec: Optional[str]) -> int:
    """Kiểm tra WO có phải sự cố theo định nghĩa:
    - loai_cong_viec chuẩn hóa == 'vtnet_wo do bộ phận quản lý sự cố tạo'
    - VÀ noi_dung_cong_viec chuẩn hóa chứa 'sự cố'
    (KHÔNG so với VTNET_WO và KHÔNG tính 'VTNET_WO created by other teams')
    """
    l_norm = normalize_key(loai_cong_viec)
    if l_norm != SU_CO_TASK_TYPE_NORM:
        return 0
    nd_norm = normalize_key(noi_dung_cong_viec)
    return 1 if SU_CO_KEYWORD_NORM in nd_norm else 0


def is_hot_priority(muc_do_uu_tien: Optional[str]) -> int:
    """Kiểm tra WO có phải HOT theo định nghĩa:
    - muc_do_uu_tien chuẩn hóa == 'hot'
    (Giá trị thật là 'Hot'; 'Nghiêm trọng', 'Rất nghiêm trọng' KHÔNG phải HOT)
    """
    return 1 if normalize_key(muc_do_uu_tien) == HOT_PRIORITY_NORM else 0


def is_tam_dung_status(trang_thai: Optional[str]) -> int:
    """Kiểm tra WO có phải Tạm dừng theo định nghĩa:
    - trang_thai chuẩn hóa == 'tạm dừng'
    """
    return 1 if normalize_key(trang_thai) == "tạm dừng" else 0


def is_open_status(trang_thai: Optional[str]) -> int:
    """Kiểm tra WO có phải Open theo định nghĩa:
    - trang_thai != 'Đóng'
    """
    return 0 if str(trang_thai or "").strip() == "Đóng" else 1
