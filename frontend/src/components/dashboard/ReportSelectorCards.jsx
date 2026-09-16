import React from 'react';
import { Layers, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { statsApi } from '../../api/statsApi';

export default function ReportSelectorCards({
  reportCategories = [],
  selectedReport,
  setSelectedReport,
  activeCategory,
  setActiveCategoryId,
  maintSummary = {}
}) {
  const categoriesList = (reportCategories && reportCategories.length > 0) ? reportCategories : [
    {
      id: 1,
      name: 'Bảo Dưỡng Cứng Cơ Điện Điều Hòa, Máy Phát Điện, Thông Gió Lọc Bụi ICMS',
      loai_cong_viec: 'Bảo dưỡng cứng cơ điện điều hòa, máy phát điện, thông gió lọc bụi ICMS',
      is_default: true
    }
  ];

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(2, 132, 199, 0.12)',
            color: 'var(--brand-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Layers size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Danh Mục Loại Báo Cáo
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Nhấp vào loại báo cáo để xem bảng số liệu chi tiết và điều phối
            </span>
          </div>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
          {categoriesList.length} loại báo cáo
        </span>
      </div>

      {/* Report Selector Cards Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
        gap: '14px' 
      }}>
        {categoriesList.map((cat) => {
          const isSelected = selectedReport === 'maintenance' && activeCategory?.id === cat.id;
          const catSummary = (cat.id === activeCategory?.id && maintSummary.total != null)
            ? maintSummary
            : (cat.summary || { total: 0, closed: 0, pending: 0, overdue: 0, completion_rate: 0 });

          const totalTasks = catSummary.total ?? 0;
          const closedTasks = catSummary.closed ?? 0;
          const pendingTasks = catSummary.pending ?? 0;
          const overdueTasks = catSummary.overdue ?? 0;
          const rateVal = catSummary.completion_rate != null 
            ? catSummary.completion_rate 
            : (totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 1000) / 10 : 0);

          return (
            <div 
              key={cat.id}
              onClick={() => {
                setSelectedReport('maintenance');
                setActiveCategoryId(cat.id);
                statsApi.clearMaintenanceCache();
              }}
              style={{
                cursor: 'pointer',
                padding: '16px 18px',
                borderRadius: 'var(--radius-lg)',
                border: isSelected ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)',
                background: isSelected 
                  ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.1) 0%, rgba(37, 99, 235, 0.04) 100%)' 
                  : 'var(--bg-secondary)',
                boxShadow: isSelected ? '0 4px 16px -2px rgba(2, 132, 199, 0.2)' : 'var(--shadow-sm)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span 
                    className={`badge ${isSelected ? 'badge-info' : 'badge-neutral'}`}
                    style={{ gap: '5px', fontWeight: 700, fontSize: '0.75rem' }}
                  >
                    {isSelected ? <CheckCircle2 size={13} /> : <FileSpreadsheet size={13} />}
                    {isSelected ? 'Đang Xem' : 'Chọn Báo Cáo'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {cat.is_default ? 'Hệ thống mặc định' : 'Bảng tùy biến'}
                  </span>
                </div>

                <h4 style={{ 
                  fontSize: '1rem', 
                  fontWeight: 800, 
                  color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)', 
                  marginBottom: '14px', 
                  lineHeight: 1.45 
                }}>
                  {cat.name}
                </h4>
              </div>

              {/* Mini KPI summary row: TỔNG - ĐÃ ĐÓNG - TỒN - TỈ LỆ ĐÓNG - QUÁ HẠN */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '4px',
                padding: '10px 8px',
                background: isSelected ? 'rgba(2, 132, 199, 0.08)' : 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid',
                borderColor: isSelected ? 'rgba(2, 132, 199, 0.2)' : 'transparent'
              }}>
                <div title="Tổng số công việc">
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                    TỔNG
                  </span>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {totalTasks.toLocaleString()}
                  </strong>
                </div>

                <div title="Số công việc đã hoàn thành đóng">
                  <span style={{ fontSize: '0.62rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                    ĐÃ ĐÓNG
                  </span>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--success-dark)', fontFamily: 'var(--font-mono)' }}>
                    {closedTasks.toLocaleString()}
                  </strong>
                </div>

                <div title="Số công việc còn tồn chưa đóng">
                  <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                    TỒN
                  </span>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                    {pendingTasks.toLocaleString()}
                  </strong>
                </div>

                <div title="Tỉ lệ hoàn thành đóng công việc">
                  <span style={{ fontSize: '0.62rem', color: 'var(--brand-primary)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                    TỈ LỆ ĐÓNG
                  </span>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                    {rateVal}%
                  </strong>
                </div>

                <div title="Số công việc bị quá hạn">
                  <span style={{ 
                    fontSize: '0.62rem', 
                    color: overdueTasks > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', 
                    display: 'block', 
                    fontWeight: 700, 
                    marginBottom: '2px' 
                  }}>
                    QUÁ HẠN
                  </span>
                  <strong style={{ 
                    fontSize: '0.86rem', 
                    color: overdueTasks > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', 
                    fontFamily: 'var(--font-mono)' 
                  }}>
                    {overdueTasks.toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

