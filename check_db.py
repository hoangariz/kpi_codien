from pathlib import Path
from backend.database import SessionLocal, engine
from sqlalchemy import text

for fn in ["kpi_codien.db", "kpi_codien.db-wal", "kpi_codien.db-shm"]:
    p = Path(fn)
    if p.exists():
        print(f"File {fn}: {p.stat().st_size / (1024*1024):.2f} MB")

with engine.connect() as conn:
    tables = [r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()]
    print(f"\nTotal tables: {len(tables)}")
    for t in tables:
        cnt = conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
        print(f" - {t:<30}: {cnt:>10,} rows")
