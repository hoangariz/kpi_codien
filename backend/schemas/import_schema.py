from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


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


class FilterOptionsResponse(BaseModel):
    groups: list[dict]
    employees: list[dict]
    task_types: list[str]
    statuses: list[str]
    systems: list[dict]
