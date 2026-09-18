/**
 * Group name formatter for shortening verbose cluster names into concise codes.
 * Optimizes table layout, mobile views, charts, and drilldowns.
 */

export const GROUP_NAME_MAP = {
  'Trung tâm Sông Trí (VCC_HTH_005_STI)': 'STI',
  'Trung tâm Thạch Hà (VCC_HTH_003_THA)': 'THA',
  'Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)': 'BHL',
  'Trung tâm Can Lộc (VCC_HTH_002_CLC)': 'CLC',
  'Trung tâm Sơn Giang (VCC_HTH_007_SGG)': 'SGG',
  'NOC_Chi nhánh Hà Tĩnh': 'NOC',
  'Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)': 'CXN',
  'Trung tâm Hương Khê (VCC_HTH_006_HKE)': 'HKE',
  'CD_CNKT_HTH Hà Tĩnh': 'CD_CNKT',
  'Phòng VHKT - CNCT Hà Tĩnh': 'VKHT_CNKT',
};

/**
 * Format group name according to predefined short code map.
 * If not in the list, keeps original name unchanged.
 */
export function formatGroupName(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  if (GROUP_NAME_MAP[trimmed]) {
    return GROUP_NAME_MAP[trimmed];
  }
  // If not explicitly matched in mapping, check for standard VCC code pattern
  const match = trimmed.match(/VCC_HTH_\d+_([A-Z0-9]+)/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  // Otherwise, keep unchanged
  return trimmed;
}
