#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script khôi phục TaskNote (ghi chú công việc theo mã WO) từ vùng nhớ tự do của file SQLite kpi_codien.db.
Chạy độc lập trên cả máy Local và VPS.
Cách chạy: python scripts/restore_notes.py
"""

import os
import re
import sys
import sqlite3
from pathlib import Path

# Đảm bảo in UTF-8 không lỗi trên Windows terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def find_db_path():
    """Tìm đường dẫn file kpi_codien.db ở thư mục hiện tại hoặc thư mục cha."""
    candidates = [
        Path("kpi_codien.db"),
        Path(__file__).resolve().parent.parent / "kpi_codien.db",
        Path("/var/www/kpi_codien/kpi_codien.db"),
        Path.cwd() / "kpi_codien.db"
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return p.resolve()
    return None


def main():
    db_file = find_db_path()
    if not db_file:
        print("[!] Lỗi: Không tìm thấy file kpi_codien.db!")
        print("    Vui lòng chạy script từ thư mục gốc của dự án hoặc đặt file kpi_codien.db ở cùng thư mục.")
        sys.exit(1)

    print(f"[*] Đang đọc dữ liệu từ: {db_file}")
    with open(db_file, "rb") as f:
        data = f.read()

    file_size_mb = len(data) / (1024 * 1024)
    print(f"[*] Kích thước database: {file_size_mb:.2f} MB")

    authors = [b'\xc4\x90i\xe1\xbb\x81u h\xc3\xa0nh', b'User']
    wo_strict_regex = re.compile(rb'(WO_[A-Za-z0-9_\-]+?_\d{8}_\d+)')
    date_regex = re.compile(rb'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)')

    recovered = []
    seen = set()

    for author_bytes in authors:
        author_str = author_bytes.decode('utf-8', errors='ignore')
        pos = 0
        while True:
            idx = data.find(author_bytes, pos)
            if idx == -1:
                break
            pos = idx + len(author_bytes)

            # Check date sau author
            after_author = data[idx + len(author_bytes) : idx + len(author_bytes) + 60]
            date_m = date_regex.search(after_author)
            if not date_m:
                continue
            date_str = date_m.group(1).decode('ascii')

            # Look back tìm mã WO
            before_start = max(0, idx - 500)
            before_author = data[before_start : idx]

            wo_matches = list(wo_strict_regex.finditer(before_author))
            if not wo_matches:
                continue

            last_wo = wo_matches[-1]
            wo_str = last_wo.group(1).decode('ascii')

            # Note content ở giữa mã WO và Author
            content_bytes = before_author[last_wo.end() : ]
            content_cleaned = re.sub(rb'^[\x00-\x1f\x7f-\x9f]+|[\x00-\x1f\x7f-\x9f]+$', b'', content_bytes)
            content_str = content_cleaned.decode('utf-8', errors='ignore').strip()

            if not content_str or len(content_str) < 2:
                continue
            if content_str.startswith('VTNET_WO created by other teams'):
                continue

            key = (wo_str, content_str)
            if key not in seen:
                seen.add(key)
                recovered.append({
                    "ma_cong_viec": wo_str,
                    "note_content": content_str,
                    "created_by": author_str,
                    "created_at": date_str
                })

    print(f"\n[+] ĐÃ TÌM THẤY {len(recovered)} GHI CHÚ TRONG DATABASE:")
    print("-" * 60)
    for i, n in enumerate(recovered):
        print(f"  {i+1:2d}. [{n['ma_cong_viec']}] {n['note_content']} ({n['created_by']} - {n['created_at']})")
    print("-" * 60)

    if not recovered:
        print("[*] Không có ghi chú nào cần khôi phục.")
        return

    # Kết nối SQLite và nạp lại vào bảng task_notes
    con = sqlite3.connect(str(db_file))
    cur = con.cursor()

    # Kiểm tra các ghi chú đã có trong bảng
    cur.execute("SELECT ma_cong_viec, note_content FROM task_notes")
    existing_in_db = set(cur.fetchall())

    restored_count = 0
    for n in recovered:
        if (n["ma_cong_viec"], n["note_content"]) not in existing_in_db:
            cur.execute(
                "INSERT INTO task_notes (ma_cong_viec, note_content, created_by, created_at) VALUES (?, ?, ?, ?)",
                (n["ma_cong_viec"], n["note_content"], n["created_by"], n["created_at"])
            )
            restored_count += 1

    con.commit()
    print(f"\n[✓] HOÀN TẤT: Đã khôi phục thành công {restored_count} ghi chú mới vào bảng task_notes!")
    
    cur.execute("SELECT count(*) FROM task_notes")
    total_now = cur.fetchone()[0]
    print(f"[✓] Tổng số ghi chú hiện có trong database: {total_now}")
    con.close()


if __name__ == '__main__':
    main()
