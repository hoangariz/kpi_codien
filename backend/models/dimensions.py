from sqlalchemy import Column, Integer, String
from backend.database import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), unique=True, index=True, nullable=False)


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, index=True, nullable=False)


class TaskType(Base):
    __tablename__ = "task_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, index=True, nullable=False)


class SystemModel(Base):
    __tablename__ = "systems"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), nullable=True)
    name = Column(String(200), unique=True, index=True, nullable=False)


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, index=True, nullable=False)


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
