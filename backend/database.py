from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.config import DATABASE_URL

# Configure engine depending on database type (SQLite vs MySQL)
is_sqlite = DATABASE_URL.startswith("sqlite")

if is_sqlite:
    from sqlalchemy import event

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 60},
        echo=False
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=60000")
        except Exception:
            pass
        finally:
            cursor.close()
else:
    # MySQL / MariaDB connection pool optimized for aaPanel production
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=10,
        pool_recycle=3600,
        pool_pre_ping=True,
        echo=False
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
