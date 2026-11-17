import React, { useState, useEffect, useMemo } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Link2,
  Award,
  Globe,
  FileText,
  Bookmark,
  ChevronRight,
  ShieldCheck,
  X,
  Sparkles,
  Search,
  User,
  LayoutList,
  LayoutGrid,
  Info,
  Eye,
  EyeOff
} from 'lucide-react';
import quickLinksApi from '../api/quickLinksApi';

// Icon mapping helper
const getLinkIcon = (iconName, size = 18) => {
  switch (iconName) {
    case 'award':
      return <Award size={size} />;
    case 'globe':
      return <Globe size={size} />;
    case 'file-text':
      return <FileText size={size} />;
    case 'bookmark':
      return <Bookmark size={size} />;
    default:
      return <Link2 size={size} />;
  }
};

export default function KhacPage({ onNavigate }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

  // Admin secret state
  const [isAdmin, setIsAdmin] = useState(() => {
    return sessionStorage.getItem('vcc_khac_admin') === 'true';
  });
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [secretClickCount, setSecretClickCount] = useState(0);

  // Modal create/edit link
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    slug: '',
    description: '',
    created_by: '',
    icon: 'link',
    color: '#2563eb',
    sort_order: 0,
    is_active: true
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal confirm delete
  const [deletingLink, setDeletingLink] = useState(null);

  const fetchLinks = async () => {
    try {
      setLoading(true);
      const data = await quickLinksApi.getLinks(isAdmin);
      setLinks(data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách liên kết:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, [isAdmin]);

  // Handle secret click trigger (click 4 times on title or dot)
  const handleSecretTrigger = () => {
    if (isAdmin) {
      if (window.confirm('Bạn muốn khóa và thoát chế độ quản trị?')) {
        setIsAdmin(false);
        sessionStorage.removeItem('vcc_khac_admin');
      }
      return;
    }
    const newCount = secretClickCount + 1;
    setSecretClickCount(newCount);
    if (newCount >= 4) {
      setSecretClickCount(0);
      setShowPinModal(true);
      setPinInput('');
      setPinError('');
    }
  };

  const handleVerifyPin = (e) => {
    e.preventDefault();
    if (pinInput === '6789' || pinInput === '1234') {
      setIsAdmin(true);
      sessionStorage.setItem('vcc_khac_admin', 'true');
      setShowPinModal(false);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Mã PIN không đúng (Mặc định: 6789)');
    }
  };

  // Open link
  const handleLinkClick = (link, e) => {
    if (e.target.closest('.no-nav')) return;

    quickLinksApi.recordClick(link.id);

    const url = (link.url || '').trim();
    if (url.startsWith('/')) {
      const tabName = url.replace(/^\//, '').toLowerCase();
      if (typeof onNavigate === 'function') {
        onNavigate(tabName);
      } else {
        window.location.href = url;
      }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Copy short link or direct link
  const handleCopyLink = (link, e) => {
    e.stopPropagation();
    let textToCopy = '';
    const origin = window.location.origin;
    if (link.slug) {
      textToCopy = `${origin}/s/${link.slug}`;
    } else if (link.url.startsWith('/')) {
      textToCopy = `${origin}${link.url}`;
    } else {
      textToCopy = link.url;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Open edit / create modal
  const handleOpenCreate = () => {
    setEditingLink(null);
    setFormData({
      title: '',
      url: '',
      slug: '',
      description: '',
      created_by: localStorage.getItem('vcc_user_name') || '',
      icon: 'link',
      color: '#2563eb',
      sort_order: (links.length + 1) * 10,
      is_active: true
    });
    setFormError('');
    setShowEditModal(true);
  };

  const handleOpenEdit = (link, e) => {
    e.stopPropagation();
    setEditingLink(link);
    setFormData({
      title: link.title || '',
      url: link.url || '',
      slug: link.slug || '',
      description: link.description || '',
      created_by: link.created_by || '',
      icon: link.icon || 'link',
      color: link.color || '#2563eb',
      sort_order: link.sort_order || 0,
      is_active: link.is_active !== false
    });
    setFormError('');
    setShowEditModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingLink) return;
    try {
      await quickLinksApi.deleteLink(deletingLink.id);
      setDeletingLink(null);
      fetchLinks();
    } catch (err) {
      alert(err.response?.data?.detail || 'Lỗi khi xóa liên kết!');
    }
  };

  const handleToggleActive = async (link, e) => {
    e.stopPropagation();
    try {
      const nextStatus = !link.is_active;
      await quickLinksApi.toggleActive(link.id, nextStatus);
      setLinks((prev) =>
        prev.map((item) => (item.id === link.id ? { ...item, is_active: nextStatus } : item))
      );
    } catch (err) {
      alert(err.response?.data?.detail || 'Lỗi khi cập nhật trạng thái ẩn/hiện!');
    }
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Vui lòng nhập tiêu đề liên kết!');
      return;
    }
    if (!formData.url.trim()) {
      setFormError('Vui lòng nhập đường link (URL)!');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError('');
      if (editingLink) {
        await quickLinksApi.updateLink(editingLink.id, formData);
      } else {
        await quickLinksApi.createLink(formData);
      }
      setShowEditModal(false);
      fetchLinks();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Lỗi khi lưu liên kết!');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter links by search
  const filteredLinks = useMemo(() => {
    if (!searchTerm.trim()) return links;
    const term = searchTerm.toLowerCase().trim();
    return links.filter(
      (l) =>
        (l.title && l.title.toLowerCase().includes(term)) ||
        (l.description && l.description.toLowerCase().includes(term)) ||
        (l.created_by && l.created_by.toLowerCase().includes(term)) ||
        (l.slug && l.slug.toLowerCase().includes(term)) ||
        (l.url && l.url.toLowerCase().includes(term))
    );
  }, [links, searchTerm]);

  return (
    <div className="compact-khac-wrapper">
      {/* Compact Top Header Bar */}
      <div className="compact-header-bar">
        <div className="compact-header-left">
          {/* Secret click trigger on Title */}
          <div
            className="compact-title-group"
            onClick={handleSecretTrigger}
            title={isAdmin ? "Đang mở quản trị (Nhấp để khóa)" : "Tiện ích & Liên kết"}
          >
            <div className="compact-title-badge">
              <Sparkles size={14} />
            </div>
            <h2 className="compact-main-title">
              Liên Kết Khác
              {/* Invisible / subtle dot trigger */}
              <span
                className={`secret-dot ${isAdmin ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSecretTrigger();
                }}
              />
            </h2>
            <span className="compact-count-pill">{links.length} liên kết</span>
          </div>
        </div>

        {/* Header Right: Search & Controls */}
        <div className="compact-header-right">
          <div className="compact-search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm kiếm liên kết, người tạo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="compact-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchTerm('')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="view-toggle-group">
            <button
              type="button"
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Dạng danh sách gọn"
            >
              <LayoutList size={15} />
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Dạng lưới"
            >
              <LayoutGrid size={15} />
            </button>
          </div>

          {/* Admin Toggle button (only appears if admin unlocked) */}
          {isAdmin && (
            <div className="admin-quick-controls">
              <button
                type="button"
                className="btn-add-link"
                onClick={handleOpenCreate}
                title="Tạo liên kết mới"
              >
                <Plus size={15} />
                <span className="btn-text">Thêm liên kết</span>
              </button>
              <button
                type="button"
                className="btn-exit-admin"
                onClick={() => {
                  setIsAdmin(false);
                  sessionStorage.removeItem('vcc_khac_admin');
                }}
                title="Khóa chế độ quản trị"
              >
                <Lock size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Admin Notice Bar */}
      {isAdmin && (
        <div className="admin-banner-notice">
          <div className="banner-left">
            <ShieldCheck size={16} className="text-success" />
            <span>Chế độ Quản trị đang kích hoạt (bạn có thể Thêm, Sửa, Xóa các liên kết)</span>
          </div>
          <button
            type="button"
            className="btn-link text-xs"
            onClick={handleOpenCreate}
          >
            + Thêm mới ngay
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="compact-loading">
          <div className="spinner-border" />
          <span>Đang tải liên kết...</span>
        </div>
      ) : filteredLinks.length === 0 ? (
        <div className="compact-empty">
          <Info size={32} />
          <p>{searchTerm ? 'Không tìm thấy liên kết phù hợp' : 'Chưa có liên kết nào'}</p>
        </div>
      ) : viewMode === 'list' ? (
        /* Compact List View (Tiết kiệm diện tích tối đa) */
        <div className="compact-list-container">
          {filteredLinks.map((link) => {
            const isInternal = (link.url || '').startsWith('/');
            return (
              <div
                key={link.id}
                className={`compact-list-row ${!link.is_active ? 'row-inactive' : ''}`}
                onClick={(e) => handleLinkClick(link, e)}
              >
                {/* Accent indicator */}
                <div
                  className="row-accent"
                  style={{ backgroundColor: link.color || '#2563eb' }}
                />

                {/* Left: Icon */}
                <div
                  className="row-icon-box"
                  style={{
                    backgroundColor: `${link.color || '#2563eb'}18`,
                    color: link.color || '#2563eb'
                  }}
                >
                  {getLinkIcon(link.icon, 18)}
                </div>

                {/* Middle: Title & Meta */}
                <div className="row-content-box">
                  <div className="row-title-line">
                    <span className="row-title">{link.title}</span>
                    {!link.is_active && (
                      <span className="pill-badge pill-hidden" title="Liên kết này đang ẩn với người dùng">
                        <EyeOff size={11} style={{ marginRight: 3 }} />
                        Đang ẩn
                      </span>
                    )}
                  </div>

                  <div className="row-sub-line">
                    {link.description && (
                      <span className="row-desc" title={link.description}>
                        {link.description}
                      </span>
                    )}

                    {link.created_by && (
                      <span className="row-author" title={`Người tạo: ${link.created_by}`}>
                        <User size={11} />
                        <span>{link.created_by}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Short Link / Copy & Admin Actions */}
                <div className="row-actions-box no-nav">
                  {link.slug ? (
                    <button
                      type="button"
                      className="btn-compact-copy no-nav"
                      onClick={(e) => handleCopyLink(link, e)}
                      title={`Sao chép link rút gọn: /s/${link.slug}`}
                    >
                      {copiedId === link.id ? (
                        <Check size={13} className="text-success" />
                      ) : (
                        <Copy size={13} />
                      )}
                      <span className="slug-tag">/s/{link.slug}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-compact-copy no-nav"
                      onClick={(e) => handleCopyLink(link, e)}
                      title="Sao chép link gốc"
                    >
                      {copiedId === link.id ? (
                        <Check size={13} className="text-success" />
                      ) : (
                        <Copy size={13} />
                      )}
                      <span>Chép link</span>
                    </button>
                  )}

                  {/* Admin Edit/Delete */}
                  {isAdmin && (
                    <div className="row-admin-btns no-nav">
                      <button
                        type="button"
                        className={`btn-row-action ${!link.is_active ? 'btn-action-hidden' : ''}`}
                        onClick={(e) => handleToggleActive(link, e)}
                        title={link.is_active ? 'Ẩn liên kết này (người dùng sẽ không thấy)' : 'Hiện lại liên kết này'}
                      >
                        {link.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        type="button"
                        className="btn-row-action"
                        onClick={(e) => handleOpenEdit(link, e)}
                        title="Chỉnh sửa liên kết"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-row-action text-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingLink(link);
                        }}
                        title="Xóa liên kết"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}

                  <div className="row-arrow">
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Compact Grid View */
        <div className="compact-grid-container">
          {filteredLinks.map((link) => {
            const isInternal = (link.url || '').startsWith('/');
            return (
              <div
                key={link.id}
                className={`compact-grid-card ${!link.is_active ? 'row-inactive' : ''}`}
                onClick={(e) => handleLinkClick(link, e)}
                style={{ borderTopColor: link.color || '#2563eb' }}
              >
                <div className="card-top">
                  <div
                    className="card-icon"
                    style={{
                      backgroundColor: `${link.color || '#2563eb'}18`,
                      color: link.color || '#2563eb'
                    }}
                  >
                    {getLinkIcon(link.icon, 18)}
                  </div>
                  <div className="card-badges">
                    {!link.is_active && (
                      <span className="pill-badge pill-hidden" title="Đang ẩn với người dùng">
                        <EyeOff size={10} style={{ marginRight: 2 }} />
                        Ẩn
                      </span>
                    )}
                    {link.created_by && (
                      <span className="pill-author">
                        <User size={10} /> {link.created_by}
                      </span>
                    )}
                  </div>
                </div>

                <div className="card-body">
                  <h4 className="card-title">{link.title}</h4>
                  {link.description && <p className="card-desc">{link.description}</p>}
                </div>

                <div className="card-bottom no-nav">
                  <button
                    type="button"
                    className="btn-compact-copy no-nav"
                    onClick={(e) => handleCopyLink(link, e)}
                  >
                    {copiedId === link.id ? (
                      <Check size={12} className="text-success" />
                    ) : (
                      <Copy size={12} />
                    )}
                    <span>{link.slug ? `/s/${link.slug}` : 'Chép link'}</span>
                  </button>

                  {isAdmin && (
                    <div className="row-admin-btns no-nav">
                      <button
                        type="button"
                        className={`btn-row-action ${!link.is_active ? 'btn-action-hidden' : ''}`}
                        onClick={(e) => handleToggleActive(link, e)}
                        title={link.is_active ? 'Ẩn liên kết' : 'Hiện liên kết'}
                      >
                        {link.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        type="button"
                        className="btn-row-action"
                        onClick={(e) => handleOpenEdit(link, e)}
                        title="Sửa"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn-row-action text-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingLink(link);
                        }}
                        title="Xóa"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= MODAL NHẬP MÃ PIN (EASTER EGG) ================= */}
      {showPinModal && (
        <div className="custom-modal-backdrop" onClick={() => setShowPinModal(false)}>
          <div className="custom-modal-window pin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-bar">
              <div className="title-left">
                <Lock size={18} className="text-primary" />
                <span>Xác thực Quản trị</span>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setShowPinModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVerifyPin}>
              <div className="modal-body-content">
                <p className="pin-hint-text">
                  Nhập mã PIN để mở quyền thêm, sửa và sắp xếp các liên kết.
                </p>
                <div className="pin-input-wrap">
                  <input
                    type="password"
                    autoFocus
                    maxLength={8}
                    className="pin-input-field"
                    placeholder="••••"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                  />
                </div>
                {pinError && <p className="modal-error-text">{pinError}</p>}
              </div>

              <div className="modal-button-bar">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowPinModal(false)}
                >
                  Hủy
                </button>
                <button type="submit" className="btn-confirm">
                  Mở khóa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL THÊM / SỬA LIÊN KẾT ================= */}
      {showEditModal && (
        <div className="custom-modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="custom-modal-window edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-bar">
              <div className="title-left">
                {editingLink ? <Edit2 size={18} /> : <Plus size={18} />}
                <span>{editingLink ? 'Chỉnh sửa liên kết' : 'Thêm liên kết mới'}</span>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setShowEditModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm}>
              <div className="modal-body-content form-scrollable">
                {formError && (
                  <div className="modal-error-box">
                    {formError}
                  </div>
                )}

                <div className="form-item">
                  <label className="field-label required">Tiêu đề liên kết:</label>
                  <input
                    type="text"
                    required
                    className="field-input"
                    placeholder="Ví dụ: BẢNG ĐÁNH GIÁ KPI FT"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="form-item">
                  <label className="field-label required">Đường dẫn đích (URL):</label>
                  <input
                    type="text"
                    required
                    className="field-input"
                    placeholder="/kpi hoặc https://..."
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  />
                  <span className="field-subnote">
                    Dùng <code>/kpi</code>, <code>/codinh</code> cho trang nội bộ, hoặc URL web đầy đủ.
                  </span>
                </div>

                <div className="form-item-grid-2">
                  <div className="form-item">
                    <label className="field-label">Custom Link (Slug rút gọn):</label>
                    <div className="slug-input-wrapper">
                      <span className="slug-prefix">/s/</span>
                      <input
                        type="text"
                        className="field-input slug-input"
                        placeholder="kpi-ft, tailieu..."
                        value={formData.slug}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            slug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '')
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-item">
                    <label className="field-label">Người tạo (Tác giả):</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="Tên nhân viên / Phòng ban"
                      value={formData.created_by}
                      onChange={(e) => setFormData({ ...formData, created_by: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-item">
                  <label className="field-label">Ghi chú nhỏ ở dưới tiêu đề (Mô tả):</label>
                  <textarea
                    rows={2}
                    className="field-input textarea"
                    placeholder="Mô tả tóm tắt nội dung để người xem nắm nhanh..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="form-item-grid-3">
                  <div className="form-item">
                    <label className="field-label">Icon hiển thị:</label>
                    <select
                      className="field-input"
                      value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    >
                      <option value="link">Link mặc định</option>
                      <option value="award">Huy hiệu KPI</option>
                      <option value="globe">Trang Web / Ngoài</option>
                      <option value="file-text">Tài liệu / File</option>
                      <option value="bookmark">Dấu trang</option>
                    </select>
                  </div>

                  <div className="form-item">
                    <label className="field-label">Màu chủ đạo:</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        className="color-input"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      />
                      <input
                        type="text"
                        className="field-input color-text"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-item">
                    <label className="field-label">Thứ tự sắp xếp:</label>
                    <input
                      type="number"
                      className="field-input"
                      value={formData.sort_order}
                      onChange={(e) =>
                        setFormData({ ...formData, sort_order: parseInt(e.target.value, 10) || 0 })
                      }
                    />
                  </div>
                </div>

                <div className="form-item-checkbox">
                  <label className="checkbox-wrap" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.86rem', fontWeight: 600, color: formData.is_active ? 'var(--text-primary)' : '#dc2626' }}>
                      {formData.is_active
                        ? '✅ Đang hiển thị công khai (Mọi người đều nhìn thấy)'
                        : '🔒 Đang ẩn (Chỉ quản trị viên mới thấy để quản lý)'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="modal-button-bar">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowEditModal(false)}
                  disabled={isSubmitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Đang lưu...' : (editingLink ? 'Cập nhật' : 'Tạo liên kết')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL XÁC NHẬN XÓA ================= */}
      {deletingLink && (
        <div className="custom-modal-backdrop" onClick={() => setDeletingLink(null)}>
          <div className="custom-modal-window confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-bar danger-bar">
              <div className="title-left">
                <Trash2 size={18} className="text-danger" />
                <span>Xác nhận xóa liên kết</span>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setDeletingLink(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-content">
              <p>Bạn có chắc chắn muốn xóa liên kết sau?</p>
              <div className="delete-target-preview">
                <strong>{deletingLink.title}</strong>
                <code>{deletingLink.url}</code>
              </div>
              <p className="text-muted text-xs mt-2">Thao tác này sẽ xóa vĩnh viễn liên kết khỏi hệ thống.</p>
            </div>

            <div className="modal-button-bar">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setDeletingLink(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn-danger-confirm"
                onClick={handleConfirmDelete}
              >
                Xóa liên kết
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scoped CSS Styles */}
      <style>{`
        .compact-khac-wrapper {
          max-width: 1060px;
          margin: 0 auto;
          padding: 12px 14px 40px;
        }

        /* Top Header Bar */
        .compact-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 10px 16px;
          margin-bottom: 12px;
          box-shadow: var(--shadow-sm);
        }

        .compact-header-left {
          display: flex;
          align-items: center;
        }

        .compact-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }

        .compact-title-badge {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: var(--brand-light);
          color: var(--brand-primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .compact-main-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .secret-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: transparent;
          margin-left: 2px;
          transition: background 0.2s ease;
        }

        .secret-dot.active {
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .compact-count-pill {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-tertiary);
          padding: 2px 8px;
          border-radius: 999px;
          margin-left: 4px;
        }

        /* Header Right */
        .compact-header-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .compact-search-box {
          display: flex;
          align-items: center;
          position: relative;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 0 8px;
          width: 220px;
          height: 32px;
        }

        .compact-search-box .search-icon {
          color: var(--text-muted);
          margin-right: 6px;
          flex-shrink: 0;
        }

        .compact-search-input {
          border: none;
          background: transparent;
          font-size: 0.82rem;
          color: var(--text-primary);
          width: 100%;
          outline: none;
        }

        .clear-search-btn {
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
        }

        .view-toggle-group {
          display: flex;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 2px;
        }

        .view-btn {
          border: none;
          background: transparent;
          color: var(--text-muted);
          padding: 4px 6px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .view-btn.active {
          background: var(--bg-secondary);
          color: var(--brand-primary);
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
        }

        .admin-quick-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-add-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--brand-primary);
          color: #ffffff;
          border: none;
          font-size: 0.82rem;
          font-weight: 600;
          padding: 5px 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .btn-add-link:hover {
          background: var(--brand-primary-hover);
        }

        .btn-exit-admin {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          width: 28px;
          height: 28px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-exit-admin:hover {
          color: var(--danger);
          border-color: var(--danger);
        }

        /* Admin banner */
        .admin-banner-notice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: var(--radius-sm);
          padding: 6px 12px;
          font-size: 0.82rem;
          color: #047857;
          margin-bottom: 12px;
        }

        .banner-left {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 500;
        }

        .btn-link {
          background: transparent;
          border: none;
          color: #047857;
          font-weight: 700;
          cursor: pointer;
          text-decoration: underline;
        }

        /* Compact List View */
        .compact-list-container {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .compact-list-row {
          display: flex;
          align-items: center;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 8px 12px 8px 0;
          position: relative;
          cursor: pointer;
          transition: transform 0.1s ease, border-color 0.15s ease, box-shadow 0.15s ease;
          overflow: hidden;
        }

        .compact-list-row:hover {
          border-color: var(--brand-primary);
          box-shadow: var(--shadow-sm);
          background: var(--bg-primary);
        }

        .compact-list-row.row-inactive,
        .compact-grid-card.row-inactive {
          opacity: 0.65;
          border-style: dashed;
          background: var(--bg-tertiary);
        }

        .row-accent {
          width: 4px;
          align-self: stretch;
          margin-right: 10px;
          border-radius: 0 2px 2px 0;
          flex-shrink: 0;
        }

        .row-icon-box {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-right: 12px;
        }

        .row-content-box {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .row-title-line {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .row-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pill-badge.pill-hidden {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.28);
          font-size: 0.68rem;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
        }

        .btn-action-hidden {
          color: #dc2626 !important;
          background: rgba(239, 68, 68, 0.1) !important;
        }

        .row-sub-line {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .row-desc {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 420px;
        }

        .row-author {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: var(--text-secondary);
          font-size: 0.74rem;
          background: var(--bg-tertiary);
          padding: 1px 6px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .row-actions-box {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: 12px;
          flex-shrink: 0;
        }

        .btn-compact-copy {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--border-color);
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          font-size: 0.74rem;
          font-family: var(--font-mono, monospace);
          padding: 3px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-compact-copy:hover {
          color: var(--brand-primary);
          border-color: var(--brand-primary);
          background: var(--bg-secondary);
        }

        .slug-tag {
          font-weight: 600;
        }

        .row-admin-btns {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .btn-row-action {
          border: none;
          background: transparent;
          color: var(--text-muted);
          padding: 5px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-row-action:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .btn-row-action.text-danger:hover {
          color: var(--danger);
          background: rgba(239, 68, 68, 0.12);
        }

        .row-arrow {
          color: var(--text-muted);
          opacity: 0.5;
          margin-left: 4px;
        }

        /* Compact Grid View */
        .compact-grid-container {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }

        .compact-grid-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-top-width: 3px;
          border-radius: var(--radius-sm);
          padding: 12px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: var(--shadow-sm);
          transition: transform 0.1s ease, border-color 0.15s ease;
        }

        .compact-grid-card:hover {
          border-color: var(--brand-primary);
          transform: translateY(-1px);
        }

        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .card-icon {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-badges {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pill-author {
          font-size: 0.7rem;
          color: var(--text-secondary);
          background: var(--bg-tertiary);
          padding: 1px 5px;
          border-radius: 3px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }

        .card-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 4px 0;
          line-height: 1.35;
        }

        .card-desc {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid var(--border-color);
        }

        /* Loading & Empty */
        .compact-loading, .compact-empty {
          text-align: center;
          padding: 36px 16px;
          color: var(--text-muted);
        }

        .spinner-border {
          width: 24px;
          height: 24px;
          border: 2px solid var(--border-color);
          border-top-color: var(--brand-primary);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin: 0 auto 8px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ================= MODAL STYLES (STANDARDIZED & BUG-FREE) ================= */
        .custom-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.15s ease-out;
        }

        .custom-modal-window {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
          width: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: popIn 0.15s ease-out;
        }

        .custom-modal-window.pin-modal {
          max-width: 360px;
        }

        .custom-modal-window.confirm-modal {
          max-width: 420px;
        }

        .custom-modal-window.edit-modal {
          max-width: 580px;
          max-height: 88vh;
        }

        .modal-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .modal-title-bar.danger-bar {
          background: rgba(239, 68, 68, 0.05);
        }

        .title-left {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .close-icon-btn {
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
        }

        .close-icon-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .modal-body-content {
          padding: 18px;
          color: var(--text-primary);
        }

        .form-scrollable {
          overflow-y: auto;
          flex: 1;
        }

        .modal-button-bar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 12px 18px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        /* Form Inputs */
        .form-item {
          margin-bottom: 12px;
        }

        .field-label {
          display: block;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .field-label.required::after {
          content: ' *';
          color: var(--danger);
        }

        .field-input {
          width: 100%;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 7px 10px;
          font-size: 0.88rem;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s ease;
        }

        .field-input:focus {
          border-color: var(--brand-primary);
          background: var(--bg-secondary);
        }

        .field-input.textarea {
          resize: vertical;
          min-height: 52px;
        }

        .field-subnote {
          display: block;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 3px;
        }

        .field-subnote code {
          background: var(--bg-tertiary);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.75rem;
        }

        .form-item-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .form-item-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
        }

        .slug-input-wrapper {
          display: flex;
          align-items: center;
        }

        .slug-prefix {
          background: var(--border-color);
          padding: 7px 10px;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          border-radius: var(--radius-sm) 0 0 var(--radius-sm);
        }

        .slug-input {
          border-top-left-radius: 0;
          border-bottom-left-radius: 0;
        }

        .color-picker-box {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .color-input {
          width: 34px;
          height: 34px;
          padding: 1px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          cursor: pointer;
        }

        .color-text {
          flex: 1;
        }

        .form-item-checkbox {
          margin-top: 6px;
        }

        .checkbox-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .btn-cancel {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          padding: 7px 16px;
          font-size: 0.85rem;
          font-weight: 600;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }

        .btn-cancel:hover {
          background: var(--bg-hover);
        }

        .btn-confirm {
          background: var(--brand-primary);
          color: #ffffff;
          border: none;
          padding: 7px 20px;
          font-size: 0.85rem;
          font-weight: 600;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }

        .btn-confirm:hover {
          background: var(--brand-primary-hover);
        }

        .btn-danger-confirm {
          background: var(--danger);
          color: #ffffff;
          border: none;
          padding: 7px 18px;
          font-size: 0.85rem;
          font-weight: 600;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }

        .btn-danger-confirm:hover {
          background: var(--danger-dark);
        }

        .modal-error-box {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: var(--danger);
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          margin-bottom: 12px;
        }

        /* PIN Modal */
        .pin-hint-text {
          font-size: 0.84rem;
          color: var(--text-muted);
          text-align: center;
          margin-bottom: 14px;
        }

        .pin-input-wrap {
          display: flex;
          justify-content: center;
        }

        .pin-input-field {
          width: 180px;
          text-align: center;
          font-size: 1.5rem;
          letter-spacing: 6px;
          font-weight: 700;
          padding: 8px;
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          color: var(--text-primary);
          outline: none;
        }

        .pin-input-field:focus {
          border-color: var(--brand-primary);
        }

        .modal-error-text {
          color: var(--danger);
          font-size: 0.8rem;
          text-align: center;
          margin-top: 8px;
        }

        .delete-target-preview {
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          padding: 10px;
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .delete-target-preview strong {
          color: var(--text-primary);
        }

        .delete-target-preview code {
          font-size: 0.78rem;
          color: var(--text-muted);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        /* Mobile Adjustments */
        @media (max-width: 640px) {
          .compact-khac-wrapper {
            padding: 8px 8px 30px;
          }

          .compact-header-bar {
            padding: 10px 12px;
            gap: 10px;
          }

          .compact-search-box {
            width: 100%;
          }

          .compact-header-right {
            width: 100%;
            justify-content: space-between;
          }

          .row-sub-line {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }

          .row-desc {
            max-width: 100%;
          }

          .row-actions-box {
            margin-left: 6px;
          }

          .form-item-grid-2, .form-item-grid-3 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
