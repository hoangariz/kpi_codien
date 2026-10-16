import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.database import SessionLocal
from backend.models.import_log import ImportLog

db = SessionLocal()
logs = db.query(ImportLog).order_by(ImportLog.id.desc()).all()
print(f"Tổng số bản ghi import_logs: {len(logs)}")
for l in logs:
    print(f"ID={l.id} | domain={l.domain} | is_active={l.is_active} | status={l.status} | file_name='{l.file_name}' | stored='{l.stored_filename}' | rows={l.inserted_count}/{l.total_rows}")
db.close()
