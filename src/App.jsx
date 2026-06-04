import { useEffect } from 'react';
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
import StatsPage from './pages/StatsPage';
import ReviewsPage from './pages/ReviewsPage';
import { usePortfolioStore } from './store/portfolioStore';
import { useAuthStore } from './store/authStore';

function App() {
  const balance = usePortfolioStore((state) => state.balance);
  const holdingsCount = usePortfolioStore((state) => state.holdings.length);
  const fetchFromServer = usePortfolioStore((state) => state.fetchFromServer);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const whoami = useAuthStore((s) => s.whoami);

  useEffect(() => {
    const initializeSession = async () => {
      await whoami();
      await fetchFromServer();
    };
    initializeSession();
  }, [whoami, fetchFromServer]);

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

          {user ? (
            <button
              type="button"
              onClick={logout}
              style={{
                margin: 0,
                padding: '0 24px',
                fontSize: '1.1rem',
                fontWeight: '700',
                fontFamily: 'inherit',
                color: 'var(--text)',
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '130px',
                borderRadius: '18px',
                cursor: 'pointer',
                boxSizing: 'border-box',
                transition: 'background 0.2s ease, border-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                e.currentTarget.style.color = 'var(--danger)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text)';
              }}
            >
              Sign out
            </button>
          ) : (
            <NavLink
              to="/login"
              style={{
                margin: 0,
                padding: '0 24px',
                fontSize: '1rem',
                fontWeight: '700',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '130px',
                borderRadius: '18px',
                boxSizing: 'border-box'
              }}
              className="primary-button"
            >
              Sign in
            </NavLink>
          )}
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
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="*" element={<Navigate to="/crypto" replace />} />
        </Routes>
      </main>

    </div>
  );
}

export default App;