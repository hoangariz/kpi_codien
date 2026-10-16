/**
 * Group name formatter for shortening verbose cluster names into concise codes.
 * Optimizes table layout, mobile views, charts, and drilldowns.
 */

export const GROUP_NAME_MAP = {
  'Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)': '001_BHL',
  'Trung tâm Can Lộc (VCC_HTH_002_CLC)': '002_CLC',
  'Trung tâm Thạch Hà (VCC_HTH_003_THA)': '003_THA',
  'Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)': '004_CXN',
  'Trung tâm Sông Trí (VCC_HTH_005_STI)': '005_STI',
  'Trung tâm Hương Khê (VCC_HTH_006_HKE)': '006_HKE',
  'Trung tâm Sơn Giang (VCC_HTH_007_SGG)': '007_SGG',
  'NOC_Chi nhánh Hà Tĩnh': 'NOC',
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
  // Check for standard VCC code pattern: VCC_HTH_001_BHL -> 001_BHL
  const match = trimmed.match(/VCC_HTH_(\d+_[A-Z0-9]+)/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  // Support HTH-00X-XXX or HTH_00X_XXX pattern -> 00X_XXX
  const matchHth = trimmed.match(/HTH[-_](\d+[-_][A-Z0-9]+)/i);
  if (matchHth && matchHth[1]) {
    return matchHth[1].replace('-', '_').toUpperCase();
  }
  // Support string with parentheses containing code like (001_BHL) or (VCC_HTH_001_BHL)
  const matchParen = trimmed.match(/\((?:VCC_HTH_)?(\d{3}_[A-Z0-9]+)\)/i);
  if (matchParen && matchParen[1]) {
    return matchParen[1].toUpperCase();
  }
  // Otherwise, fallback match for 3-letter VCC code pattern if no digits
  const matchFallback = trimmed.match(/VCC_HTH_\d+_([A-Z0-9]+)/i);
  if (matchFallback && matchFallback[1]) {
    return matchFallback[1].toUpperCase();
  }
  // Otherwise, keep unchanged
  return trimmed;
}

/**
 * Helper specifically for CĐBR cluster names to ensure concise short codes.
 */
export function getShortClusterName(name, code) {
  if (!name && !code) return 'Chưa phân cụm';
  const str = String(name || '').trim();
  if (str === 'Chưa phân cụm' || str === 'Khác' || str.toLowerCase().includes('chưa phân')) {
    return 'Chưa phân cụm';
  }
  const formatted = formatGroupName(str);
  if (formatted && formatted !== str) return formatted;
  if (code) {
    const formattedCode = formatGroupName(String(code));
    if (formattedCode && formattedCode !== String(code)) return formattedCode;
    const cleanCode = String(code).replace(/^VCC_HTH_/i, '').toUpperCase();
    if (cleanCode && cleanCode !== 'NONE') return cleanCode;
  }
  return formatted || str;
}
