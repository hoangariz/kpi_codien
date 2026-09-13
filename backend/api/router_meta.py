from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import distinct

from backend.database import get_db
from backend.models import Group, Employee, SystemModel, TaskType, Task

router = APIRouter(prefix="/api/meta", tags=["Metadata"])


@router.get("/filters")
def get_filter_options(db: Session = Depends(get_db)):
    """Fetch distinct lists for select dropdowns in filters."""
    groups = db.query(Group.id, Group.name).order_by(Group.name).all()
    employees = db.query(Employee.id, Employee.name).order_by(Employee.name).all()
    systems = db.query(SystemModel.id, SystemModel.name).order_by(SystemModel.name).all()

    # Get distinct task types directly from tasks table for accuracy
    task_types_q = db.query(distinct(Task.loai_cong_viec))\
        .filter(Task.loai_cong_viec != None)\
        .order_by(Task.loai_cong_viec).all()
    task_types = [t[0] for t in task_types_q if t[0]]

    # Get distinct statuses
    statuses_q = db.query(distinct(Task.trang_thai))\
        .filter(Task.trang_thai != None)\
        .order_by(Task.trang_thai).all()
    statuses = [s[0] for s in statuses_q if s[0]]

    return {
        "groups": [{"id": g.id, "name": g.name} for g in groups],
        "employees": [{"id": e.id, "name": e.name} for e in employees],
        "systems": [{"id": s.id, "name": s.name} for s in systems],
        "task_types": task_types,
        "statuses": statuses,
    }
