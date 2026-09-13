import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import APP_TITLE, APP_VERSION
from backend.database import engine, Base
# Import all models to ensure metadata registration
import backend.models
from backend.api.router_tasks import router as tasks_router
from backend.api.router_stats import router as stats_router
from backend.api.router_imports import router as imports_router
from backend.api.router_meta import router as meta_router
from backend.api.router_settings import router as settings_router

# Create database tables automatically
Base.metadata.create_all(bind=engine)

def auto_migrate_db():
    from sqlalchemy import text
    with engine.connect() as conn:
        for col_def in [
            "ALTER TABLE import_logs ADD COLUMN stored_filename VARCHAR(255)",
            "ALTER TABLE import_logs ADD COLUMN file_size_bytes INTEGER DEFAULT 0",
            "ALTER TABLE import_logs ADD COLUMN is_active INTEGER DEFAULT 0",
        ]:
            try:
                conn.execute(text(col_def))
                conn.commit()
            except Exception:
                pass

        try:
            conn.execute(text("UPDATE import_logs SET stored_filename = file_name WHERE stored_filename IS NULL"))
            conn.execute(text("UPDATE import_logs SET is_active = 1 WHERE id = (SELECT id FROM import_logs WHERE status = 'COMPLETED' ORDER BY imported_at DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM import_logs WHERE is_active = 1)"))
            conn.commit()
        except Exception:
            pass

auto_migrate_db()

app = FastAPI(
    title=APP_TITLE,
    version=APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS configuration for development and aaPanel production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(tasks_router)
app.include_router(stats_router)
app.include_router(imports_router)
app.include_router(meta_router)
app.include_router(settings_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": APP_TITLE, "version": APP_VERSION}


# Serve React static build if dist folder exists (e.g. on aaPanel single-server or production)
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't hijack /api calls
        if full_path.startswith("api"):
            return {"error": "API route not found"}
        target = DIST_DIR / full_path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(DIST_DIR / "index.html")
