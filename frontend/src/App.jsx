import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Header from './components/Header';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30, // 30s cache
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

export default function App() {
  const getInitialTab = () => {
    try {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.includes('/admin') || hash.includes('admin')) return 'admin';
    } catch (e) {
      console.error(e);
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [theme, setTheme] = useState(() => localStorage.getItem('vcc_theme') || 'light');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'admin') {
      if (!window.location.pathname.includes('/admin')) {
        window.history.pushState({}, '', '/admin');
      }
    } else {
      if (window.location.pathname.includes('/admin') || window.location.hash.includes('admin')) {
        window.history.pushState({}, '', '/');
      }
    }
  };

  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.includes('/admin') || hash.includes('admin')) {
        setActiveTab('admin');
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
              {activeTab === 'admin' ? (
                <AdminPage onNavigateToDashboard={() => handleTabChange('dashboard')} />
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
