from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from backend.database import Base

class QuickLink(Base):
    __tablename__ = "quick_links"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    url = Column(Text, nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=True)  # custom short link
    description = Column(Text, nullable=True)
    icon = Column(String(50), default="link")  # award, link, globe, file-text, book, etc.
    color = Column(String(30), default="#3b82f6")  # badge or icon accent color
    sort_order = Column(Integer, default=0)
    click_count = Column(Integer, default=0)
    created_by = Column(String(100), nullable=True)  # Người tạo
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
