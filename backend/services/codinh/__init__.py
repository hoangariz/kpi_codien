from typing import Optional, List, Dict, Any, Union
from sqlalchemy.orm import Session

from backend.services.codinh.base import BaseReport, clear_codinh_stats_cache
from backend.services.codinh.registry import (
    REPORTS,
    get_report,
    list_reports,
    get_reports_summary_cards,
)
from backend.services.codinh.org import (
    seed_org_from_excel,
    get_org_lookup,
    get_org_tree,
    get_unmatched_usernames,
    set_team_leader,
    get_org_version,
    bump_org_version,
)
from backend.services.codinh.importer import (
    import_codinh_wos_from_excel,
    process_codinh_wos_import,
    run_codinh_import_job,
    import_cabinets_from_excel,
    get_codinh_import_logs,
    activate_codinh_import,
    delete_codinh_import,
    get_wo_version,
    get_cabinet_version,
)


def get_codinh_stats(
    db: Session,
    report: Optional[str] = None,
    category_id: Optional[Union[int, str]] = None,
    target_month: Optional[str] = None,
    target_date: Optional[str] = None,
    now_override: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Unified entry point for getting report statistics.
    Supports either report key (e.g. 'thc', 'port_kem', 'qlctkt_trien_khai') or legacy category_id (13, 14).
    """
    key_or_id = report if report is not None else category_id
    rep = get_report(key_or_id)
    if getattr(rep, "time_param_type", "month") == "date":
        return rep.compute_stats(db, target_date=target_date, now_override=now_override)
    return rep.compute_stats(db, target_month=target_month)


def get_codinh_drilldown_tasks(
    db: Session,
    report: Optional[str] = None,
    category_id: Optional[Union[int, str]] = None,
    target_month: Optional[str] = None,
    target_date: Optional[str] = None,
    metric: str = "total",
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
    """
    Unified entry point for drilldown tasks.
    Supports report key or legacy category_id.
    """
    key_or_id = report if report is not None else category_id
    rep = get_report(key_or_id)

    # Only pass sub_metric to reports that support dual-tab drilldown (tong_hop_su_co)
    sub_metric = kwargs.pop("sub_metric", None)
    if getattr(rep, "key", None) == "tong_hop_su_co" and sub_metric:
        kwargs["sub_metric"] = sub_metric

    if getattr(rep, "time_param_type", "month") == "date":
        return rep.get_drilldown(
            db=db,
            target_date=target_date,
            metric=metric,
            filter_type=filter_type,
            filter_id=filter_id,
            target_name=target_name,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            page_size=page_size,
            now_override=now_override,
            **kwargs,
        )
    return rep.get_drilldown(
        db=db,
        target_month=target_month,
        metric=metric,
        filter_type=filter_type,
        filter_id=filter_id,
        target_name=target_name,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
        **kwargs,
    )


def get_codinh_meta_options(db: Session) -> Dict[str, List[str]]:
    """Options for dropdowns (kept for backward compatibility)."""
    from backend.models.task_codinh import TaskCodinh
    task_types = [r[0] for r in db.query(TaskCodinh.loai_cong_viec).distinct().all() if r[0]]
    systems = [r[0] for r in db.query(TaskCodinh.he_thong).distinct().all() if r[0]]
    return {
        "task_types": sorted(task_types),
        "systems": sorted(systems),
    }


def seed_default_codinh_if_needed(db: Session):
    """Seed org hierarchy from Excel if needed."""
    seed_org_from_excel(db)


__all__ = [
    "BaseReport",
    "clear_codinh_stats_cache",
    "REPORTS",
    "get_report",
    "list_reports",
    "get_reports_summary_cards",
    "seed_org_from_excel",
    "get_org_lookup",
    "get_org_tree",
    "get_unmatched_usernames",
    "set_team_leader",
    "get_org_version",
    "bump_org_version",
    "import_codinh_wos_from_excel",
    "process_codinh_wos_import",
    "run_codinh_import_job",
    "import_cabinets_from_excel",
    "get_codinh_import_logs",
    "activate_codinh_import",
    "delete_codinh_import",
    "get_codinh_stats",
    "get_codinh_drilldown_tasks",
    "get_codinh_meta_options",
    "seed_default_codinh_if_needed",
    "import_qlctkt_from_excel",
    "get_unmatched_qlctkt_names",
    "ensure_org_columns_and_backfill",
    "normalize_key",
]

from backend.services.codinh.importer_qlctkt import import_qlctkt_from_excel
from backend.services.codinh.org import get_unmatched_qlctkt_names, ensure_org_columns_and_backfill
from backend.services.codinh.normalize import normalize_key
