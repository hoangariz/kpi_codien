import json
from typing import Dict
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.settings_service import (
    get_setting,
    set_setting,
    get_current_month_setting,
)
from backend.services.config_migration_service import (
    export_system_config,
    import_system_config,
)

router = APIRouter(prefix="/api/settings", tags=["Settings"])


class SettingUpdate(BaseModel):
    key: str
    value: str
    description: str = ""


class SettingsResponse(BaseModel):
    current_month: str


@router.get("", response_model=SettingsResponse)
def get_all_settings(db: Session = Depends(get_db)):
    """Get active system settings."""
    current_month = get_current_month_setting(db)
    return {"current_month": current_month}


@router.post("")
def update_setting(payload: SettingUpdate, db: Session = Depends(get_db)):
    """Update a system setting."""
    val = set_setting(db, payload.key, payload.value, payload.description)
    return {"success": True, "key": payload.key, "value": val}


@router.get("/export-config")
def export_config_endpoint(db: Session = Depends(get_db)):
    """Xuất file JSON sao lưu toàn bộ cấu hình quản trị hệ thống."""
    config_data = export_system_config(db)
    content = json.dumps(config_data, ensure_ascii=False, indent=2)
    filename = "kpi_system_config.json"
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/import-config")
async def import_config_endpoint(
    file: UploadFile = File(...),
    overwrite: bool = True,
    db: Session = Depends(get_db)
):
    """Nạp file JSON sao lưu để khôi phục cấu hình quản trị hệ thống."""
    try:
        content = await file.read()
        config_data = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File JSON không hợp lệ: {str(e)}")

    if not isinstance(config_data, dict):
        raise HTTPException(status_code=400, detail="Cấu trúc file JSON cấu hình không đúng.")

    result = import_system_config(db, config_data, overwrite=overwrite)
    return {
        "status": "ok",
        "message": f"Khôi phục thành công: {result['categories']} danh mục, {result['fixed_reports']} báo cáo All-WO ({result['fixed_items']} mã WO), {result['tracking_boards']} bảng theo dõi ({result['tracking_tasks']} công việc), {result['settings']} cài đặt.",
        "counts": result
    }
