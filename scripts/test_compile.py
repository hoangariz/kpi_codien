import time, urllib.request, json, sys
if sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

print("--- TESTING HTTP API SPEED ---")
t0 = time.time()
with urllib.request.urlopen("http://localhost:8000/api/codinh/categories") as resp:
    cats = json.loads(resp.read().decode())
t1 = time.time()
print(f"HTTP GET /categories took {t1 - t0:.4f}s for {len(cats)} categories")
for c in cats:
    print(f" - Cat {c['id']}: {c['name']} -> WOs: {c.get('summary', {}).get('total')}")

if cats:
    first_cat_id = cats[0]['id']
    t0 = time.time()
    with urllib.request.urlopen(f"http://localhost:8000/api/codinh/stats?category_id={first_cat_id}") as resp:
        st = json.loads(resp.read().decode())
    t1 = time.time()
    print(f"HTTP GET /stats?category_id={first_cat_id} took {t1 - t0:.4f}s (Cache Hit: {st.get('summary', {}).get('total_wos')} WOs)")

