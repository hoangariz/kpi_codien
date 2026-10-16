/**
 * Export table data to CSV with UTF-8 BOM for full Vietnamese support in Microsoft Excel.
 * 
 * @param {string} filename - Output filename (e.g. 'Bao_Cao_THC_Cum.csv')
 * @param {Array<{ key: string, label: string }>} columns - Column definitions
 * @param {Array<Object>} rows - Row data objects
 */
export function exportToCsv(filename, columns, rows) {
  if (!columns || !columns.length || !rows || !rows.length) {
    return;
  }

  // Helper to format values for CSV
  const formatCell = (val) => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    // Escape quotes
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Header line
  const headerLine = columns.map((col) => formatCell(col.label || col.key)).join(',');

  // Data lines
  const dataLines = rows.map((row) => {
    return columns
      .map((col) => {
        let val;
        if (typeof col.getValue === 'function') {
          val = col.getValue(row);
        } else {
          val = row[col.key];
        }
        return formatCell(val);
      })
      .join(',');
  });

  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
