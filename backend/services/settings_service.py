from datetime import datetime
from sqlalchemy.orm import Session
from backend.models.settings import SystemSetting


def get_setting(db: Session, key: str, default: str = "") -> str:
    """Get setting value by key or return default."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        return setting.value
    # If not exists, insert default
    new_setting = SystemSetting(
        key=key,
        value=default,
        updated_at=datetime.utcnow()
    )
    db.add(new_setting)
    db.commit()
    return default


def set_setting(db: Session, key: str, value: str, description: str = "") -> str:
    """Upsert setting value."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        setting.value = value
        if description:
            setting.description = description
        setting.updated_at = datetime.utcnow()
    else:
        setting = SystemSetting(
            key=key,
            value=value,
            description=description,
            updated_at=datetime.utcnow()
        )
        db.add(setting)
    db.commit()
    return setting.value


def get_current_month_setting(db: Session) -> str:
    """Get active month setting in format YYYY-MM (e.g. 2026-09)."""
    default_month = datetime.utcnow().strftime("%Y-%m")
    return get_setting(db, "current_month", default_month)
