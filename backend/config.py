import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Database URL: defaults to SQLite for local development, MySQL/MariaDB for aaPanel
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'kpi_codien.db'}"
)

# Upload storage directory
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Performance batch settings
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "5000"))

# App configs
APP_TITLE = "Hệ Thống Thống Kê & Theo Dõi Tiến Độ Công Việc Cơ Điện"
APP_VERSION = "1.0.0"
DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")
