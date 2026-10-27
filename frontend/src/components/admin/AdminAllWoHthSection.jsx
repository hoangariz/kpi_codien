import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Network, 
  Search, 
  Save, 
  Trash2, 
  X, 
  RefreshCw, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Tag as TagIcon
} from 'lucide-react';
import { fixedWoApi } from '../../api/fixedWoApi';

// Helper to assign consistent vibrant badge color to each Tag
const TAG_COLORS = {
  'ksvhkt': { bg: 'rgba(14, 165, 233, 0.12)', text: '#0284c7', border: 'rgba(14, 165, 233, 0.35)' },
  'cơ điện': { bg: 'rgba(245, 158, 11, 0.12)', text: '#d97706', border: 'rgba(245, 158, 11, 0.35)' },
  'co dien': { bg: 'rgba(245, 158, 11, 0.12)', text: '#d97706', border: 'rgba(245, 158, 11, 0.35)' },
  'noc': { bg: 'rgba(139, 92, 246, 0.12)', text: '#7c3aed', border: 'rgba(139, 92, 246, 0.35)' },
  'vhktt': { bg: 'rgba(16, 185, 129, 0.12)', text: '#059669', border: 'rgba(16, 185, 129, 0.35)' },
  'ha tang': { bg: 'rgba(236, 72, 153, 0.12)', text: '#db2777', border: 'rgba(236, 72, 153, 0.35)' },
  'hạ tầng': { bg: 'rgba(236, 72, 153, 0.12)', text: '#db2777', border: 'rgba(236, 72, 153, 0.35)' },
};

export function getTagStyle(tagName) {
  if (!tagName) {
    return { bg: 'rgba(100, 116, 139, 0.12)', text: '#64748b', border: 'rgba(100, 116, 139, 0.25)' };
  }
  const key = tagName.trim().toLowerCase();
  if (TAG_COLORS[key]) return TAG_COLORS[key];
  // Simple hash for consistent random pleasant color
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [200, 260, 290, 330, 25, 140, 170];
  const h = hues[Math.abs(hash) % hues.length];
  return {
    bg: `hsla(${h}, 85%, 55%, 0.12)`,
    text: `hsl(${h}, 85%, 35%)`,
    border: `hsla(${h}, 85%, 55%, 0.35)`,
  };
}

export default function AdminAllWoHthSection() {
  const queryClient = useQueryClient();

  const [inputCodesText, setInputCodesText] = useState('');
  const [importMode, setImportMode] = useState('replace'); // 'replace' | 'append'
  const [tableSearch, setTableSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('all');
  const [selectedMatchFilter, setSelectedMatchFilter] = useState('all'); // 'all' | 'matched' | 'unmatched'

  // 1. Fetch All-Wo-HTH report details
  const { 
    data: hthReport, 
    isLoading: loadingReport, 
    refetch: refetchReport 
  } = useQuery({
    queryKey: ['admin-all-wo-hth-report'],
    queryFn: fixedWoApi.getAllWoHthReport,
  });

  const reportId = hthReport?.id;

  // 2. Fetch list of WOs currently loaded in All-Wo-HTH
  const { 
    data: viewingWoData, 
    isLoading: loadingWos, 
    refetch: refetchWos 
  } = useQuery({
    queryKey: ['admin-all-wo-hth-wos', reportId, tableSearch, selectedTagFilter, selectedMatchFilter],
    queryFn: () => fixedWoApi.listWoCodes(reportId, {
      search: tableSearch.trim() || undefined,
      tag: selectedTagFilter !== 'all' ? selectedTagFilter : undefined,
      matched_only: selectedMatchFilter === 'matched' ? true : selectedMatchFilter === 'unmatched' ? false : undefined,
    }),
    enabled: Boolean(reportId),
  });

  // Client-side Live Parser for previewing pasted content
  const parsedPreview = useMemo(() => {
    if (!inputCodesText.trim()) return { total: 0, items: [], tagsCount: {} };
    const lines = inputCodesText.split('\n');
    const seen = new Map();
    const tagsCount = {};

    lines.forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;

      let tag = null;
      let code = null;

      if (line.includes('\t')) {
        const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          tag = parts.slice(0, -1).join(' - ');
          code = parts[parts.length - 1];
        } else if (parts.length === 1) {
          code = parts[0];
        }
      } else if (line.includes(',') || line.includes(';')) {
        const parts = line.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          tag = parts.slice(0, -1).join(' - ');
          code = parts[parts.length - 1];
        } else if (parts.length === 1) {
          code = parts[0];
        }
      } else {
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          tag = parts.slice(0, -1).join(' ');
          code = parts[parts.length - 1];
        } else if (parts.length === 1) {
          code = parts[0];
        }
      }

      if (code && !seen.has(code)) {
        seen.set(code, tag);
        const tKey = tag || 'Chưa phân nhóm';
        tagsCount[tKey] = (tagsCount[tKey] || 0) + 1;
      }
    });

    return {
      total: seen.size,
      items: Array.from(seen.entries()).map(([c, t]) => ({ code: c, tag: t })),
      tagsCount,
    };
  }, [inputCodesText]);

  // Mutations
  const updateReportMutation = useMutation({
    mutationFn: (payload) => fixedWoApi.updateReport(reportId, payload),
    onSuccess: (res) => {
      setInputCodesText('');
      refetchReport();
      refetchWos();
      queryClient.invalidateQueries({ queryKey: ['admin-fixed-wo-reports'] });
      queryClient.invalidateQueries({ queryKey: ['fixed-wo-reports'] });
      queryClient.invalidateQueries({ queryKey: ['fixed-wo-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-wo-hth-stats'] });
      alert(`Đã lưu danh mục All-Wo-HTH thành công! Hiện có ${res.total_wos} mã WO.`);
    },
    onError: (err) => {
      alert('Lỗi khi lưu danh mục All-Wo-HTH: ' + (err.response?.data?.detail || err.message));
    }
  });

  const handleSaveWos = () => {
    if (!parsedPreview.total) {
      alert('Vui lòng dán danh sách mã WO (kèm nhóm tag) trước khi lưu!');
      return;
    }

    // Format items as text lines "tag\tcode"
    const textLines = parsedPreview.items
      .map(it => (it.tag ? `${it.tag}\t${it.code}` : it.code))
      .join('\n');

    if (importMode === 'replace') {
      if (!confirm(`Bạn có chắc muốn GHI ĐÈ TOÀN BỘ danh sách All-Wo-HTH bằng ${parsedPreview.total} mã WO mới này?`)) {
        return;
      }
      updateReportMutation.mutate({ wo_codes: textLines });
    } else {
      updateReportMutation.mutate({ wo_codes_to_add: textLines });
    }
  };

  const handleClearAllWos = () => {
    if (!hthReport?.total_wos) return;
    if (!confirm('Bạn có chắc chắn muốn XÓA TOÀN BỘ mã WO trong báo cáo All-Wo-HTH không?')) {
      return;
    }
    updateReportMutation.mutate({ wo_codes: '' });
  };

  const handleRemoveSingleWo = (woCode) => {
    if (!confirm(`Xóa mã WO "${woCode}" khỏi All-Wo-HTH?`)) return;
    updateReportMutation.mutate({ wo_codes_to_remove: woCode });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header Card */}
      <div 
        className="card" 
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(99, 102, 241, 0.04) 100%)',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div 
              style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.35)',
                flexShrink: 0
              }}
            >
              <Network size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Quản Lý Báo Cáo All-Wo-HTH
                </h2>
                <span 
                  className="badge" 
                  style={{ 
                    background: 'rgba(14, 165, 233, 0.15)', 
                    color: '#0284c7', 
                    border: '1px solid rgba(14, 165, 233, 0.3)',
                    fontWeight: 750,
                    fontSize: '0.72rem'
                  }}
                >
                  🌐 Hardcoded • Cố định Tổng Quan
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Báo cáo nguồn WO toàn mạng hiển thị cố định trên <strong>1. Tổng Quan</strong>. Hỗ trợ import danh sách kèm Nhóm WO (Tag) để thống kê biểu đồ và bảng tiến độ theo từng nhóm (KSVHKT, Cơ điện, NOC...).
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { refetchReport(); refetchWos(); }}
              disabled={loadingReport || loadingWos}
              style={{ fontSize: '0.8rem', padding: '6px 12px', gap: '5px' }}
            >
              <RefreshCw size={13} className={loadingReport || loadingWos ? 'animate-spin' : ''} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
            gap: '12px', 
            marginTop: '18px' 
          }}
        >
          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>TỔNG MÃ WO HIỆN CÓ</span>
            <strong style={{ fontSize: '1.35rem', color: '#0ea5e9', fontFamily: 'var(--font-mono)' }}>
              {(hthReport?.total_wos ?? 0).toLocaleString()}
            </strong>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, display: 'block' }}>KHỚP TRONG DỮ LIỆU LOG</span>
            <strong style={{ fontSize: '1.35rem', color: '#059669', fontFamily: 'var(--font-mono)' }}>
              {(viewingWoData?.matched_count ?? hthReport?.matched_wos ?? 0).toLocaleString()}
            </strong>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600, display: 'block' }}>CHƯA KHỚP (TÍNH TỒN / IS KL)</span>
            <strong style={{ fontSize: '1.35rem', color: '#d97706', fontFamily: 'var(--font-mono)' }}>
              {(viewingWoData?.unmatched_count ?? Math.max(0, (hthReport?.total_wos || 0) - (hthReport?.matched_wos || 0))).toLocaleString()}
            </strong>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, display: 'block' }}>SỐ NHÓM WO (TAG)</span>
            <strong style={{ fontSize: '1.35rem', color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
              {(viewingWoData?.available_tags?.length ?? 0).toLocaleString()}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. Import & Input Section */}
      <div 
        className="card" 
        style={{
          padding: '20px 22px',
          background: '#ffffff',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TagIcon size={18} style={{ color: '#0ea5e9' }} />
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Nhập / Dán Danh Sách Mã WO Kèm Nhóm (Tag)
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
              <input 
                type="radio" 
                name="importMode" 
                value="replace" 
                checked={importMode === 'replace'} 
                onChange={() => setImportMode('replace')}
              />
              <span>Ghi đè toàn bộ</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
              <input 
                type="radio" 
                name="importMode" 
                value="append" 
                checked={importMode === 'append'} 
                onChange={() => setImportMode('append')}
              />
              <span>Thêm mới vào danh sách hiện có</span>
            </label>
          </div>
        </div>

        {/* Guidance Box */}
        <div 
          style={{
            padding: '10px 14px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}
        >
          <HelpCircle size={15} style={{ color: '#0ea5e9', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Định dạng hỗ trợ:</strong> Dán trực tiếp từ Excel (2 cột: <code>[Nhóm WO]</code> và <code>[Mã WO]</code> cách nhau bằng phím Tab), hoặc cách nhau bởi dấu phẩy, khoảng trắng.
            <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-primary)' }}>
              Ví dụ:<br />
              KSVHKT&emsp;&emsp;WO_WFM-FT_20260923_174715597<br />
              Cơ điện&emsp;&emsp;WO_WFM-FT_20260908_173962053<br />
              NOC&emsp;&emsp;&emsp;WO_TT_20261001_175166721
            </div>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          rows={6}
          className="select-filter"
          value={inputCodesText}
          onChange={(e) => setInputCodesText(e.target.value)}
          placeholder="Dán danh sách mã WO kèm Nhóm WO tại đây..."
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            resize: 'vertical',
            background: '#fafafa'
          }}
        />

        {/* Live Parse Preview Badge Strip */}
        {parsedPreview.total > 0 && (
          <div 
            style={{ 
              marginTop: '10px', 
              padding: '10px 14px', 
              background: 'rgba(14, 165, 233, 0.06)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px dashed rgba(14, 165, 233, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 750, color: '#0284c7' }}>
                ✓ Nhận diện được: {parsedPreview.total.toLocaleString()} mã WO hợp lệ
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {importMode === 'replace' ? 'Chế độ: Ghi đè toàn bộ' : 'Chế độ: Thêm mới'}
              </span>
            </div>

            {/* Tag Breakdown Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Phân bổ nhóm:</span>
              {Object.entries(parsedPreview.tagsCount).map(([tagName, count]) => {
                const style = getTagStyle(tagName);
                return (
                  <span
                    key={tagName}
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: style.bg,
                      color: style.text,
                      border: `1px solid ${style.border}`,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>{tagName}</span>
                    <strong style={{ opacity: 0.9 }}>({count})</strong>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          {inputCodesText && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setInputCodesText('')}
              style={{ fontSize: '0.8rem', padding: '6px 14px', gap: '4px' }}
            >
              <X size={14} /> Xóa nhập liệu
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveWos}
            disabled={!parsedPreview.total || updateReportMutation.isLoading}
            style={{ 
              fontSize: '0.84rem', 
              padding: '7px 18px', 
              gap: '6px',
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              borderColor: '#0284c7',
              fontWeight: 750
            }}
          >
            <Save size={15} />
            {updateReportMutation.isLoading ? 'Đang lưu...' : `Lưu ${parsedPreview.total > 0 ? `(${parsedPreview.total} mã)` : ''}`}
          </button>
        </div>
      </div>

      {/* 3. Table of Currently Loaded WOs */}
      <div 
        className="card" 
        style={{
          padding: '18px 22px',
          background: '#ffffff',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* Table Header & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Danh Sách Mã WO Đang Áp Dụng ({viewingWoData?.total_wos?.toLocaleString() ?? 0})
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Dữ liệu này sẽ xuất hiện trên Trang 1. Tổng Quan và được tính toán tự động
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', minWidth: '180px' }}>
              <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="select-filter"
                placeholder="Tìm mã hoặc nhóm..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                style={{ width: '100%', padding: '5px 10px 5px 28px', fontSize: '0.78rem' }}
              />
            </div>

            {/* Filter by Tag */}
            <select
              className="select-filter"
              value={selectedTagFilter}
              onChange={(e) => setSelectedTagFilter(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '0.78rem', minWidth: '130px' }}
            >
              <option value="all">Tất cả Nhóm WO</option>
              {(viewingWoData?.available_tags || []).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="none">Chưa phân nhóm</option>
            </select>

            {/* Filter by Match Status */}
            <select
              className="select-filter"
              value={selectedMatchFilter}
              onChange={(e) => setSelectedMatchFilter(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '0.78rem', minWidth: '130px' }}
            >
              <option value="all">Tất cả khớp DB</option>
              <option value="matched">Đã khớp DB</option>
              <option value="unmatched">Chưa khớp DB (IS KL)</option>
            </select>

            {/* Clear All Button */}
            {Boolean(hthReport?.total_wos) && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleClearAllWos}
                disabled={updateReportMutation.isLoading}
                style={{ 
                  color: '#ef4444', 
                  borderColor: 'rgba(239, 68, 68, 0.4)', 
                  fontSize: '0.76rem', 
                  padding: '5px 10px', 
                  gap: '4px' 
                }}
                title="Xóa toàn bộ mã WO của All-Wo-HTH"
              >
                <Trash2 size={13} />
                Xóa tất cả
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        {loadingWos ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            <RefreshCw size={18} className="animate-spin" style={{ display: 'inline-block', marginBottom: '8px' }} /><br />
            Đang tải danh sách mã WO...
          </div>
        ) : !viewingWoData?.items?.length ? (
          <div 
            style={{ 
              padding: '36px 16px', 
              textAlign: 'center', 
              color: 'var(--text-muted)', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-color)',
              fontSize: '0.84rem'
            }}
          >
            Chưa có mã WO nào trong All-Wo-HTH hoặc không khớp bộ lọc tìm kiếm. Hãy dán mã ở trên và bấm Lưu!
          </div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table className="table" style={{ fontSize: '0.8rem', width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '130px' }}>🏷️ Nhóm WO (Tag)</th>
                  <th>Mã Công Việc (WO)</th>
                  <th style={{ width: '130px' }}>Trạng Thái Log</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>Khớp Hệ Thống</th>
                  <th>Ghi Chú</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Xóa</th>
                </tr>
              </thead>
              <tbody>
                {viewingWoData.items.map((it, idx) => {
                  const tagStyle = getTagStyle(it.tag);
                  return (
                    <tr key={`${it.ma_cong_viec}_${idx}`}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                        {idx + 1}
                      </td>
                      <td>
                        {it.tag ? (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: tagStyle.bg,
                              color: tagStyle.text,
                              border: `1px solid ${tagStyle.border}`,
                              fontWeight: 750,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {it.tag}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            --
                          </span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 650, color: 'var(--text-primary)' }}>
                        {it.ma_cong_viec}
                      </td>
                      <td>
                        <span 
                          className="badge" 
                          style={{ 
                            fontSize: '0.72rem', 
                            padding: '1px 6px',
                            background: it.is_matched ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: it.is_matched ? '#059669' : '#d97706'
                          }}
                        >
                          {it.trang_thai}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {it.is_matched ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '3px', 
                              fontSize: '0.72rem', 
                              color: '#059669',
                              fontWeight: 700 
                            }}
                          >
                            <CheckCircle2 size={13} /> Khớp
                          </span>
                        ) : (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '3px', 
                              fontSize: '0.72rem', 
                              color: '#d97706',
                              fontWeight: 700 
                            }}
                            title="Mã WO chưa thấy trong log công việc tháng này (sẽ tính là Đã giao FT / Tồn việc)"
                          >
                            <AlertCircle size={13} /> Chưa khớp
                          </span>
                        )}
                      </td>
                      <td style={{ color: it.ghi_chu === '(IS KL)' ? '#d97706' : 'var(--text-secondary)', fontSize: '0.74rem' }}>
                        {it.ghi_chu || '--'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-icon"
                          onClick={() => handleRemoveSingleWo(it.ma_cong_viec)}
                          style={{ width: '24px', height: '24px', padding: 0, color: '#ef4444', borderColor: 'transparent' }}
                          title="Xóa mã này khỏi All-Wo-HTH"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
