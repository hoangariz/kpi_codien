import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Save, CheckCircle2, Info } from 'lucide-react';
import { settingsApi } from '../../api/settingsApi';
import { statsApi } from '../../api/statsApi';

export default function AdminMonthSection({ selectedMonth, setSelectedMonth }) {
  const queryClient = useQueryClient();
  const [saveSuccess, setSaveSuccess] = useState(false);

  const monthOptions = [
    { value: '2026-07', label: 'Tháng 07/2026' },
    { value: '2026-08', label: 'Tháng 08/2026' },
    { value: '2026-09', label: 'Tháng 09/2026' },
    { value: '2026-10', label: 'Tháng 10/2026' },
    { value: '2026-11', label: 'Tháng 11/2026' },
    { value: '2026-12', label: 'Tháng 12/2026' },
    { value: '2027-01', label: 'Tháng 01/2027' },
    { value: '2027-02', label: 'Tháng 02/2027' },
    { value: '2027-03', label: 'Tháng 03/2027' },
  ];

  const saveMonthMutation = useMutation({
    mutationFn: (newMonth) => settingsApi.updateSetting('current_month', newMonth, 'Tháng báo cáo hiện tại'),
    onSuccess: () => {
      statsApi.clearMaintenanceCache();
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-summary'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err) => {
      alert('Lỗi lưu cấu hình: ' + (err.response?.data?.detail || err.message));
    }
  });

  const handleSaveMonth = (e) => {
    e.preventDefault();
    saveMonthMutation.mutate(selectedMonth);
  };

  return (
    <div 
      id="admin-sec-month"
      className="table-card" 
      style={{ 
        padding: '24px', 
        marginBottom: '28px',
        border: '1px solid rgba(2, 132, 199, 0.3)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Calendar size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            Cấu Hình Tháng Báo Cáo Hiện Tại
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Áp dụng trực tiếp vào quy tắc tính toán của bảng Bảo Dưỡng Cơ Điện
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveMonth} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Tháng hiện tại:</label>
        <select
          className="select-filter"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{ width: '220px', fontSize: '0.9rem', fontWeight: 600, padding: '8px 12px' }}
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={saveMonthMutation.isPending}
          style={{ padding: '8px 20px', gap: '6px' }}
        >
          <Save size={16} />
          {saveMonthMutation.isPending ? 'Đang lưu...' : 'Lưu Cấu Hình Tháng'}
        </button>

        {saveSuccess && (
          <span style={{ fontSize: '0.82rem', color: 'var(--success-dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={16} /> Đã cập nhật thành công!
          </span>
        )}
      </form>

      {/* Rule explanation box */}
      <div style={{ background: 'var(--bg-tertiary)', padding: '14px 16px', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--brand-primary)', fontSize: '0.82rem', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Info size={15} /> Quy tắc lọc tự động theo tháng:
        </div>
        <p>
          Khi chọn <strong>{monthOptions.find(o => o.value === selectedMonth)?.label || selectedMonth}</strong>: 
          Tất cả các công việc có <em>Thời điểm yêu cầu kết thúc</em> thuộc các tháng trước đã có trạng thái <strong>Đóng</strong> sẽ 
          <strong> tự động bị loại bỏ</strong> khỏi cả bảng <strong>Tổng Quan (Bảo Dưỡng Cơ Điện)</strong> và <strong>Cố Định Băng Rộng (/codinh)</strong>.
          Hệ thống chỉ giữ lại các việc của tháng này và các công việc tồn đọng chưa hoàn thành từ các tháng trước mang sang (áp dụng mặc định trừ những báo cáo có <em>"Loại bỏ công việc đã đóng của tháng trước"</em> bị tắt).
        </p>
      </div>
    </div>
  );
}
