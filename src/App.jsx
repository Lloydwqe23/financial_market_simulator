import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import CryptoPage from './pages/CryptoPage';
import StocksPage from './pages/StocksPage';
import CurrencyPage from './pages/CurrencyPage';
import AssetDetailPage from './pages/AssetDetailPage';
import PortfolioPage from './pages/PortfolioPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import { usePortfolioStore } from './store/portfolioStore';
import { useAuthStore } from './store/authStore';



function ToastNotification() {
  const lastMessage = usePortfolioStore((state) => state.lastMessage);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Prevent showing the initial welcome state string on mount
    if (!lastMessage || lastMessage.includes('Start by buying')) return;

    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4500); // Auto-dismiss after 4.5s

    return () => clearTimeout(timer);
  }, [lastMessage]);

  if (!visible) return null;

  return (
    <div className="helper-box" style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 1000,
      margin: 0,
      boxShadow: 'var(--shadow)',
      animation: 'authEnter 0.3s ease both',
      background: lastMessage.includes('lost') ? 'rgba(255, 122, 122, 0.15)' : 'rgba(66, 211, 146, 0.15)',
      borderColor: lastMessage.includes('lost') ? 'var(--danger)' : 'var(--accent)'
    }}>
      <strong style={{ display: 'block', marginBottom: '4px' }}>🔔 Market Alert</strong>
      <span>{lastMessage}</span>
    </div>
  );
}


function App() {
  const balance = usePortfolioStore((state) => state.balance);
  const holdingsCount = usePortfolioStore((state) => state.holdings.length);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const whoami = useAuthStore((s) => s.whoami);
  const userInitial = user?.email?.[0]?.toUpperCase() ?? 'U';

  useEffect(() => {
    whoami();
  }, [whoami]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Market Simulator</h1>
        </div>
        <div className="topbar-stats">
          <div>
            <span>Balance</span>
            <strong>${balance.toFixed(2)}</strong>
          </div>
          <div>
            <span>Holdings</span>
            <strong>{holdingsCount}</strong>
          </div>
          <div className="topbar-user">
            {user ? (
              <div className="user-controls">
                <NavLink to="/profile" className="user-link">
                  <div className="user-avatar">{userInitial}</div>
                  <div className="user-text">
                    <div className="user-label">Signed in</div>
                    <div className="user-name">{user.email}</div>
                  </div>
                </NavLink>
                <button type="button" className="ghost-button" onClick={logout}>
                  Sign out
                </button>
              </div>
            ) : (
              <NavLink to="/login" className="auth-link">
                <svg className="auth-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5Zm0 2c-4.42 0-8 2.01-8 4.5V21h16v-2.5c0-2.49-3.58-4.5-8-4.5Z"
                  />
                </svg>
                <div className="auth-link-text">Sign in</div>
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <nav className="nav">
        <NavLink to="/crypto" className={({ isActive }) => (isActive ? 'active' : '')}>
          Crypto
        </NavLink>
        <NavLink to="/stocks" className={({ isActive }) => (isActive ? 'active' : '')}>
          Stocks
        </NavLink>
        <NavLink to="/currency" className={({ isActive }) => (isActive ? 'active' : '')}>
          Currency
        </NavLink>
        <NavLink to="/portfolio" className={({ isActive }) => (isActive ? 'active' : '')}>
          Portfolio
        </NavLink>
        {user && (
          <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
            Profile
          </NavLink>
        )}
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/crypto" replace />} />
          <Route path="/crypto" element={<CryptoPage />} />
          <Route path="/stocks" element={<StocksPage />} />
          <Route path="/currency" element={<CurrencyPage />} />
          <Route path="/asset/:type/:id" element={<AssetDetailPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/crypto" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;