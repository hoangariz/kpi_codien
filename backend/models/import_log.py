from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from backend.database import Base


class ImportLog(Base):
    __tablename__ = "import_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    file_name = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=True)
    file_size_bytes = Column(Integer, default=0)
    is_active = Column(Integer, default=0)  # 1 if loaded in tasks table, 0 if archived
    imported_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    total_rows = Column(Integer, default=0)
    filtered_out_count = Column(Integer, default=0)
    inserted_count = Column(Integer, default=0)
    updated_count = Column(Integer, default=0)
    unchanged_count = Column(Integer, default=0)
    status = Column(String(50), default="PENDING", index=True)  # PENDING, PROCESSING, COMPLETED, FAILED
    progress_percent = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    filter_spm = Column(Integer, default=1)  # 1 = filter out SPM/SPM_VTNET, 0 = keep all
