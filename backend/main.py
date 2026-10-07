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
            "ALTER TABLE report_categories ADD COLUMN domain VARCHAR(50) DEFAULT 'codien'",
            "ALTER TABLE report_categories ADD COLUMN other_sub_category_name VARCHAR(255) DEFAULT 'Còn lại / Khác'",
            "ALTER TABLE import_logs ADD COLUMN domain VARCHAR(50) DEFAULT 'main'",
            "ALTER TABLE codinh_tasks ADD COLUMN thoi_diem_bat_dau_thuc_hien DATETIME",
        ]:
            try:
                conn.execute(text(col_def))
                conn.commit()
            except Exception:
                pass

        try:
            conn.execute(text("UPDATE import_logs SET domain = 'main' WHERE domain IS NULL"))
            conn.commit()
        except Exception:
            pass

        try:
            conn.execute(text("UPDATE report_categories SET domain = 'codien' WHERE domain IS NULL"))
            conn.commit()
        except Exception:
            pass

        try:
            conn.execute(text("UPDATE report_categories SET other_sub_category_name = 'Còn lại / Khác' WHERE other_sub_category_name IS NULL OR other_sub_category_name = ''"))
            conn.commit()
        except Exception:
            pass

        try:
            conn.execute(text("UPDATE import_logs SET stored_filename = file_name WHERE stored_filename IS NULL"))
            conn.execute(text("UPDATE import_logs SET is_active = 1 WHERE id = (SELECT id FROM import_logs WHERE status = 'COMPLETED' AND (domain = 'main' OR domain IS NULL) ORDER BY imported_at DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM import_logs WHERE is_active = 1 AND (domain = 'main' OR domain IS NULL))"))
            conn.execute(text("UPDATE import_logs SET is_active = 1 WHERE id = (SELECT id FROM import_logs WHERE status = 'COMPLETED' AND domain = 'codinh' ORDER BY imported_at DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM import_logs WHERE is_active = 1 AND domain = 'codinh')"))
            conn.commit()
        except Exception:
            pass

        # Migration: Ensure task_notes and tracking_board_tasks have no blocking FK to tasks in SQLite
        try:
            from backend.database import is_sqlite
            if is_sqlite:
                fks = conn.execute(text("PRAGMA foreign_key_list('task_notes')")).fetchall()
                if any(fk[2] == 'tasks' for fk in fks):
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS task_notes_migrated (
                            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                            ma_cong_viec VARCHAR(100) NOT NULL,
                            note_content TEXT NOT NULL,
                            created_by VARCHAR(100) NOT NULL,
                            created_at DATETIME NOT NULL
                        )
                    """))
                    conn.execute(text("""
                        INSERT INTO task_notes_migrated (id, ma_cong_viec, note_content, created_by, created_at)
                        SELECT id, ma_cong_viec, note_content, created_by, created_at FROM task_notes
                    """))
                    conn.execute(text("DROP TABLE task_notes"))
                    conn.execute(text("ALTER TABLE task_notes_migrated RENAME TO task_notes"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_notes_task_created ON task_notes (ma_cong_viec, created_at)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_task_notes_ma_cong_viec ON task_notes (ma_cong_viec)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_task_notes_created_at ON task_notes (created_at)"))
                    conn.commit()

                tb_fks = conn.execute(text("PRAGMA foreign_key_list('tracking_board_tasks')")).fetchall()
                if any(fk[2] == 'tasks' for fk in tb_fks):
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS tracking_board_tasks_migrated (
                            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                            board_id INTEGER NOT NULL,
                            ma_cong_viec VARCHAR(100) NOT NULL,
                            added_at DATETIME NOT NULL,
                            note TEXT,
                            CONSTRAINT uq_board_task UNIQUE (board_id, ma_cong_viec),
                            FOREIGN KEY(board_id) REFERENCES tracking_boards (id) ON DELETE CASCADE
                        )
                    """))
                    conn.execute(text("""
                        INSERT INTO tracking_board_tasks_migrated (id, board_id, ma_cong_viec, added_at, note)
                        SELECT id, board_id, ma_cong_viec, added_at, note FROM tracking_board_tasks
                    """))
                    conn.execute(text("DROP TABLE tracking_board_tasks"))
                    conn.execute(text("ALTER TABLE tracking_board_tasks_migrated RENAME TO tracking_board_tasks"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_tracking_board_task ON tracking_board_tasks (board_id, ma_cong_viec)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tracking_board_tasks_board_id ON tracking_board_tasks (board_id)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tracking_board_tasks_ma_cong_viec ON tracking_board_tasks (ma_cong_viec)"))
                    conn.commit()
        except Exception as ex:
            print(f"FK migration notice: {ex}")

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

        # Migration: Ensure indexes for CĐBR performance
        cdbr_indexes = [
            "CREATE INDEX IF NOT EXISTS ix_codinh_tasks_loai_cong_viec ON codinh_tasks (loai_cong_viec)",
            "CREATE INDEX IF NOT EXISTS ix_codinh_tasks_he_thong ON codinh_tasks (he_thong)",
            "CREATE INDEX IF NOT EXISTS ix_codinh_tasks_trang_thai ON codinh_tasks (trang_thai)",
            "CREATE INDEX IF NOT EXISTS ix_codinh_tasks_nhan_vien ON codinh_tasks (nhan_vien)",
            "CREATE INDEX IF NOT EXISTS ix_codinh_tasks_nhom ON codinh_tasks (nhom)",
            "CREATE INDEX IF NOT EXISTS ix_codinh_tasks_bat_dau ON codinh_tasks (thoi_diem_bat_dau_thuc_hien)",
            "CREATE INDEX IF NOT EXISTS ix_codinh_tasks_tao ON codinh_tasks (thoi_diem_tao)",
            "CREATE INDEX IF NOT EXISTS ix_cabinets_ma_wo ON cabinets (ma_wo)",
            "CREATE INDEX IF NOT EXISTS ix_cabinets_category_id ON cabinets (category_id)",
        ]
        for idx_sql in cdbr_indexes:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
            except Exception:
                pass



auto_migrate_db()

from backend.api.router_tasks import router as tasks_router
from backend.api.router_stats import router as stats_router
from backend.api.router_imports import router as imports_router
from backend.api.router_meta import router as meta_router
from backend.api.router_settings import router as settings_router
from backend.api.router_tracking import router as tracking_router
from backend.api.router_report_categories import router as reports_router
from backend.api.router_fixed_wo import router as fixed_wo_router
from backend.api.router_codinh import router as codinh_router
from backend.api.router_device_recall import router as device_recall_router

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
app.include_router(codinh_router)
app.include_router(device_recall_router, prefix="/api/device-recall", tags=["Thu Hồi Thiết Bị"])


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
