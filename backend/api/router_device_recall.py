import os
from typing import Optional
from urllib.parse import quote
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services import device_recall_service
from backend.config import BASE_DIR

router = APIRouter()


@router.get("/meta")
def get_meta(db: Session = Depends(get_db)):
    """Lấy thông tin metadata file nạp gần nhất."""
    return device_recall_service.get_device_recall_meta(db)


@router.get("/clusters")
def get_clusters(db: Session = Depends(get_db)):
    """Lấy danh sách các cụm UNIQUE trong Trung tâm Cụm xã."""
    return device_recall_service.get_device_recall_clusters(db)


@router.get("/fts")
def get_fts_by_cluster(
    cluster: str = Query(..., description="Tên Trung tâm Cụm xã"),
    db: Session = Depends(get_db)
):
    """Lấy danh sách Tên FT (và MNV) thuộc cụm được chọn."""
    return device_recall_service.get_device_recall_fts_by_cluster(db, cluster)


@router.get("/items")
def get_items(
    cluster: str = Query(..., description="Tên Trung tâm Cụm xã"),
    ft: Optional[str] = Query(None, description="Tên FT đã chọn"),
    search: Optional[str] = Query(None, description="Từ khóa tìm kiếm thuê bao/địa chỉ"),
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách chi tiết thiết bị cần thu hồi (đầy đủ mã nhân viên, họ và tên, cụm xã).
    """
    return device_recall_service.get_device_recall_items(db, cluster=cluster, ft_name=ft, search=search)


@router.get("/export")
def export_items(
    cluster: str = Query(..., description="Tên Trung tâm Cụm xã"),
    ft: Optional[str] = Query(None, description="Tên FT đã chọn"),
    search: Optional[str] = Query(None, description="Từ khóa tìm kiếm thuê bao/địa chỉ"),
    db: Session = Depends(get_db)
):
    """
    Xuất danh sách thiết bị cần thu hồi ra file CSV (chuẩn UTF-8 BOM cho Excel).
    Có đầy đủ cột Mã nhân viên, Họ và tên.
    """
    csv_content = device_recall_service.export_device_recall_csv(db, cluster=cluster, ft_name=ft, search=search)
    clean_cluster = cluster.replace(" ", "_")
    clean_ft = f"_{ft.replace(' ', '_')}" if ft else "_TatCa"
    filename = f"ThuHoiThietBi_{clean_cluster}{clean_ft}.csv"
    encoded_filename = quote(filename)

    return Response(
        content=csv_content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/upload")
async def upload_device_recall_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Nạp file .txt danh sách thiết bị cần thu hồi (hàng tháng)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Vui lòng chọn file!")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="File tải lên bị rỗng!")

    # Decode text an toàn
    text_content = None
    for encoding in ("utf-8-sig", "utf-8", "cp1258", "latin-1"):
        try:
            text_content = raw_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if text_content is None:
        text_content = raw_bytes.decode("utf-8", errors="replace")

    try:
        result = device_recall_service.import_device_recall_content(db, text_content, file.filename)
        return {
            "success": True,
            "message": f"Nạp thành công {result['valid_rows']} dòng dữ liệu ({result['total_clusters']} cụm, {result['total_fts']} FT)!",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi khi xử lý file: {str(e)}")


@router.post("/reload-default")
def reload_default_file(db: Session = Depends(get_db)):
    """Nạp lại từ file mẫu thuhoithietbi.txt có sẵn trên máy chủ."""
    file_path = BASE_DIR / "thuhoithietbi.txt"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy file thuhoithietbi.txt trên máy chủ!")

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        result = device_recall_service.import_device_recall_content(db, content, "thuhoithietbi.txt")
        return {
            "success": True,
            "message": f"Đã đồng bộ {result['valid_rows']} dòng từ thuhoithietbi.txt!",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
