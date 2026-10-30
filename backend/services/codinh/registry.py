import threading
import concurrent.futures
from datetime import datetime
from typing import Dict, List, Optional, Union, Any
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.services.codinh.base import BaseReport
from backend.services.codinh.importer import get_wo_version, get_cabinet_version
from backend.services.codinh.org import get_org_version
from backend.services.codinh.importer_qlctkt import get_qlctkt_version
from backend.services.codinh.reports.thc import ThcReport
from backend.services.codinh.reports.port_kem import PortKemReport
from backend.services.codinh.reports.qlctkt_trien_khai import QlctktTrienKhaiReport
from backend.services.codinh.reports.tong_hop_su_co import TongHopSuCoReport
from backend.services.codinh.reports.ton_tk_theo_ngay import TonTkTheoNgayReport

_cards_cache: Dict[str, Any] = {}
_cards_cache_lock = threading.Lock()


def clear_reports_cards_cache():
    global _cards_cache
    with _cards_cache_lock:
        _cards_cache.clear()

REPORTS: Dict[str, BaseReport] = {
    "thc": ThcReport(),
    "port_kem": PortKemReport(),
    "qlctkt_trien_khai": QlctktTrienKhaiReport(),
    "tong_hop_su_co": TongHopSuCoReport(),
    "ton_tk_theo_ngay": TonTkTheoNgayReport(),
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
        if ("ton_tk" in lower_key or "theo_ngay" in lower_key) and k == "ton_tk_theo_ngay":
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


def _compute_single_card(rep_key: str, target_month: Optional[str]) -> Dict[str, Any]:
    db_thread = SessionLocal()
    try:
        rep = REPORTS[rep_key]
        if getattr(rep, "time_param_type", "month") == "date" or rep.key == "qlctkt_trien_khai":
            target_date = target_month if (target_month and len(target_month.split("-")) == 3) else None
            stats = rep.compute_stats(db_thread, target_date=target_date)
        else:
            stats = rep.compute_stats(db_thread, target_month=target_month)
        summ = stats.get("summary", {})
        return {
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
            "gt_30d": summ.get("gt_30d", 0),
            "ton_su_co": summ.get("ton_su_co", 0),
            "hot": summ.get("hot", 0),
            "qua_han": summ.get("qua_han", 0),
            "nghiem_thu_n": summ.get("nghiem_thu_n", 0),
            "huy": summ.get("huy", 0),
            "selected_date": stats.get("selected_date"),
        }
    except Exception as ex:
        import logging
        logging.getLogger("uvicorn.error").exception(f"Error computing summary card for report {rep_key}: {ex}")
        rep = REPORTS.get(rep_key)
        return {
            "key": rep_key,
            "title": rep.title if rep else rep_key,
            "description": rep.description if rep else "",
            "has_cabinets": getattr(rep, "has_cabinets", False),
            "is_port_kem": getattr(rep, "is_port_kem", False),
            "tong_ton": 0,
            "qua_han": 0,
            "nghiem_thu_n": 0,
            "huy": 0,
            "error": str(ex),
        }
    finally:
        db_thread.close()


def get_reports_summary_cards(db: Session, target_month: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Computes mini KPI cards for all registered reports to display on the report selector.
    Optimized with parallel multi-threading and memory caching.
    """
    wo_ver = get_wo_version()
    cab_ver = get_cabinet_version()
    org_ver = get_org_version()
    qlctkt_ver = get_qlctkt_version()
    m_key = str(target_month or "all").strip().lower()

    now_dt = datetime.now()
    minute_bucket = (now_dt.minute // 5) * 5
    t_bucket = f"{now_dt.strftime('%Y%m%d%H')}{minute_bucket:02d}"
    cache_key = f"cards_{m_key}_wv{wo_ver}_cv{cab_ver}_ov{org_ver}_qv{qlctkt_ver}_{t_bucket}"

    with _cards_cache_lock:
        if cache_key in _cards_cache:
            return _cards_cache[cache_key]

    keys_order = list(REPORTS.keys())
    cards_dict = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(keys_order)) as executor:
        future_to_key = {
            executor.submit(_compute_single_card, k, target_month): k
            for k in keys_order
        }
        for future in concurrent.futures.as_completed(future_to_key):
            k = future_to_key[future]
            try:
                cards_dict[k] = future.result()
            except Exception as e:
                cards_dict[k] = {"key": k, "error": str(e)}

    ordered_cards = [cards_dict[k] for k in keys_order if k in cards_dict]
    with _cards_cache_lock:
        _cards_cache[cache_key] = ordered_cards
    return ordered_cards
