import sys
from backend.services.fixed_wo_service import parse_tagged_wo_input

sample = """KSVHKT	WO_WFM-FT_20260923_174715597
Cơ điện	WO_WFM-FT_20260908_173962053
NOC	WO_TT_20261001_175166721
Cơ điện WO_SPACE_123
WO_PLAIN_456
"""

res = parse_tagged_wo_input(sample)
for r in res:
    print(r)
assert len(res) == 5
assert res[0]["tag"] == "KSVHKT" and res[0]["ma_cong_viec"] == "WO_WFM-FT_20260923_174715597"
assert res[1]["tag"] == "Cơ điện" and res[1]["ma_cong_viec"] == "WO_WFM-FT_20260908_173962053"
assert res[2]["tag"] == "NOC" and res[2]["ma_cong_viec"] == "WO_TT_20261001_175166721"
assert res[3]["tag"] == "Cơ điện" and res[3]["ma_cong_viec"] == "WO_SPACE_123"
assert res[4]["tag"] is None and res[4]["ma_cong_viec"] == "WO_PLAIN_456"
print("ALL PARSER TESTS PASSED!")
