import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
from datetime import datetime

df = pd.read_excel('demofile.xlsx', engine='openpyxl')
target = 'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS'
m = df[df['Loại công việc'] == target].copy()

print(f"Total matching target: {len(m)}")

# Check date columns
m['dt_end'] = pd.to_datetime(m['Thời điểm yêu cầu kết thúc (dd/MM/yyyy HH:mm:ss)'], dayfirst=True, errors='coerce')
m['dt_cd_dong'] = pd.to_datetime(m['Thời điểm CD đóng'], dayfirst=True, errors='coerce')

print("\nTháng yêu cầu kết thúc:")
print(m['dt_end'].dt.to_period('M').value_counts(dropna=False))

print("\nTrạng thái:")
print(m['Trạng thái'].value_counts(dropna=False))

print("\nCross-tab Tháng kết thúc x Trạng thái:")
print(pd.crosstab(m['dt_end'].dt.to_period('M'), m['Trạng thái'], dropna=False))

print("\nThời điểm CD đóng mẫu:")
cd_closed = m[m['dt_cd_dong'].notna()]
print(f"Số bản ghi có Thời điểm CD đóng: {len(cd_closed)}")
for idx, r in cd_closed[['Mã công việc', 'Trạng thái', 'Thời điểm yêu cầu kết thúc (dd/MM/yyyy HH:mm:ss)', 'Thời điểm CD đóng']].head(10).iterrows():
    print(dict(r))
