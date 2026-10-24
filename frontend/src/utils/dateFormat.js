/**
 * Date formatting utilities for displaying timestamps in Vietnam timezone (Asia/Ho_Chi_Minh).
 */

export const parseUtcDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  const iso = str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str)
    ? str
    : (str.includes('T') ? str + 'Z' : str.replace(' ', 'T') + 'Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date(str) : d;
};

export const formatDataTimestamp = (val) => {
  const dt = parseUtcDate(val);
  if (!dt || isNaN(dt.getTime())) return 'Chưa xác định';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} lúc ${get('hour')}:${get('minute')}`;
};export const formatDate = (d) => {
  if (!d) return '--';
  if (d instanceof Date) return isNaN(d.getTime()) ? '--' : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const str = String(d).trim();
  const iso = str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str)
    ? str
    : (str.includes('T') ? str + 'Z' : str.replace(' ', 'T') + 'Z');
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? d : dt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

export const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
