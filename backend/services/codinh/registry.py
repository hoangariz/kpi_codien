from typing import Dict, List, Optional, Union, Any
from sqlalchemy.orm import Session

from backend.services.codinh.base import BaseReport
from backend.services.codinh.reports.thc import ThcReport
from backend.services.codinh.reports.port_kem import PortKemReport
from backend.services.codinh.reports.qlctkt_trien_khai import QlctktTrienKhaiReport
from backend.services.codinh.reports.tong_hop_su_co import TongHopSuCoReport

REPORTS: Dict[str, BaseReport] = {
    "thc": ThcReport(),
    "port_kem": PortKemReport(),
    "qlctkt_trien_khai": QlctktTrienKhaiReport(),
    "tong_hop_su_co": TongHopSuCoReport(),
}

# Legacy category id map for backward compatibility
LEGACY_CATEGORY_MAP: Dict[Union[int, str], str] = {
    13: "thc",
    "13": "thc",
    14: "port_kem",
    "14": "port_kem",
}


def get_report(key_or_id: Optional[Union[str, int]] = None) -> BaseReport:
    """
    Retrieves the report instance by key or legacy category_id.
    Defaults to 'thc' if not found or empty.
    """
    if key_or_id is None:
        return REPORTS["thc"]

    # Check direct key
    str_key = str(key_or_id).strip()
    if str_key in REPORTS:
        return REPORTS[str_key]

    # Check legacy category id
    if key_or_id in LEGACY_CATEGORY_MAP or str_key in LEGACY_CATEGORY_MAP:
        mapped_key = LEGACY_CATEGORY_MAP.get(key_or_id) or LEGACY_CATEGORY_MAP.get(str_key)
        if mapped_key in REPORTS:
            return REPORTS[mapped_key]

    # Check case-insensitive
    lower_key = str_key.lower()
    for k, rep in REPORTS.items():
        if k.lower() == lower_key:
            return rep
        if "port" in lower_key and k == "port_kem":
            return rep
        if "thc" in lower_key and k == "thc":
            return rep
        if "su_co" in lower_key and k == "tong_hop_su_co":
            return rep

    # Default to THC
    return REPORTS["thc"]


def list_reports() -> List[Dict[str, Any]]:
    """Returns metadata list of all registered reports."""
    items = []
    for k, rep in REPORTS.items():
        items.append({
            "key": rep.key,
            "title": rep.title,
            "description": rep.description,
            "task_type": rep.task_type,
            "has_cabinets": rep.has_cabinets,
            "is_port_kem": rep.is_port_kem,
        })
    return items


def get_reports_summary_cards(db: Session, target_month: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Computes mini KPI cards for all registered reports to display on the report selector.
    """
    cards = []
    for k, rep in REPORTS.items():
        try:
            if getattr(rep, "time_param_type", "month") == "date" or rep.key == "qlctkt_trien_khai":
                target_date = target_month if (target_month and len(target_month.split("-")) == 3) else None
                stats = rep.compute_stats(db, target_date=target_date)
            else:
                stats = rep.compute_stats(db, target_month=target_month)
            summ = stats.get("summary", {})
            cards.append({
                "key": rep.key,
                "title": rep.title,
                "description": rep.description,
                "has_cabinets": rep.has_cabinets,
                "is_port_kem": rep.is_port_kem,
                "total_wos": summ.get("total_wos", 0),
                "closed_wos": summ.get("closed_wos", 0),
                "pending_wos": summ.get("pending_wos", 0),
                "overdue_wos": summ.get("overdue_wos", 0),
                "wo_rate": summ.get("wo_rate", 0.0),
                "cabinet_rate": summ.get("cabinet_rate", 0.0),
                "total_cabinets": summ.get("total_cabinets", 0),
                "completed_cabinets": summ.get("completed_cabinets", 0),
                "home_kem_count": summ.get("home_kem_count", 0),
                "port_kem_count": summ.get("port_kem_count", 0),
                "tong_ton": summ.get("tong_ton", 0),
                "ton_su_co": summ.get("ton_su_co", 0),
                "hot": summ.get("hot", 0),
                "qua_han": summ.get("qua_han", 0),
                "nghiem_thu_n": summ.get("nghiem_thu_n", 0),
                "huy": summ.get("huy", 0),
                "selected_date": stats.get("selected_date"),
            })
        except Exception as ex:
            import logging
            logging.getLogger("uvicorn.error").exception(f"Error computing summary card for report {rep.key}: {ex}")
            cards.append({
                "key": rep.key,
                "title": rep.title,
                "description": rep.description,
                "has_cabinets": rep.has_cabinets,
                "is_port_kem": rep.is_port_kem,
                "tong_ton": 0,
                "qua_han": 0,
                "nghiem_thu_n": 0,
                "huy": 0,
                "error": str(ex),
            })
    return cards
