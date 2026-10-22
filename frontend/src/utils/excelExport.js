import api from '../api/client';

/**
 * Xuất dữ liệu bảng ra file Excel (.xlsx) chuẩn Microsoft Excel
 *
 * @param {string} filename - Tên file xuất (ví dụ: 'Danh_sach_cong_viec')
 * @param {Array<{ name?: string, headers: string[], rows: any[][] }>} sheets - Danh sách các sheet cần tạo
 */
export async function exportToXlsx(filename, sheets) {
  try {
    const cleanFilename = (filename || 'Bao_cao')
      .replace(/\.xlsx$/i, '')
      .replace(/\.csv$/i, '');

    const res = await api.post(
      '/meta/export-xlsx',
      {
        filename: cleanFilename,
        sheets: sheets.map((s, idx) => ({
          name: s.name || `Sheet${idx + 1}`,
          headers: s.headers || [],
          rows: s.rows || [],
        })),
      },
      {
        responseType: 'blob',
      }
    );

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanFilename}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Lỗi xuất file Excel (.xlsx):', err);
    alert('Không thể xuất file Excel: ' + (err.response?.data?.detail || err.message || 'Lỗi kết nối'));
  }
}

/**
 * Tiện ích xuất 1 sheet ra file Excel (.xlsx)
 *
 * @param {string} filename - Tên file
 * @param {string} sheetName - Tên sheet
 * @param {string[]} headers - Danh sách tiêu đề cột
 * @param {any[][]} rows - Danh sách các dòng dữ liệu
 */
export async function exportSingleSheetXlsx(filename, sheetName, headers, rows) {
  return exportToXlsx(filename, [{ name: sheetName, headers, rows }]);
}
