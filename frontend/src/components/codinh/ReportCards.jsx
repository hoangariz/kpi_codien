import React from 'react';
import { CheckCircle2, FileSpreadsheet } from 'lucide-react';

export default function ReportCards({
  reportsList = [],
  selectedReportKey,
  onSelectReport,
}) {
  if (!reportsList.length) return null;

  return (
    <div style={{ marginBottom: '22px' }}>
      <div
        className="report-cards-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        {reportsList.map((rep) => {
          const isSelected = selectedReportKey === rep.key;
          const isThc = rep.key === 'thc';
          const isQlctkt = rep.key === 'qlctkt_trien_khai';
          const isTongHopSuCo = rep.key === 'tong_hop_su_co';
          const isTonTkTheoNgay = rep.key === 'ton_tk_theo_ngay';

          return (
            <div
              key={rep.key}
              className="report-selector-card"
              onClick={() => onSelectReport(rep.key)}
              style={{
                cursor: 'pointer',
                padding: '16px 18px',
                borderRadius: 'var(--radius-lg)',
                border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                background: isSelected
                  ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(59, 130, 246, 0.05) 100%)'
                  : 'var(--bg-secondary)',
                boxShadow: isSelected ? '0 4px 16px -2px rgba(139, 92, 246, 0.25)' : 'var(--shadow-sm)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '154px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span
                    className={`badge ${isSelected ? 'badge-purple' : 'badge-neutral'}`}
                    style={{ gap: '5px', fontWeight: 700, fontSize: '0.75rem' }}
                  >
                    {isSelected ? <CheckCircle2 size={13} /> : <FileSpreadsheet size={13} />}
                    {isSelected ? 'Đang Xem' : 'Chọn Báo Cáo'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {isQlctkt || isTongHopSuCo || isTonTkTheoNgay ? 'Theo Ngày' : 'Theo Đầu Việc'}
                  </span>
                </div>

                <h4
                  style={{
                    fontSize: '0.96rem',
                    fontWeight: 800,
                    color: isSelected ? '#8b5cf6' : 'var(--text-primary)',
                    marginBottom: '10px',
                    lineHeight: 1.4,
                  }}
                >
                  {rep.title}
                </h4>
              </div>

              {isTonTkTheoNgay ? (
                /* MINI KPI CHO TỒN TK THEO NGÀY (3 CHỈ SỐ: TỔNG TỒN, ≤30 NGÀY, >30 NGÀY) */
                <div
                  className="card-kpi-summary-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '4px',
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                    textAlign: 'center',
                    marginTop: '8px',
                  }}
                >
                  <div title="Tổng số task triển khai đang tồn">
                    <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      TỔNG TỒN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.tong_ton) || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số task tồn tạo trong 30 ngày gần nhất">
                    <span style={{ fontSize: '0.62rem', color: '#3b82f6', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      ≤ 30 NGÀY
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: '#3b82f6', fontFamily: 'var(--font-mono)' }}>
                      {Math.max(0, (Number(rep.tong_ton) || 0) - (Number(rep.gt_30d) || 0)).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số task tồn tạo cách đây hơn 30 ngày">
                    <span style={{ fontSize: '0.62rem', color: (Number(rep.gt_30d) || 0) > 0 ? '#ef4444' : 'var(--text-muted)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      &gt; 30 NGÀY
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: (Number(rep.gt_30d) || 0) > 0 ? '#ef4444' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.gt_30d) || 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
              ) : isTongHopSuCo ? (
                /* MINI KPI CHO TỔNG HỢP SỰ CỐ (3 CHỈ SỐ: TỒN SỰ CỐ, QUÁ HẠN, HOT) */
                <div
                  className="card-kpi-summary-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '4px',
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                    textAlign: 'center',
                    marginTop: '8px',
                  }}
                >
                  <div title="Tổng số sự cố đang tồn">
                    <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      TỒN SỰ CỐ
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.ton_su_co) || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số sự cố bị quá hạn">
                    <span style={{ fontSize: '0.62rem', color: 'var(--danger-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      QUÁ HẠN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: (Number(rep.qua_han) || 0) > 0 ? '#ef4444' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.qua_han) || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số sự cố mức độ HOT">
                    <span style={{ fontSize: '0.62rem', color: '#ec4899', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      HOT
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: (Number(rep.hot) || 0) > 0 ? '#ec4899' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.hot) || 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
              ) : isQlctkt ? (
                /* MINI KPI CHO QLCTKT TRIỂN KHAI (3 CHỈ SỐ: TỔNG TỒN, QUÁ HẠN, HỦY) */
                <div
                  className="card-kpi-summary-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '4px',
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                    textAlign: 'center',
                    marginTop: '8px',
                  }}
                >
                  <div title="Tổng số công việc tồn triển khai">
                    <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      TỔNG TỒN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.tong_ton) || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số công việc quá hạn">
                    <span style={{ fontSize: '0.62rem', color: 'var(--danger-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      QUÁ HẠN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: (Number(rep.qua_han) || 0) > 0 ? '#ef4444' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.qua_han) || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số công việc hủy">
                    <span style={{ fontSize: '0.62rem', color: 'var(--danger-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      HỦY
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: (Number(rep.huy) || 0) > 0 ? '#ef4444' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(Number(rep.huy) || 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
              ) : isThc ? (
                /* MINI KPI CHO BẢO DƯỠNG THC (5 CHỈ SỐ: % ĐÓNG, TỒN VIỆC, QUÁ HẠN, TỦ TỒN, TỦ QUÁ HẠN) */
                <div
                  className="card-kpi-summary-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '4px',
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                    textAlign: 'center',
                    marginTop: '8px',
                  }}
                >
                  <div title="Tỷ lệ hoàn thành đóng công việc">
                    <span style={{ fontSize: '0.62rem', color: 'var(--brand-primary)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      % ĐÓNG
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                      {rep.wo_rate || 0}%
                    </strong>
                  </div>

                  <div title="Số công việc tồn chưa hoàn thành">
                    <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      TỒN VIỆC
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {(rep.pending_wos || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số công việc bị quá hạn">
                    <span style={{ fontSize: '0.62rem', color: (rep.overdue_wos || 0) > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      QUÁ HẠN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: (rep.overdue_wos || 0) > 0 ? 'var(--danger-dark)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(rep.overdue_wos || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số lượng tủ cáp THC con còn tồn chưa xong">
                    <span style={{ fontSize: '0.62rem', color: '#8b5cf6', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      TỦ TỒN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                      {(rep.pending_cabinets || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số lượng tủ cáp THC con chưa xong thuộc các WO quá hạn">
                    <span style={{ fontSize: '0.62rem', color: (rep.overdue_cabinets || 0) > 0 ? '#ef4444' : 'var(--text-muted)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      TỦ QUÁ HẠN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: (rep.overdue_cabinets || 0) > 0 ? '#ef4444' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(rep.overdue_cabinets || 0).toLocaleString()}
                    </strong>
                  </div>
                </div>
              ) : (
                /* MINI KPI CHO ĐH PORT KÉM: % ĐÓNG, TỒN, HOME KÉM, PORT KÉM, HÔM QUA */
                <div
                  className="card-kpi-summary-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '4px',
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                    textAlign: 'center',
                    marginTop: '8px',
                  }}
                >
                  <div title="Tỷ lệ hoàn thành đóng công việc">
                    <span style={{ fontSize: '0.62rem', color: 'var(--brand-primary)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      % ĐÓNG
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                      {rep.wo_rate || 0}%
                    </strong>
                  </div>

                  <div title="Số công việc tồn chưa hoàn thành">
                    <span style={{ fontSize: '0.62rem', color: 'var(--warning-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      TỒN
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--warning-dark)', fontFamily: 'var(--font-mono)' }}>
                      {(rep.pending_wos || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số công việc Home wifi thu kém đang tồn">
                    <span style={{ fontSize: '0.62rem', color: '#9333ea', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      HOME KÉM
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: '#9333ea', fontFamily: 'var(--font-mono)' }}>
                      {(rep.home_kem_count || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số công việc Port kém GPON đang tồn">
                    <span style={{ fontSize: '0.62rem', color: '#06b6d4', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      PORT KÉM
                    </span>
                    <strong style={{ fontSize: '0.84rem', color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>
                      {(rep.port_kem_count || 0).toLocaleString()}
                    </strong>
                  </div>

                  <div title="Số công việc hoàn thành hôm qua">
                    <span style={{ fontSize: '0.62rem', color: 'var(--success-dark)', display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                      HÔM QUA
                    </span>
                    <strong
                      style={{
                        fontSize: '0.84rem',
                        color: (rep.closed_yesterday_wos || 0) > 0 ? 'var(--success-dark)' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {(rep.closed_yesterday_wos || 0) > 0 ? `+${rep.closed_yesterday_wos}` : 0}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
