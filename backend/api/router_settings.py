from typing import Dict
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.settings_service import (
    get_setting,
    set_setting,
    get_current_month_setting,
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
