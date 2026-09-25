import React, { useEffect, useState } from 'react';
import { Database, MapPin, Zap, Construction, Sparkles, Clock, ArrowRight } from 'lucide-react';

const FEATURES = [
  {
    icon: '📡',
    title: 'Tra cứu thông tin trạm BTS',
    desc: 'Tìm kiếm, xem chi tiết thông tin kỹ thuật, địa chỉ, tọa độ và lịch sử bảo trì của từng trạm BTS trong toàn mạng.',
  },
  {
    icon: '⚡',
    title: 'Cơ sở dữ liệu MPĐ (Máy phát điện)',
    desc: 'Quản lý danh sách MPĐ, thông số kỹ thuật, lịch bảo dưỡng định kỳ, công suất và trạng thái hoạt động thực tế.',
  },
  {
    icon: '🗺️',
    title: 'Bản đồ phân bổ trạm',
    desc: 'Hiển thị trực quan vị trí các trạm trên bản đồ tương tác, lọc theo cụm, tỉnh/thành phố, trạng thái vận hành.',
  },
  {
    icon: '📊',
    title: 'Báo cáo CSDL tổng hợp',
    desc: 'Xuất báo cáo danh sách trạm, tình trạng thiết bị, lịch sử sự cố theo thời gian, hỗ trợ xuất Excel/PDF.',
  },
];

export default function CsdbPage() {
  const [tick, setTick] = useState(0);
  const [cardVisible, setCardVisible] = useState([]);

  // Stagger card reveal
  useEffect(() => {
    FEATURES.forEach((_, i) => {
      setTimeout(() => {
        setCardVisible(prev => [...prev, i]);
      }, 150 + i * 120);
    });
  }, []);

  // Animate dots
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 600);
    return () => clearInterval(id);
  }, []);
  const dots = '.'.repeat((tick % 3) + 1).padEnd(3, '\u00a0');

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '16px 0' }}>

      {/* Hero banner */}
      <div style={{
        borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(6,182,212,0.08) 100%)',
        border: '1px solid rgba(99,102,241,0.25)',
        padding: '36px 32px',
        marginBottom: '28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow orbs */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '20%',
          width: '140px', height: '140px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', position: 'relative' }}>
          {/* Animated icon */}
          <div style={{
            width: '64px', height: '64px', flexShrink: 0,
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
            animation: 'float-icon 3s ease-in-out infinite',
          }}>
            <Database size={30} color="#fff" />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                CSDL Trạm / MPĐ
              </h1>
              <span style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 800,
                background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                color: '#fff', letterSpacing: '0.05em',
                animation: 'pulse-badge 2s ease-in-out infinite',
                boxShadow: '0 0 10px rgba(245,158,11,0.4)',
              }}>
                ĐANG PHÁT TRIỂN
              </span>
            </div>

            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
              Cơ sở dữ liệu trạm BTS và máy phát điện toàn mạng VCC — tích hợp tra cứu, quản lý
              và báo cáo trực tiếp trên nền tảng KPI Cơ Điện.
            </p>

            {/* Progress indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                flex: 1, height: '6px', borderRadius: '3px',
                background: 'var(--border-color)', overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%', width: '35%',
                  background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
                  borderRadius: '3px',
                  animation: 'progress-glow 2s ease-in-out infinite',
                }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                35% hoàn thành
              </span>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={{
          marginTop: '20px',
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '0.8rem', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          position: 'relative'
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: '#f59e0b',
            animation: 'blink 1.2s ease-in-out infinite',
            flexShrink: 0,
            boxShadow: '0 0 6px rgba(245,158,11,0.8)'
          }} />
          <span>Hệ thống đang trong quá trình xây dựng{dots}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> Dự kiến: Tháng 10 / 2026
          </span>
        </div>
      </div>

      {/* Feature cards */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '14px', letterSpacing: '0.06em' }}>
          TÍNH NĂNG DỰ KIẾN
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '14px',
        }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                padding: '18px 20px',
                display: 'flex', gap: '14px', alignItems: 'flex-start',
                opacity: cardVisible.includes(i) ? 1 : 0,
                transform: cardVisible.includes(i) ? 'translateY(0)' : 'translateY(16px)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
                cursor: 'default',
              }}
            >
              <div style={{ fontSize: '1.6rem', lineHeight: 1, flexShrink: 0 }}>{f.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '5px' }}>
                  {f.title}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {f.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Note box */}
      <div style={{
        marginTop: '24px',
        padding: '14px 18px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(99,102,241,0.07)',
        border: '1px dashed rgba(99,102,241,0.3)',
        display: 'flex', alignItems: 'center', gap: '10px',
        fontSize: '0.82rem', color: 'var(--text-secondary)',
      }}>
        <Construction size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span>
          Nếu cần dữ liệu gấp, bạn có thể liên hệ nhóm phát triển để được hỗ trợ truy xuất
          thông tin trạm trực tiếp từ CSDL nội bộ.
        </span>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes float-icon {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes pulse-badge {
          0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(245,158,11,0.4); }
          50% { opacity: 0.8; box-shadow: 0 0 18px rgba(245,158,11,0.7); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes progress-glow {
          0%, 100% { box-shadow: none; }
          50% { box-shadow: 0 0 8px rgba(99,102,241,0.6); }
        }
      `}</style>
    </div>
  );
}
