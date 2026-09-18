import sqlite3

conn = sqlite3.connect('kpi_codien.db')
c = conn.cursor()
tables = c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    name = t[0]
    count = c.execute(f"SELECT COUNT(*) FROM `{name}`").fetchone()[0]
    print(f"{name}: {count} records")
