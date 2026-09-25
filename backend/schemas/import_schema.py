from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_serializer


class ImportLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    stored_filename: Optional[str] = None
    file_size_bytes: Optional[int] = 0
    is_active: Optional[int] = 0
    imported_at: datetime
    total_rows: int
    filtered_out_count: int
    inserted_count: int
    updated_count: int
    unchanged_count: int
    status: str
    progress_percent: int
    error_message: Optional[str] = None
    filter_spm: Optional[int] = 1

    @field_serializer("imported_at")
    def serialize_imported_at(self, dt: datetime, _info):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class FilterOptionsResponse(BaseModel):
    groups: list[dict]
    employees: list[dict]
    task_types: list[str]
    statuses: list[str]
    systems: list[dict]
