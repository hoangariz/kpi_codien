import sys
sys.stdout.reconfigure(encoding='utf-8')

try:
    import backend.main
    print("Backend loaded successfully!")
    from backend.database import SessionLocal, engine
    from backend.models import Task, Employee, Group, ImportLog
    db = SessionLocal()
    print("Database connected!")
    print("Employee count:", db.query(Employee).count())
    print("Task count:", db.query(Task).count())
    print("ImportLog count:", db.query(ImportLog).count())
    db.close()
    print("All backend checks passed!")
except Exception as e:
    import traceback
    print("Error:", e)
    traceback.print_exc()
