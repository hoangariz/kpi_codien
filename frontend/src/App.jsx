import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Header from './components/Header';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import SearchPage from './pages/SearchPage';
import KpiFtPage from './pages/KpiFtPage';
import CodinhPage from './pages/CodinhPage';
import AdminCodinhPage from './pages/AdminCodinhPage';
import ThuHoiThietBiPage from './pages/ThuHoiThietBiPage';
import DieuhanhCodinhPage from './pages/DieuhanhCodinhPage';
import KhacPage from './pages/KhacPage';
import quickLinksApi from './api/quickLinksApi';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000, // 60s cache
    },
  },
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', maxWidth: '640px', margin: '40px auto', background: 'var(--bg-secondary)', border: '1px solid var(--danger)', borderRadius: '12px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ color: 'var(--danger-dark)', marginBottom: '12px', fontSize: '1.2rem' }}>Đã xảy ra lỗi hiển thị giao diện</h2>
          <pre style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.85rem', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', textAlign: 'left', overflowX: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            className="btn btn-primary" 
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{ padding: '8px 24px' }}
          >
            Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SYSTEM_TABS = ['thuhoithietbi', 'dieuhanhcodinh', 'admincodinh', 'codinh', 'admin', 'search', 'khac', 'kpi'];

const getPotentialSlug = (pathname) => {
  try {
    if (!pathname || pathname === '/') return null;
    let clean = pathname.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
    if (!clean) return null;

    if (clean.startsWith('s/')) {
      return clean.replace(/^s\//, '').split('/')[0].split('?')[0].trim() || null;
    }

    const firstSegment = clean.split('/')[0].split('?')[0].trim();
    if (
      SYSTEM_TABS.includes(firstSegment) ||
      ['api', 'assets', 'favicon.ico'].includes(firstSegment) ||
      firstSegment.includes('.')
    ) {
      return null;
    }

    return firstSegment || null;
  } catch (e) {
    return null;
  }
};

export default function App() {
  const getInitialTab = () => {
    try {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.includes('/thuhoithietbi') || hash.includes('thuhoithietbi')) return 'thuhoithietbi';
      if (path.includes('/dieuhanhcodinh') || hash.includes('dieuhanhcodinh')) return 'dieuhanhcodinh';
      if (path.includes('/admincodinh') || hash.includes('admincodinh')) return 'admincodinh';
      if (path.includes('/codinh') || hash.includes('codinh')) return 'codinh';
      if (path.includes('/admin') || hash.includes('admin')) return 'admin';
      if (path.includes('/search') || hash.includes('search')) return 'search';
      if (path.includes('/khac') || hash.includes('khac')) return 'khac';
      if (path.includes('/kpi') || hash.includes('kpi')) return 'kpi';
    } catch (e) {
      console.error(e);
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [theme, setTheme] = useState(() => localStorage.getItem('vcc_theme') || 'light');
  const [redirectingSlug, setRedirectingSlug] = useState(() => {
    return getPotentialSlug(window.location.pathname);
  });

  const handleTabChange = (tab) => {
    if (tab === 'codinh') {
      window.dispatchEvent(new CustomEvent('reset-codinh-view'));
    }
    setActiveTab(tab);
    if (tab === 'thuhoithietbi') {
      if (!window.location.pathname.includes('/thuhoithietbi')) {
        window.history.pushState({}, '', '/thuhoithietbi');
      }
    } else if (tab === 'dieuhanhcodinh') {
      if (!window.location.pathname.includes('/dieuhanhcodinh')) {
        window.history.pushState({}, '', '/dieuhanhcodinh');
      }
    } else if (tab === 'admincodinh') {
      if (!window.location.pathname.includes('/admincodinh')) {
        window.history.pushState({}, '', '/admincodinh');
      }
    } else if (tab === 'codinh') {
      if (!window.location.pathname.includes('/codinh')) {
        window.history.pushState({}, '', '/codinh');
      }
    } else if (tab === 'admin') {
      if (!window.location.pathname.includes('/admin')) {
        window.history.pushState({}, '', '/admin');
      }
    } else if (tab === 'search') {
      if (!window.location.pathname.includes('/search')) {
        window.history.pushState({}, '', '/search');
      }
    } else if (tab === 'khac') {
      if (!window.location.pathname.includes('/khac')) {
        window.history.pushState({}, '', '/khac');
      }
    } else if (tab === 'kpi') {
      if (!window.location.pathname.includes('/kpi')) {
        window.history.pushState({}, '', '/kpi');
      }
    } else {
      if (window.location.pathname !== '/' || window.location.hash) {
        window.history.pushState({}, '', '/');
      }
    }
  };

  useEffect(() => {
    if (!redirectingSlug) return;
    let isMounted = true;
    quickLinksApi
      .resolveSlug(redirectingSlug)
      .then((res) => {
        if (!isMounted) return;
        if (res && res.url) {
          const target = (res.url || '').trim();
          if (target.startsWith('/')) {
            const tab = target.replace(/^\//, '').toLowerCase();
            handleTabChange(tab);
            setRedirectingSlug(null);
          } else {
            window.location.replace(target);
          }
        } else {
          alert(`Liên kết rút gọn /${redirectingSlug} không tồn tại hoặc đã bị ẩn.`);
          handleTabChange('khac');
          setRedirectingSlug(null);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Lỗi phân giải link rút gọn:', err);
        alert(`Không tìm thấy hoặc liên kết /${redirectingSlug} đang bị ẩn.`);
        handleTabChange('khac');
        setRedirectingSlug(null);
      });
    return () => {
      isMounted = false;
    };
  }, [redirectingSlug]);

  useEffect(() => {
    const handleUrlChange = () => {
      const potentialSlug = getPotentialSlug(window.location.pathname);
      if (potentialSlug) {
        setRedirectingSlug(potentialSlug);
        return;
      }

      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.includes('/thuhoithietbi') || hash.includes('thuhoithietbi')) {
        setActiveTab('thuhoithietbi');
      } else if (path.includes('/dieuhanhcodinh') || hash.includes('dieuhanhcodinh')) {
        setActiveTab('dieuhanhcodinh');
      } else if (path.includes('/admincodinh') || hash.includes('admincodinh')) {
        setActiveTab('admincodinh');
      } else if (path.includes('/codinh') || hash.includes('codinh')) {
        setActiveTab('codinh');
      } else if (path.includes('/admin') || hash.includes('admin')) {
        setActiveTab('admin');
      } else if (path.includes('/search') || hash.includes('search')) {
        setActiveTab('search');
      } else if (path.includes('/khac') || hash.includes('khac')) {
        setActiveTab('khac');
      } else if (path.includes('/kpi') || hash.includes('kpi')) {
        setActiveTab('kpi');
      } else {
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vcc_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  if (redirectingSlug) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'var(--bg-primary, #f8fafc)',
          color: 'var(--text-primary, #1e293b)',
          gap: '14px'
        }}
      >
        <div
          style={{
            width: '38px',
            height: '38px',
            border: '3px solid #cbd5e1',
            borderTopColor: '#2563eb',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}
        />
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          Đang chuyển hướng liên kết{' '}
          <code
            style={{
              color: '#2563eb',
              background: 'rgba(37, 99, 235, 0.08)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}
          >
            /{redirectingSlug}
          </code>
          ...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <div className="app-container">
          <Header
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            theme={theme}
            toggleTheme={toggleTheme}
            onRefresh={() => queryClient.invalidateQueries()}
          />

          <main className="main-content">
            <div className="content-body">
              {activeTab === 'thuhoithietbi' ? (
                <ThuHoiThietBiPage onNavigateToCodinh={() => handleTabChange('codinh')} />
              ) : activeTab === 'dieuhanhcodinh' ? (
                <DieuhanhCodinhPage onNavigateToCodinh={() => handleTabChange('codinh')} />
              ) : activeTab === 'admincodinh' ? (
                <AdminCodinhPage onNavigateToCodinh={() => handleTabChange('codinh')} />
              ) : activeTab === 'codinh' ? (
                <CodinhPage />
              ) : activeTab === 'admin' ? (
                <AdminPage onNavigateToDashboard={() => handleTabChange('dashboard')} />
              ) : activeTab === 'search' ? (
                <SearchPage onNavigateToDashboard={() => handleTabChange('dashboard')} />
              ) : activeTab === 'khac' ? (
                <KhacPage onNavigate={handleTabChange} />
              ) : activeTab === 'kpi' ? (
                <KpiFtPage />
              ) : (
                <DashboardPage />
              )}
            </div>
          </main>
        </div>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

