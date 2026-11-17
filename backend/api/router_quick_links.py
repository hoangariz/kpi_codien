from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.database import get_db
from backend.models.quick_link import QuickLink

router = APIRouter(prefix="/api/quick-links", tags=["Quick Links"])


class QuickLinkCreate(BaseModel):
    title: str
    url: str
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = "link"
    color: Optional[str] = "#3b82f6"
    sort_order: Optional[int] = 0
    created_by: Optional[str] = None
    is_active: Optional[bool] = True


class QuickLinkUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    created_by: Optional[str] = None
    is_active: Optional[bool] = None


class QuickLinkOut(BaseModel):
    id: int
    title: str
    url: str
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = "link"
    color: Optional[str] = "#3b82f6"
    sort_order: int = 0
    click_count: int = 0
    created_by: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True


def seed_default_quick_links(db: Session):
    count = db.query(QuickLink).count()
    if count == 0:
        default_link = QuickLink(
            title="BẢNG ĐÁNH GIÁ KPI FT",
            url="/kpi",
            slug="kpi",
            description="Bảng đánh giá hệ số KPI FT chi tiết theo dữ liệu All-WO-HTH",
            icon="award",
            color="#2563eb",
            sort_order=1,
            created_by="Hệ thống",
            is_active=True
        )
        db.add(default_link)
        db.commit()


@router.get("", response_model=List[QuickLinkOut])
def list_quick_links(all_status: bool = False, db: Session = Depends(get_db)):
    """Lấy danh sách các liên kết tổng hợp."""
    seed_default_quick_links(db)
    query = db.query(QuickLink)
    if not all_status:
        query = query.filter(QuickLink.is_active == True)
    return query.order_by(QuickLink.sort_order.asc(), QuickLink.id.asc()).all()


@router.post("", response_model=QuickLinkOut)
def create_quick_link(payload: QuickLinkCreate, db: Session = Depends(get_db)):
    """Tạo mới một liên kết."""
    slug_val = payload.slug.strip().lower() if payload.slug and payload.slug.strip() else None
    if slug_val:
        existing = db.query(QuickLink).filter(QuickLink.slug == slug_val).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Custom link '{slug_val}' đã tồn tại!")

    link = QuickLink(
        title=payload.title.strip(),
        url=payload.url.strip(),
        slug=slug_val,
        description=payload.description.strip() if payload.description else "",
        icon=payload.icon or "link",
        color=payload.color or "#3b82f6",
        sort_order=payload.sort_order or 0,
        created_by=payload.created_by.strip() if payload.created_by else None,
        is_active=payload.is_active if payload.is_active is not None else True
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.put("/{link_id}", response_model=QuickLinkOut)
def update_quick_link(link_id: int, payload: QuickLinkUpdate, db: Session = Depends(get_db)):
    """Cập nhật thông tin liên kết."""
    link = db.query(QuickLink).filter(QuickLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Không tìm thấy liên kết!")

    if payload.slug is not None:
        slug_val = payload.slug.strip().lower() if payload.slug.strip() else None
        if slug_val and slug_val != link.slug:
            existing = db.query(QuickLink).filter(QuickLink.slug == slug_val, QuickLink.id != link_id).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Custom link '{slug_val}' đã tồn tại!")
        link.slug = slug_val

    if payload.title is not None:
        link.title = payload.title.strip()
    if payload.url is not None:
        link.url = payload.url.strip()
    if payload.description is not None:
        link.description = payload.description.strip()
    if payload.icon is not None:
        link.icon = payload.icon
    if payload.color is not None:
        link.color = payload.color
    if payload.sort_order is not None:
        link.sort_order = payload.sort_order
    if payload.created_by is not None:
        link.created_by = payload.created_by.strip() if payload.created_by.strip() else None
    if payload.is_active is not None:
        link.is_active = payload.is_active

    db.commit()
    db.refresh(link)
    return link


@router.delete("/{link_id}")
def delete_quick_link(link_id: int, db: Session = Depends(get_db)):
    """Xóa liên kết."""
    link = db.query(QuickLink).filter(QuickLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Không tìm thấy liên kết!")
    db.delete(link)
    db.commit()
    return {"success": True, "message": "Đã xóa liên kết thành công!"}


@router.post("/{link_id}/click")
def increment_click(link_id: int, db: Session = Depends(get_db)):
    """Ghi nhận lượt click vào liên kết."""
    link = db.query(QuickLink).filter(QuickLink.id == link_id).first()
    if link:
        link.click_count = (link.click_count or 0) + 1
        db.commit()
        return {"success": True, "click_count": link.click_count}
    return {"success": False}

