import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';

function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const balance = usePortfolioStore((state) => state.balance);
  const holdings = usePortfolioStore((state) => state.holdings);
  const transactions = usePortfolioStore((state) => state.transactions);

  const portfolioValue = useMemo(
    () => holdings.reduce((sum, item) => sum + item.quantity * item.currentPrice, 0),
    [holdings],
  );

  const totalWorth = balance + portfolioValue;

  if (!user) {
    return (
      <section className="page-grid">
        <div className="surface">
          <h2>Profile</h2>
          <p>Sign in to see your account details and trade history.</p>
          <Link to="/login" className="primary-button">
            Sign in
          </Link>
        </div>
        <div className="surface">
          <h3>Why create an account?</h3>
          <p>Your profile keeps trades, balance, and activity in one place.</p>
        </div>
      </section>
    );
  }

  const initial = user.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <section className="page-grid">
      <div className="surface profile-card">
        <div className="profile-header">
          <div className="profile-avatar">{initial}</div>
          <div>
            <h2>{user.email}</h2>
            <p className="profile-meta">Demo trader</p>
          </div>
        </div>

        <div className="profile-stats">
          <div className="profile-stat">
            <span className="profile-label">Cash balance</span>
            <strong>${balance.toFixed(2)}</strong>
          </div>
          <div className="profile-stat">
            <span className="profile-label">Portfolio value</span>
            <strong>${portfolioValue.toFixed(2)}</strong>
          </div>
          <div className="profile-stat">
            <span className="profile-label">Total worth</span>
            <strong>${totalWorth.toFixed(2)}</strong>
          </div>
          <div className="profile-stat">
            <span className="profile-label">Trades</span>
            <strong>{transactions.length}</strong>
          </div>
        </div>

        <div className="profile-actions">
          <Link to="/portfolio" className="secondary-button">
            View portfolio
          </Link>
          <button type="button" className="ghost-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </section>
  );
}

export default ProfilePage;
