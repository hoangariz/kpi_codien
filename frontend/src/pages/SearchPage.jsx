import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  RotateCcw,
  Eye,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Radio,
  User,
  Layers,
  Calendar,
  Send,
  Plus,
  Tag,
  ChevronLeft,
  ChevronRight,
  BookmarkPlus,
  FileText,
  MapPin,
  Building2,
  XCircle,
  UserCheck,
  Database
} from 'lucide-react';

import { tasksApi } from '../api/tasksApi';
import { reportCategoryApi } from '../api/reportCategoryApi';
import { metaApi } from '../api/metaApi';
import { importsApi } from '../api/importsApi';
import TaskDetailModal from '../components/TaskDetailModal';

// FT accounts list requested by user for smart auto-suggestions
export const FT_SUGGESTION_LIST = [
  'duandt',
  'hoainm',
  'loivt',
  'ducnk3',
  'hiepnv26',
  'thangnv48',
  'khiemnb',
  'd00170598',
  'khaipv4',
  'nghialt1',
  'namnt331',
  'hongta1',
  'thiettq',
  'quyetna',
  'ngannh',
  'quyennn',
  'd00202612',
  'huunt5',
  'haint150',
  'hiennv41',
  'phunv20',
  'cuongdh1',
  'hoangdt9',
  'khuyenls',
  'aind35',
  'quangln5'
];

export default function SearchPage({ onNavigateToDashboard }) {
  const queryClient = useQueryClient();

  // Search parameters
  const [searchMode, setSearchMode] = useState('wo'); // 'wo' | 'station_ft' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [woTags, setWoTags] = useState([]); // Parsed WO codes when multiple pasted
  const [ftInput, setFtInput] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTaskType, setSelectedTaskType] = useState('');
  const [isOverdue, setIsOverdue] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Auto-suggest state for FT
  const [showFtSuggestions, setShowFtSuggestions] = useState(false);
  const ftSuggestRef = useRef(null);

  // Detail Modal state
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);

  // Inline Quick Note state
  const [quickNoteTaskId, setQuickNoteTaskId] = useState(null);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteAuthor, setQuickNoteAuthor] = useState('Điều hành');

  // Close FT suggestion dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ftSuggestRef.current && !ftSuggestRef.current.contains(e.target)) {
        setShowFtSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch latest import log for data freshness timestamp
  const { data: importLogs } = useQuery({
    queryKey: ['import-logs-latest'],
    queryFn: () => importsApi.getImportLogs(1),
    staleTime: 5 * 60 * 1000,
  });

  const latestImport = importLogs && importLogs.length > 0 ? importLogs[0] : null;
  const lastDataUpdate = latestImport?.imported_at || null;

  const parseUtcDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const str = String(val).trim();
    const iso = str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str)
      ? str
      : (str.includes('T') ? str + 'Z' : str.replace(' ', 'T') + 'Z');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date(str) : d;
  };

  const formatDataTimestamp = (val) => {
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
  };

  // Fetch categories for task type filter
  const { data: categories } = useQuery({
    queryKey: ['report-categories'],
    queryFn: () => reportCategoryApi.getCategories(),
  });

  // Fetch filters meta (statuses, groups, etc.)
  const { data: filtersMeta } = useQuery({
    queryKey: ['meta-filters'],
    queryFn: metaApi.getFilters,
  });

  // Parse multiple WO codes from input
  const parseWoCodes = (input) => {
    if (!input.trim()) return [];
    // Split by comma, semicolon, newline, tab, or multiple spaces
    return input
      .split(/[,;\n\t]+|\s{2,}/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  // Handle WO input change – detect multiple codes
  const handleSearchInputChange = (value) => {
    setSearchQuery(value);
    if (searchMode === 'wo') {
      const codes = parseWoCodes(value);
      setWoTags(codes.length > 1 ? codes : []);
    } else {
      setWoTags([]);
    }
  };

  // Remove a single WO tag
  const removeWoTag = (codeToRemove) => {
    const updated = woTags.filter(c => c !== codeToRemove);
    setWoTags(updated);
    setSearchQuery(updated.join(', '));
  };

  // Build query params for tasksApi
  // When multiple WO codes detected, send them all as comma-separated
  const queryParams = {
    page,
    page_size: pageSize,
    trang_thai: selectedStatus || undefined,
    loai_cong_viec: selectedTaskType || undefined,
    is_overdue: isOverdue === 'true' ? true : isOverdue === 'false' ? false : undefined,
    sort_by: 'thoi_diem_tao',
    sort_order: 'desc',
  };

  // Dispatch search query to exact backend field depending on searchMode
  if (searchQuery.trim()) {
    if (searchMode === 'wo') {
      // If multiple WO tags, send all as comma-separated for backend IN() query
      if (woTags.length > 1) {
        queryParams.search = woTags.join(',');
      } else {
        queryParams.search = searchQuery.trim();
      }
    } else if (searchMode === 'station_ft') {
      // Search both station code and FT username simultaneously
      queryParams.station_code = searchQuery.trim();
      queryParams.ft_username = searchQuery.trim();
    } else {
      // 'all' mode
      queryParams.search = searchQuery.trim();
    }
  }

  if (ftInput.trim()) {
    queryParams.ft_username = ftInput.trim();
  }

  // Query tasks
  const { data: tasksData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['tasks-search', queryParams],
    queryFn: () => tasksApi.getTasks(queryParams),
    keepPreviousData: true,
  });

  const tasksList = tasksData?.items || [];
  const totalTasks = tasksData?.total || 0;
  const totalPages = tasksData?.total_pages || 1;

  // Filter FT suggestions based on input
  const matchingFtList = FT_SUGGESTION_LIST.filter(ft =>
    !ftInput.trim() || ft.toLowerCase().includes(ftInput.toLowerCase().trim())
  );

  // Handler to open full task detail
  const handleOpenTaskDetail = async (ma_cong_viec) => {
    try {
      const fullTask = await tasksApi.getTaskDetail(ma_cong_viec);
      setSelectedDetailTask(fullTask);
    } catch (err) {
      alert('Không thể tải chi tiết công việc: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Quick Note submit mutation
  const quickNoteMutation = useMutation({
    mutationFn: ({ ma_cong_viec, content, author }) =>
      tasksApi.addTaskNote(ma_cong_viec, content, author),
    onSuccess: (newNote, variables) => {
      setQuickNoteTaskId(null);
      setQuickNoteText('');
      queryClient.invalidateQueries({ queryKey: ['tasks-search'] });
      queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-board-detail'] });
    },
    onError: (err) => {
      alert('Lỗi lưu ghi chú: ' + (err.response?.data?.detail || err.message));
    }
  });

  const handleResetFilters = () => {
    setSearchMode('wo');
    setSearchQuery('');
    setWoTags([]);
    setFtInput('');
    setSelectedStatus('');
    setSelectedTaskType('');
    setIsOverdue('');
    setPage(1);
  };

  // Count lines in textarea
  const lineCount = searchQuery ? searchQuery.split(/\n/).length : 1;

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    refetch();
  };

  const formatDate = (d) => {
    if (!d) return '--';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const getStatusBadge = (status) => {
    if (!status) return <span className="badge badge-neutral">--</span>;
    const lower = status.toLowerCase();
    if (lower.includes('đóng')) return <span className="badge badge-success">✓ {status}</span>;
    if (lower.includes('ft hoàn thành')) return <span className="badge badge-cyan">⚡ {status}</span>;
    if (lower.includes('chờ') && lower.includes('tiếp nhận')) return <span className="badge badge-purple">⏳ {status}</span>;
    if (lower.includes('quá hạn') || lower.includes('trễ')) return <span className="badge badge-danger">⚠ {status}</span>;
    if (lower.includes('từ chối')) return <span className="badge badge-danger">✕ {status}</span>;
    if (lower.includes('đang thực hiện') || lower.includes('tiếp nhận') || lower.includes('giao ft')) {
      return <span className="badge badge-info">▶ {status}</span>;
    }
    return <span className="badge badge-neutral">{status}</span>;
  };

  return (
    <div>
      {/* 1. Data Freshness Indicator + Back Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Database size={13} style={{ color: 'var(--text-muted)', opacity: 0.7 }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Dữ liệu cập nhật đến: <strong style={{ color: lastDataUpdate ? 'var(--brand-primary)' : 'var(--text-muted)' }}>{formatDataTimestamp(lastDataUpdate)}</strong>
            {latestImport?.file_name && (
              <span style={{ marginLeft: '6px', opacity: 0.6 }}>({latestImport.file_name})</span>
            )}
          </span>
        </div>

        {onNavigateToDashboard && (
          <button
            onClick={onNavigateToDashboard}
            className="btn btn-outline"
            style={{ fontSize: '0.82rem', padding: '6px 14px', gap: '6px' }}
          >
            ⬅ Về Bảng Tổng Quan
          </button>
        )}
      </div>

      {/* 2. Main Search & Filter Form */}
      <div className="table-card" style={{ padding: '22px 24px', marginBottom: '22px' }}>
        <form onSubmit={handleSearchSubmit}>
          {/* Row 1: Search Mode Pills & Big Search Bar */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Chế độ:
              </span>
              <button
                type="button"
                className={`btn ${searchMode === 'wo' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setSearchMode('wo'); setWoTags([]); setSearchQuery(''); }}
                style={{ padding: '4px 14px', fontSize: '0.8rem', borderRadius: '20px', fontWeight: 700 }}
              >
                📌 Mã WO
              </button>
              <button
                type="button"
                className={`btn ${searchMode === 'station_ft' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setSearchMode('station_ft'); setWoTags([]); setSearchQuery(''); }}
                style={{ padding: '4px 14px', fontSize: '0.8rem', borderRadius: '20px', fontWeight: 700 }}
              >
                📡 Mã Trạm / Nhân viên FT
              </button>
              <button
                type="button"
                className={`btn ${searchMode === 'all' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setSearchMode('all'); setWoTags([]); setSearchQuery(''); }}
                style={{ padding: '4px 14px', fontSize: '0.8rem', borderRadius: '20px', fontWeight: 700 }}
              >
                🔍 Tất Cả
              </button>
            </div>

            {/* Input Search Box */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              {/* Textarea wrapper with line counter */}
              <div style={{ position: 'relative', flex: '1 1 0%', minWidth: 0, display: 'flex' }}>
                {/* Line number gutter */}
                <div
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: '32px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRight: 'none',
                    borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                    padding: '9px 0',
                    textAlign: 'center',
                    userSelect: 'none',
                    overflow: 'hidden'
                  }}
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--text-muted)',
                        lineHeight: '1.5rem',
                        opacity: 0.6
                      }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Search icon */}
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '40px',
                    top: '11px',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none'
                  }}
                />

                {/* Textarea – no select-filter class (it has max-width:220px which breaks flex) */}
                <textarea
                  placeholder={
                    searchMode === 'wo'
                      ? 'Nhập mã WO, mỗi dòng 1 mã hoặc phân cách bằng dấu phẩy\nVD:\n260901001\n260901002\n260901003'
                      : searchMode === 'station_ft'
                        ? 'Nhập mã trạm hoặc tên / mã nhân viên FT'
                        : 'Tìm theo nội dung, ghi chú, thuê bao...'
                  }
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  rows={Math.max(lineCount, 3)}
                  style={{
                    flex: '1 1 auto',
                    width: 0,
                    minWidth: 0,
                    maxWidth: 'none',
                    boxSizing: 'border-box',
                    padding: '8px 30px 8px 26px',
                    fontSize: '0.88rem',
                    fontFamily: searchMode === 'wo' || searchMode === 'station_ft' ? 'var(--font-mono)' : 'inherit',
                    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    resize: 'none',
                    lineHeight: '1.5rem',
                    minHeight: '38px',
                    overflow: 'auto',
                    display: 'block'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--brand-primary)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; }}
                />

                {/* Clear button */}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setWoTags([]); }}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 800,
                      lineHeight: 1
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '0 20px', fontSize: '0.85rem', gap: '6px', fontWeight: 700, height: '38px', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <Search size={14} /> Tìm
              </button>
            </div>

            {/* WO Tags display when multiple codes detected */}
            {woTags.length > 1 && searchMode === 'wo' && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  ⚡ {woTags.length} mã WO:
                </span>
                {woTags.map((code, i) => (
                  <span
                    key={code + '-' + i}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '0.73rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      background: 'rgba(2, 132, 199, 0.1)',
                      color: 'var(--brand-primary)',
                      border: '1px solid rgba(2, 132, 199, 0.2)',
                    }}
                  >
                    {code}
                    <span
                      onClick={() => removeWoTag(code)}
                      style={{ fontSize: '0.8rem', lineHeight: 1, opacity: 0.6, cursor: 'pointer' }}
                    >
                      ×
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Row 2: Secondary Filters (FT Auto-suggest, Trạng Thái, Đầu Việc, Quá Hạn) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)'
          }}>
            {/* Filter 1: FT / Người thực hiện with Auto-suggest */}
            <div ref={ftSuggestRef} style={{ position: 'relative', zIndex: 20 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                👤 Nhân viên thực hiện (FT):
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="select-filter"
                  placeholder="Gõ mã FT (vd: duandt, hoainm...)"
                  value={ftInput}
                  onChange={(e) => {
                    setFtInput(e.target.value);
                    setShowFtSuggestions(true);
                  }}
                  onFocus={() => setShowFtSuggestions(true)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    fontFamily: 'var(--font-mono)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                />
                {ftInput && (
                  <button
                    type="button"
                    onClick={() => setFtInput('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Auto-suggest Dropdown */}
              {showFtSuggestions && matchingFtList.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    marginTop: '4px',
                    padding: '6px'
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 8px', fontWeight: 700 }}>
                    GỢI Ý TỪ DANH SÁCH FT ({matchingFtList.length}):
                  </div>
                  {matchingFtList.map((ft) => (
                    <div
                      key={ft}
                      onClick={() => {
                        setFtInput(ft);
                        setShowFtSuggestions(false);
                      }}
                      style={{
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        fontFamily: 'var(--font-mono)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: ftInput.toLowerCase() === ft.toLowerCase() ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                        color: ftInput.toLowerCase() === ft.toLowerCase() ? 'var(--brand-primary)' : 'var(--text-primary)'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = ftInput.toLowerCase() === ft.toLowerCase() ? 'rgba(2, 132, 199, 0.15)' : 'transparent';
                      }}
                    >
                      <span>👤 {ft}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>chọn</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filter 2: Trạng thái */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                📌 Trạng thái WO:
              </label>
              <select
                className="select-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="Đang thực hiện">Đang thực hiện</option>
                <option value="Đã giao FT">Đã giao FT</option>
                <option value="Chờ CD tiếp nhận">Chờ CD tiếp nhận</option>
                <option value="FT hoàn thành">FT hoàn thành</option>
                <option value="Đóng">Đóng (Hoàn thành)</option>
                <option value="FT từ chối">FT từ chối</option>
                <option value="CD từ chối">CD từ chối</option>
              </select>
            </div>

            {/* Filter 3: Đầu việc / Loại công việc */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                📋 Đầu việc (Loại công việc):
              </label>
              <select
                className="select-filter"
                value={selectedTaskType}
                onChange={(e) => setSelectedTaskType(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="">Tất cả loại đầu việc</option>
                {(categories || []).map(c => (
                  <option key={c.id} value={c.loai_cong_viec}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 4: Quá hạn tiến độ */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                ⏰ Tiến độ / Quá hạn:
              </label>
              <select
                className="select-filter"
                value={isOverdue}
                onChange={(e) => setIsOverdue(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="">Tất cả tiến độ</option>
                <option value="true">Chỉ công việc QUÁ HẠN</option>
                <option value="false">Trong hạn / Đã hoàn thành</option>
              </select>
            </div>
          </div>

          {/* Quick FT suggestions tags row */}
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Gợi ý nhanh FT:</span>
            {FT_SUGGESTION_LIST.slice(0, 10).map((ft) => (
              <button
                key={ft}
                type="button"
                onClick={() => setFtInput(ft)}
                style={{
                  background: ftInput.toLowerCase() === ft.toLowerCase() ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                  color: ftInput.toLowerCase() === ft.toLowerCase() ? '#ffffff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer'
                }}
              >
                {ft}
              </button>
            ))}
            {FT_SUGGESTION_LIST.length > 10 && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>+{FT_SUGGESTION_LIST.length - 10} FT khác</span>
            )}

            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-outline"
              style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '0.75rem', gap: '5px' }}
            >
              <RotateCcw size={12} /> Đặt Lại Bộ Lọc
            </button>
          </div>
        </form>
      </div>

      {/* 3. Results Header & Count */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Kết Quả Tra Cứu ({totalTasks.toLocaleString()} công việc)
          </h3>
          {isFetching && (
            <span style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
              Đang làm mới...
            </span>
          )}
        </div>

        {/* Page size selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Hiển thị:</span>
          <select
            className="select-filter"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
          >
            <option value="15">15 dòng</option>
            <option value="25">25 dòng</option>
            <option value="50">50 dòng</option>
            <option value="100">100 dòng</option>
          </select>
        </div>
      </div>

      {/* 4. Results Table with full sheet fields & quick note */}
      <div className="table-card" style={{ padding: '16px', marginBottom: '20px', overflowX: 'auto' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Đang tìm kiếm công việc...
          </div>
        ) : tasksList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
            <Search size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Không tìm thấy công việc nào khớp với điều kiện tìm kiếm
            </p>
            <p style={{ fontSize: '0.82rem', margin: 0 }}>
              Hãy thử kiểm tra lại mã WO, mã trạm, hoặc bấm <strong>"Đặt Lại Bộ Lọc"</strong> để tìm kiếm rộng hơn.
            </p>
          </div>
        ) : (
          <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '38px', textAlign: 'center' }}>STT</th>
                <th style={{ width: '160px', textAlign: 'left' }}>Ghi Chú Điều Hành</th>
                <th style={{ width: '135px', textAlign: 'left' }}>Mã WO</th>
                <th style={{ width: '90px', textAlign: 'left' }}>Mã Trạm</th>
                <th style={{ width: '110px', textAlign: 'left' }}>Trạng Thái</th>
                <th style={{ minWidth: '160px', textAlign: 'left' }}>Loại Đầu Việc</th>
                <th style={{ minWidth: '220px', textAlign: 'left' }}>Nội Dung Chi Tiết (Sheet)</th>
                <th style={{ width: '130px', textAlign: 'left' }}>Người Thực Hiện (FT)</th>
                <th style={{ width: '120px', textAlign: 'left' }}>Nhóm Điều Phối</th>
                <th style={{ width: '120px', textAlign: 'left' }}>Thời Điểm Tạo</th>
                <th style={{ width: '100px', textAlign: 'left' }}>Thời Gian Còn</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {tasksList.map((t, idx) => {
                const isOverdue = t.thoi_gian_con_lai != null && t.thoi_gian_con_lai < 0 && !['Đóng', 'FT hoàn thành', 'FT Hoàn thành', 'FT Hoàn Thành'].includes(t.trang_thai);
                const isQuickNoteActive = quickNoteTaskId === t.ma_cong_viec;

                return (
                  <React.Fragment key={t.ma_cong_viec}>
                    <tr className="excel-row">
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        {(page - 1) * pageSize + idx + 1}
                      </td>

                      {/* Ghi chú điều hành */}
                      <td
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '160px',
                          color: t.latest_note ? 'var(--text-primary)' : 'var(--text-muted)',
                          fontStyle: t.latest_note ? 'normal' : 'italic',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                        title={t.latest_note ? `Ghi chú: ${t.latest_note}` : 'Bấm để ghi chú nhanh'}
                        onClick={() => {
                          setQuickNoteTaskId(isQuickNoteActive ? null : t.ma_cong_viec);
                          setQuickNoteText(t.latest_note || '');
                        }}
                      >
                        {t.latest_note ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: 'var(--brand-primary)', fontSize: '11px' }}>📝</span>
                            <span>{t.latest_note}</span>
                          </span>
                        ) : (
                          <span style={{ opacity: 0.45 }}>+ Thêm note...</span>
                        )}
                      </td>

                      {/* Mã WO */}
                      <td
                        style={{
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--brand-primary)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                        onClick={() => handleOpenTaskDetail(t.ma_cong_viec)}
                        title="Bấm để xem full thông tin từ sheet"
                      >
                        {t.ma_cong_viec}
                      </td>

                      {/* Mã trạm */}
                      <td style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {t.station_code ? (
                          <span
                            onClick={() => {
                              setSearchMode('station');
                              setSearchQuery(t.station_code);
                            }}
                            style={{ cursor: 'pointer', color: 'var(--text-primary)' }}
                            title="Bấm để lọc toàn bộ việc của trạm này"
                          >
                            {t.station_code}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.35 }}>--</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td>
                        {getStatusBadge(t.trang_thai)}
                      </td>

                      {/* Loại đầu việc */}
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }} title={t.loai_cong_viec || '--'}>
                        {t.loai_cong_viec || '--'}
                      </td>

                      {/* Nội dung công việc (Sheet) */}
                      <td
                        style={{
                          fontSize: '0.82rem',
                          maxWidth: '220px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleOpenTaskDetail(t.ma_cong_viec)}
                        title={t.noi_dung_cong_viec || '--'}
                      >
                        {t.noi_dung_cong_viec || '--'}
                      </td>

                      {/* Người thực hiện (FT) */}
                      <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {t.employee_assigned_name ? (
                          <span
                            onClick={() => setFtInput(t.employee_assigned_name)}
                            style={{ cursor: 'pointer' }}
                            title="Bấm để lọc FT này"
                          >
                            👤 {t.employee_assigned_name}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.35 }}>Chưa gán</span>
                        )}
                      </td>

                      {/* Nhóm điều phối */}
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {t.group_name || '--'}
                      </td>

                      {/* Thời điểm tạo */}
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(t.thoi_diem_tao)}
                      </td>

                      {/* Thời gian còn lại */}
                      <td style={{
                        fontSize: '0.82rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: isOverdue ? 800 : 500,
                        color: isOverdue ? 'var(--danger-dark)' : 'var(--text-secondary)'
                      }}>
                        {t.thoi_gian_con_lai != null ? `${t.thoi_gian_con_lai}h` : '--'}
                      </td>

                      {/* Thao tác */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '5px' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleOpenTaskDetail(t.ma_cong_viec)}
                            title="Xem full thông tin chi tiết từ Sheet"
                            style={{ padding: '3px 8px', fontSize: '0.75rem', gap: '4px', fontWeight: 600 }}
                          >
                            <Eye size={13} /> Full Sheet
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => {
                              setQuickNoteTaskId(isQuickNoteActive ? null : t.ma_cong_viec);
                              setQuickNoteText(t.latest_note || '');
                            }}
                            title="Ghi chú nhanh cho WO này"
                            style={{ padding: '3px 6px', fontSize: '0.75rem' }}
                          >
                            <MessageSquare size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline Quick Note Editor Row */}
                    {isQuickNoteActive && (
                      <tr>
                        <td colSpan={12} style={{ background: 'var(--bg-tertiary)', padding: '12px 20px', borderBottom: '2px solid var(--brand-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              📝 Ghi chú cho WO [{t.ma_cong_viec}]:
                            </span>
                            <input
                              type="text"
                              className="select-filter"
                              placeholder="Nhập nội dung ghi chú điều hành (VD: Đã hẹn FT xử lý chiều nay...)"
                              value={quickNoteText}
                              onChange={(e) => setQuickNoteText(e.target.value)}
                              style={{ flex: 1, minWidth: '260px', padding: '6px 12px', fontSize: '0.84rem' }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (quickNoteText.trim()) {
                                    quickNoteMutation.mutate({
                                      ma_cong_viec: t.ma_cong_viec,
                                      content: quickNoteText.trim(),
                                      author: quickNoteAuthor
                                    });
                                  }
                                }
                              }}
                            />
                            <select
                              className="select-filter"
                              value={quickNoteAuthor}
                              onChange={(e) => setQuickNoteAuthor(e.target.value)}
                              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                            >
                              <option value="Điều hành">Điều hành</option>
                              <option value="Cơ điện">Cơ điện</option>
                              <option value="FT">FT</option>
                              <option value="Admin">Admin</option>
                            </select>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={quickNoteMutation.isPending || !quickNoteText.trim()}
                              onClick={() => {
                                quickNoteMutation.mutate({
                                  ma_cong_viec: t.ma_cong_viec,
                                  content: quickNoteText.trim(),
                                  author: quickNoteAuthor
                                });
                              }}
                              style={{ padding: '6px 16px', fontSize: '0.82rem', gap: '6px' }}
                            >
                              <Send size={13} /> {quickNoteMutation.isPending ? 'Đang lưu...' : 'Lưu Note'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => setQuickNoteTaskId(null)}
                              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                            >
                              Đóng
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '16px',
            marginTop: '12px',
            borderTop: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Trang <strong>{page}</strong> / <strong>{totalPages}</strong> (Tổng số <strong>{totalTasks.toLocaleString()}</strong> kết quả)
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                Đầu
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={page <= 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '4px 10px', fontSize: '0.78rem', gap: '4px' }}
              >
                <ChevronLeft size={13} /> Trước
              </button>

              <span style={{ fontSize: '0.82rem', padding: '0 8px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {page}
              </span>

              <button
                type="button"
                className="btn btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '4px 10px', fontSize: '0.78rem', gap: '4px' }}
              >
                Sau <ChevronRight size={13} />
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                Cuối
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Full Detail Sheet Modal with Notes & History */}
      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
          onNoteAdded={async (ma_cong_viec) => {
            try {
              const updated = await tasksApi.getTaskDetail(ma_cong_viec);
              setSelectedDetailTask(updated);
              queryClient.invalidateQueries({ queryKey: ['tasks-search'] });
              queryClient.invalidateQueries({ queryKey: ['stats-maintenance-special'] });
            } catch (e) {
              console.error(e);
            }
          }}
        />
      )}
    </div>
  );
}
