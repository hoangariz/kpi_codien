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
from backend.api.router_tracking import router as tracking_router
from backend.api.router_report_categories import router as reports_router
from backend.api.router_fixed_wo import router as fixed_wo_router

# Create database tables automatically (including report_categories)
Base.metadata.create_all(bind=engine)

def auto_migrate_db():
    from sqlalchemy import text
    with engine.connect() as conn:
        for col_def in [
            "ALTER TABLE import_logs ADD COLUMN stored_filename VARCHAR(255)",
            "ALTER TABLE import_logs ADD COLUMN file_size_bytes INTEGER DEFAULT 0",
            "ALTER TABLE import_logs ADD COLUMN is_active INTEGER DEFAULT 0",
            "ALTER TABLE tracking_boards ADD COLUMN loai_cong_viec VARCHAR(255)",
            "ALTER TABLE import_logs ADD COLUMN filter_spm INTEGER DEFAULT 1",
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

        # Migration: add exclude_closed_prior_months to report_categories if not present
        try:
            conn.execute(text("ALTER TABLE report_categories ADD COLUMN exclude_closed_prior_months BOOLEAN DEFAULT 1"))
            conn.commit()
        except Exception:
            pass

        # Seed default report category if empty
        try:
            cnt = conn.execute(text("SELECT COUNT(*) FROM report_categories")).scalar()
            if not cnt or cnt == 0:
                conn.execute(text("""
                    INSERT INTO report_categories (name, loai_cong_viec, description, is_default, exclude_closed_prior_months, sort_order)
                    VALUES (
                        'Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS',
                        'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS',
                        'Báo cáo tự động loại bỏ các việc đã đóng tháng trước. Bảng tính chi tiết theo Nhân viên và Nhóm điều phối.',
                        1,
                        1,
                        1
                    )
                """))
                conn.commit()
        except Exception:
            pass

        # Seed default sub-categories for maintenance category if empty
        try:
            cats = conn.execute(text("SELECT id, name, loai_cong_viec FROM report_categories")).fetchall()
            for cat_row in cats:
                cid = cat_row[0]
                cname = str(cat_row[1] or "")
                cloct = str(cat_row[2] or "")
                if "bảo dưỡng" in cname.lower() or "bảo dưỡng" in cloct.lower() or "icms" in cname.lower() or "icms" in cloct.lower():
                    sub_cnt = conn.execute(text(f"SELECT COUNT(*) FROM report_sub_categories WHERE category_id = {cid}")).scalar()
                    if not sub_cnt or sub_cnt == 0:
                        conn.execute(text(f"""
                            INSERT INTO report_sub_categories (category_id, name, keyword, description, sort_order)
                            VALUES 
                                ({cid}, 'Bảo dưỡng điều hòa', 'CONDITIONER', 'Bảo dưỡng hệ thống điều hòa', 1),
                                ({cid}, 'Bảo dưỡng máy phát điện', 'GENERATOR', 'Bảo dưỡng tổ máy phát điện', 2),
                                ({cid}, 'Thông gió lọc bụi', 'VENTILATION', 'Thông gió và hệ thống lọc bụi ICMS', 3)
                        """))
                        conn.commit()
        except Exception as ex:
            print(f"Sub-category migration notice: {ex}")

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
app.include_router(tracking_router)
app.include_router(reports_router)
app.include_router(fixed_wo_router)


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
