import sys
from backend.database import SessionLocal
from backend.models.codinh_org import CodinhEmployee

db = SessionLocal()
emps = db.query(CodinhEmployee).all()
print(f"Total employees: {len(emps)}")
for e in emps[:10]:
    print(f"ID={e.id}, user={e.username}, name={e.ho_ten}")
db.close()
