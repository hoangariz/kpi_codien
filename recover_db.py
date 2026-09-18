import os
import sys
import shutil
import sqlite3

DB_PATH = "kpi_codien.db"
BAK_PATH = "kpi_codien_corrupt.bak"
FIX_PATH = "kpi_codien_fixed.db"

def main():
    if not os.path.exists(DB_PATH):
        print(f"[-] Khong tim thay file {DB_PATH}")
        sys.exit(1)

    print(f"[1] Dang sao luu database hien tai sang {BAK_PATH}...")
    shutil.copy2(DB_PATH, BAK_PATH)
    for ext in ["-wal", "-shm"]:
        if os.path.exists(DB_PATH + ext):
            shutil.copy2(DB_PATH + ext, BAK_PATH + ext)

    print("[2] Kiem tra tinh toan ven (integrity_check)...")
    try:
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        res = cur.execute("PRAGMA integrity_check;").fetchall()
        print("Ket qua integrity_check:", res)
        
        # Thu reindex truoc (neu chi bi hong chi muc / index)
        print("[3] Thu chay REINDEX...")
        cur.execute("REINDEX;")
        con.commit()
        res2 = cur.execute("PRAGMA integrity_check;").fetchall()
        if res2 == [('ok',)]:
            print("[+] REINDEX thanh cong! Database da tro lai trang thai 'ok'.")
            con.close()
            # Xoa file tam wal, shm de reset WAL sach se
            for ext in ["-wal", "-shm"]:
                if os.path.exists(DB_PATH + ext):
                    os.remove(DB_PATH + ext)
            print("[+] Hoan tat sua chua database!")
            return
        con.close()
    except Exception as e:
        print(f"Notice: {e}")

    print("[4] Dang thuc hien Dump & Restore sang file database sach...")
    if os.path.exists(FIX_PATH):
        os.remove(FIX_PATH)

    # Su dung sqlite3 CLI hoac Python dump
    success = False
    # Thu dung lenh sqlite3 CLI .recover hoac .dump neu co
    if shutil.which("sqlite3"):
        print("  -> Su dung sqlite3 CLI de khoi phuc...")
        cmd_recover = f'sqlite3 "{DB_PATH}" ".recover" | sqlite3 "{FIX_PATH}"'
        ret = os.system(cmd_recover)
        if ret == 0 and os.path.exists(FIX_PATH) and os.path.getsize(FIX_PATH) > 0:
            success = True
        else:
            cmd_dump = f'sqlite3 "{DB_PATH}" ".dump" | sqlite3 "{FIX_PATH}"'
            ret2 = os.system(cmd_dump)
            if ret2 == 0 and os.path.exists(FIX_PATH) and os.path.getsize(FIX_PATH) > 0:
                success = True

    # Neu sqlite3 CLI khong co hoac that bai, fallback sang Python iterdump
    if not success:
        print("  -> Su dung Python iterdump fallback...")
        try:
            src = sqlite3.connect(DB_PATH)
            dst = sqlite3.connect(FIX_PATH)
            cur_dst = dst.cursor()
            for line in src.iterdump():
                try:
                    cur_dst.execute(line)
                except Exception:
                    pass
            dst.commit()
            src.close()
            dst.close()
            if os.path.exists(FIX_PATH) and os.path.getsize(FIX_PATH) > 0:
                success = True
        except Exception as e:
            print(f"Fallback error: {e}")

    if success and os.path.exists(FIX_PATH) and os.path.getsize(FIX_PATH) > 1000:
        # Kiem tra db moi
        check_con = sqlite3.connect(FIX_PATH)
        check_res = check_con.cursor().execute("PRAGMA integrity_check;").fetchall()
        check_con.close()
        print("Ket qua kiem tra db moi:", check_res)

        # Thay the db cu
        shutil.move(FIX_PATH, DB_PATH)
        for ext in ["-wal", "-shm"]:
            if os.path.exists(DB_PATH + ext):
                os.remove(DB_PATH + ext)
        print("[+] DA KHOI PHUC THANH CONG DATABASE kpi_codien.db!")
    else:
        print("[-] Khong the tu dong dump. Ban co the copy truc tiep file kpi_codien.db tu may local len VPS.")

if __name__ == "__main__":
    main()
