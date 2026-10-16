import traceback
import sys

with open("start_debug.log", "w", encoding="utf-8") as f:
    f.write("start.py invoked\n")

try:
    import uvicorn
    with open("start_debug.log", "a", encoding="utf-8") as f:
        f.write("uvicorn imported successfully, starting app...\n")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000)
except Exception as e:
    with open("start_debug.log", "a", encoding="utf-8") as f:
        f.write("Error occurred:\n" + traceback.format_exc())
