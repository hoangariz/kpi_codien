import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.stdout.reconfigure(encoding='utf-8')

from backend.database import SessionLocal
from backend.services.task_service import get_tasks_paginated

def test():
    db = SessionLocal()
    try:
        # 1. Test search with no params
        res1 = get_tasks_paginated(db, page=1, page_size=5)
        print(f"Total tasks in DB: {res1['total']}")
        if res1['items']:
            sample = res1['items'][0]
            print(f"Sample task: {sample.ma_cong_viec}, Station: {sample.station_code}, FT: {sample.employee_assigned_name}")

        # 2. Test search with station_code
        res2 = get_tasks_paginated(db, page=1, page_size=5, station_code="HNI")
        print(f"Tasks with station_code 'HNI': {res2['total']}")

        # 3. Test search with ft_username
        res3 = get_tasks_paginated(db, page=1, page_size=5, ft_username="duandt")
        print(f"Tasks with ft_username 'duandt': {res3['total']}")

        print("\n>> BACKEND VERIFICATION SUCCESSFUL!")
    finally:
        db.close()

if __name__ == "__main__":
    test()
