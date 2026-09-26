import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
from pathlib import Path

files = list(Path('uploads').glob('*.xlsx'))
for f in files:
    print('Checking file:', f.name)
    df = pd.read_excel(f, nrows=20)
    for r in range(min(20, len(df))):
        vals = [str(v).strip().lower() for v in df.iloc[r].dropna()]
        if any(v in ('mã công việc', 'mã cv', 'ma cong viec', 'wo') for v in vals):
            cols = [str(c).strip() for c in df.iloc[r].values]
            print('Found header row at index', r)
            for i, c in enumerate(cols):
                if any(k in c.lower() for k in ['thời điểm', 'thoi diem', 'thực hiện', 'bắt đầu', 'bat dau', 'tạo', 'tiếp nhận']):
                    print(f'  Col {i}: {c}')
            sys.exit(0)
