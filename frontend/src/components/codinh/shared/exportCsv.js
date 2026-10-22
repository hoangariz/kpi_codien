import { exportSingleSheetXlsx } from '../../../utils/excelExport';

/**
 * Export table data to Excel (.xlsx) format.
 * 
 * @param {string} filename - Output filename (e.g. 'Bao_Cao_THC_Cum.xlsx')
 * @param {Array<{ key: string, label: string }>} columns - Column definitions
 * @param {Array<Object>} rows - Row data objects
 */
export async function exportToCsv(filename, columns, rows) {
  if (!columns || !columns.length || !rows || !rows.length) {
    return;
  }

  const cleanFilename = (filename || 'Bao_Cao')
    .replace(/\.csv$/i, '')
    .replace(/\.xlsx$/i, '');

  const headers = columns.map((col) => col.label || col.key);

  const dataRows = rows.map((row) => {
    return columns.map((col) => {
      let val;
      if (typeof col.getValue === 'function') {
        val = col.getValue(row);
      } else {
        val = row[col.key];
      }
      return val ?? '';
    });
  });

  await exportSingleSheetXlsx(cleanFilename, 'Báo cáo', headers, dataRows);
}

