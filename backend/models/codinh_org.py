from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.database import Base


class CodinhCluster(Base):
    __tablename__ = "codinh_clusters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ma_cum = Column(String(50), unique=True, nullable=False, index=True)
    ten_cum = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    teams = relationship("CodinhTeam", back_populates="cluster", cascade="all, delete-orphan", order_by="CodinhTeam.sort_order")


class CodinhTeam(Base):
    __tablename__ = "codinh_teams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cluster_id = Column(Integer, ForeignKey("codinh_clusters.id", ondelete="CASCADE"), nullable=False, index=True)
    ma_doi = Column(String(50), nullable=False)
    ten_doi = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    cluster = relationship("CodinhCluster", back_populates="teams")
    employees = relationship("CodinhEmployee", back_populates="team", cascade="all, delete-orphan", order_by="CodinhEmployee.sort_order")

    __table_args__ = (
        UniqueConstraint("cluster_id", "ma_doi", name="uq_cluster_madoi"),
    )


class CodinhEmployee(Base):
    __tablename__ = "codinh_employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_id = Column(Integer, ForeignKey("codinh_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    username = Column(String(100), nullable=False)
    username_key = Column(String(100), unique=True, nullable=False, index=True)
    ho_ten = Column(String(255), nullable=False)
    ho_ten_key = Column(String(255), nullable=True, index=True)
    la_doi_truong = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    team = relationship("CodinhTeam", back_populates="employees")
