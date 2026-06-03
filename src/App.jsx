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
import HistoryPage from './pages/HistoryPage';
import CreditsPage from './pages/CreditsPage';
import ReviewsPage from './pages/ReviewsPage';
import StatsPage from './pages/StatsPage';
import { usePortfolioStore } from './store/portfolioStore';
import { useAuthStore } from './store/authStore';

function ToastNotification() {
  const lastMessage = usePortfolioStore((state) => state.lastMessage);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastMessage || lastMessage.includes('Start by buying')) return;

    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4500);

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
      </header>

      <div className="nav-and-stats-row">
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

          {user ? (
            <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
              Profile
            </NavLink>
          ) : (
            <NavLink to="/reviews" className={({ isActive }) => (isActive ? 'active' : '')}>
              Reviews
            </NavLink>
          )}
        </nav>

        <div className="topbar-stats" style={{ display: 'flex', alignItems: 'stretch', gap: '16px' }}>
          <div>
            <span>Balance</span>
            <strong>${balance.toFixed(2)}</strong>
          </div>
          <div>
            <span>Holdings</span>
            <strong>{holdingsCount}</strong>
          </div>

          <div className="topbar-stats-user-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '120px', padding: '0 16px', margin: 0 }}>
            {user ? (
              <button
                type="button"
                className="ghost-button"
                onClick={logout}
                style={{ margin: 0, padding: '10px 24px', fontSize: '1rem', fontWeight: 'bold' }}
              >
                Sign out
              </button>
            ) : (
              <NavLink
                to="/login"
                className="primary-button"
                style={{ margin: 0, padding: '10px 24px', fontSize: '1rem', fontWeight: 'bold', textDecoration: 'none' }}
              >
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </div>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/crypto" replace />} />
          <Route path="/crypto" element={<CryptoPage />} />
          <Route path="/stocks" element={<StocksPage />} />
          <Route path="/currency" element={<CurrencyPage />} />
          <Route path="/asset/:type/:id" element={<AssetDetailPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/credits" element={<CreditsPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/crypto" replace />} />
        </Routes>
      </main>

    </div>
  );
}

export default App;