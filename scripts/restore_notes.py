#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script khôi phục TaskNote (ghi chú công việc theo mã WO) cho kpi_codien.db.
Chạy được trên cả máy Local và VPS Linux (/www/wwwroot/nghi5.com).
Cách chạy: python3 scripts/restore_notes.py
"""

import os
import re
import sys
import sqlite3
from pathlib import Path

# Đảm bảo in UTF-8 không lỗi
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Danh sách 16 ghi chú gốc đã được trích xuất an toàn từ database
KNOWN_NOTES = [
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916030",
        "note_content": "hỏng mn, nay mới nhận vật tu",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:51:20.090019"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260801_172012989",
        "note_content": "chưa làm",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:48:53.323726"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171919356",
        "note_content": "kv1 gọi đôn đốc",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:48:26.109878"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916881",
        "note_content": "kv1 gọi đôn đốc",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:48:11.438191"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916765",
        "note_content": "kv1 gọi đôn đốc",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:48:07.707697"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916585",
        "note_content": "kv1 gọi đôn đốc",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:48:03.747871"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916030",
        "note_content": "kv1 gọi đôn đốc",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:47:57.263467"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260701_170348326",
        "note_content": "cd từ chối",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:44:09.804800"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916030",
        "note_content": "quá hạn, đã bị kv1 gọi",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:42:12.322701"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916585",
        "note_content": "quá hạn, đã bị kv1 gọi",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:42:09.727029"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916765",
        "note_content": "quá hạn, đã bị kv1 gọi",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:42:06.479114"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171916881",
        "note_content": "quá hạn, đã bị kv1 gọi",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:42:02.350404"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260731_171919356",
        "note_content": "quá hạn, đã bị kv1 gọi",
        "created_by": "Điều hành",
        "created_at": "2026-09-16 09:41:57.388657"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260727_171655269",
        "note_content": "check seri máy hỏng",
        "created_by": "Điều hành",
        "created_at": "2026-09-14 04:05:32.642235"
    },
    {
        "ma_cong_viec": "WO_ICMS_20260801_172012989",
        "note_content": "đang bận",
        "created_by": "Điều hành",
        "created_at": "2026-09-13 08:37:15.733102"
    },
    {
        "ma_cong_viec": "WO_TT_20260210_161356022",
        "note_content": "2g",
        "created_by": "Điều hành",
        "created_at": "2026-10-01 02:46:03.114537"
    }
]


def find_db_path():
    """Tìm đường dẫn file kpi_codien.db."""
    candidates = [
        Path("kpi_codien.db"),
        Path(__file__).resolve().parent.parent / "kpi_codien.db",
        Path("/www/wwwroot/nghi5.com/kpi_codien.db"),
        Path("/var/www/kpi_codien/kpi_codien.db"),
        Path.cwd() / "kpi_codien.db"
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return p.resolve()
    return None


def scan_raw_files_for_extra_notes(db_file):
    """Quét cả file .db và .db-wal để tìm thêm ghi chú khác nếu có."""
    extra_notes = []
    seen = set((n["ma_cong_viec"], n["note_content"]) for n in KNOWN_NOTES)

    files_to_scan = [db_file]
    wal_file = Path(str(db_file) + "-wal")
    if wal_file.exists():
        files_to_scan.append(wal_file)

    authors = [b'\xc4\x90i\xe1\xbb\x81u h\xc3\xa0nh', b'User', b'admin', b'Admin']
    wo_strict_regex = re.compile(rb'(WO_[A-Za-z0-9_\-]+?_\d{8}_\d+)')
    date_regex = re.compile(rb'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)')

    for f_path in files_to_scan:
        try:
            with open(f_path, "rb") as f:
                data = f.read()
        except Exception:
            continue

        for author_bytes in authors:
            author_str = author_bytes.decode('utf-8', errors='ignore')
            pos = 0
            while True:
                idx = data.find(author_bytes, pos)
                if idx == -1:
                    break
                pos = idx + len(author_bytes)

                after_author = data[idx + len(author_bytes) : idx + len(author_bytes) + 60]
                date_m = date_regex.search(after_author)
                if not date_m:
                    continue
                date_str = date_m.group(1).decode('ascii')

                before_start = max(0, idx - 500)
                before_author = data[before_start : idx]

                wo_matches = list(wo_strict_regex.finditer(before_author))
                if not wo_matches:
                    continue

                last_wo = wo_matches[-1]
                wo_str = last_wo.group(1).decode('ascii')

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
                    extra_notes.append({
                        "ma_cong_viec": wo_str,
                        "note_content": content_str,
                        "created_by": author_str,
                        "created_at": date_str
                    })

    return extra_notes


def main():
    db_file = find_db_path()
    if not db_file:
        print("[!] Lỗi: Không tìm thấy file kpi_codien.db!")
        sys.exit(1)

    print(f"[*] Đang kết nối database: {db_file}")

    # Kết nối SQLite
    con = sqlite3.connect(str(db_file))
    cur = con.cursor()

    # Đảm bảo bảng task_notes tồn tại
    cur.execute("""
        CREATE TABLE IF NOT EXISTS task_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ma_cong_viec VARCHAR(100) NOT NULL,
            note_content TEXT NOT NULL,
            created_by VARCHAR(100) NOT NULL DEFAULT 'User',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    con.commit()

    # Kiểm tra các ghi chú hiện có
    cur.execute("SELECT ma_cong_viec, note_content FROM task_notes")
    existing_in_db = set(cur.fetchall())
    print(f"[*] Số ghi chú hiện có sẵn trong bảng: {len(existing_in_db)}")

    # Tập hợp ghi chú: KNOWN_NOTES + Quét thêm từ file
    all_notes = list(KNOWN_NOTES)
    extra = scan_raw_files_for_extra_notes(db_file)
    if extra:
        print(f"[*] Quét thấy thêm {len(extra)} ghi chú mới từ WAL/freelist.")
        all_notes.extend(extra)

    # Nạp vào database
    restored_count = 0
    print("\n[+] DANH SÁCH GHI CHÚ ĐƯỢC KHÔI PHỤC:")
    print("-" * 65)
    for i, n in enumerate(all_notes):
        status = "ĐÃ CÓ"
        if (n["ma_cong_viec"], n["note_content"]) not in existing_in_db:
            cur.execute(
                "INSERT INTO task_notes (ma_cong_viec, note_content, created_by, created_at) VALUES (?, ?, ?, ?)",
                (n["ma_cong_viec"], n["note_content"], n["created_by"], n["created_at"])
            )
            existing_in_db.add((n["ma_cong_viec"], n["note_content"]))
            restored_count += 1
            status = "MỚI NẠP"

        print(f"  {i+1:2d}. [{status}] [{n['ma_cong_viec']}] {n['note_content']} ({n['created_by']})")

    con.commit()
    print("-" * 65)
    print(f"\n[✓] HOÀN TẤT THÀNH CÔNG!")
    print(f"    - Đã nạp mới: {restored_count} ghi chú")
    
    cur.execute("SELECT count(*) FROM task_notes")
    total_now = cur.fetchone()[0]
    print(f"    - Tổng số ghi chú đang có trong bảng task_notes: {total_now}")
    con.close()


if __name__ == '__main__':
    main()
