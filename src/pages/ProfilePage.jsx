import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';

const PRESET_AMOUNTS = [500, 1000, 5000, 10000];

function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  const logout = useAuthStore((s) => s.logout);
  const balance = usePortfolioStore((s) => s.balance);
  const holdings = usePortfolioStore((s) => s.holdings);
  const transactions = usePortfolioStore((s) => s.transactions);
  const deposit = usePortfolioStore((s) => s.deposit);

  const [depositInput, setDepositInput] = useState('');
  const [depositMsg, setDepositMsg] = useState(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const portfolioValue = useMemo(
    () => holdings.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0),
    [holdings],
  );
  const totalWorth = balance + portfolioValue;

  const derivedName = useMemo(() => {
    if (!user?.email) return 'User';
    if (user.displayName) return user.displayName;
    return user.email.split('@')[0];
  }, [user]);

  const handleDeposit = (amount) => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setDepositMsg({ ok: false, text: 'Enter a valid amount greater than 0.' });
      return;
    }
    if (n > 1_000_000) {
      setDepositMsg({ ok: false, text: 'Maximum single deposit is $1,000,000.' });
      return;
    }
    deposit(n);
    setDepositMsg({ ok: true, text: `+$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })} added to your balance.` });
    setDepositInput('');
  };

  const startEditingName = () => {
    setNameInput(derivedName);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateDisplayName(nameInput);
    }
    setIsEditingName(false);
  };

  if (!user) {
    return (
      <section className="page-grid">
        <div className="surface">
          <h2>Profile</h2>
          <p>Sign in to see your account details and trade history.</p>
          <Link to="/login" className="primary-button">Sign in</Link>
        </div>
        <div className="surface">
          <h3>Why create an account?</h3>
          <p>Your profile keeps trades, balance, and activity in one place.</p>
        </div>
      </section>
    );
  }

  const initial = derivedName[0]?.toUpperCase() ?? 'U';

  return (
    <section className="page-grid">

      <div className="surface profile-card">
        <div className="profile-header">
          <div className="profile-avatar">{initial}</div>
          <div style={{ flex: 1 }}>
            {isEditingName ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="market-search-input"
                  style={{ padding: '6px 12px', fontSize: '1.2rem', fontWeight: 'bold' }}
                  value={nameInput}
                  maxLength={25}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                />
                <button type="button" className="primary-button" style={{ padding: '8px 14px' }} onClick={handleSaveName}>
                  Save
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0 }}>{derivedName}</h2>
                <button 
                  type="button" 
                  className="tf-pill" 
                  style={{ fontSize: '0.7rem', padding: '3px 8px', margin: 0 }} 
                  onClick={startEditingName}
                >
                  ✏️ Edit
                </button>
              </div>
            )}
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
          <Link to="/portfolio" className="secondary-button">View portfolio</Link>
          <Link to="/stats" className="secondary-button">Statistics</Link>
          <Link to="/reviews" className="secondary-button">Platform Reviews</Link>
          <Link to="/credits" className="secondary-button">Project Credits</Link>
          <button type="button" className="ghost-button" onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="surface">
        <h3 style={{ marginBottom: 6 }}>Add funds</h3>
        <p className="asset-meta" style={{ marginBottom: 16 }}>
          Simulate a deposit to your trading account.
        </p>

        <div className="deposit-presets">
          {PRESET_AMOUNTS.map((amt) => (
            <button
              key={amt}
              type="button"
              className="deposit-preset-btn"
              onClick={() => handleDeposit(amt)}
            >
              +${amt.toLocaleString()}
            </button>
          ))}
        </div>

        <div className="deposit-custom">
          <div className="deposit-input-wrap">
            <span className="deposit-currency-sign">$</span>
            <input
              className="deposit-input"
              type="number"
              min="1"
              step="any"
              placeholder="Custom amount"
              value={depositInput}
              onChange={(e) => { setDepositInput(e.target.value); setDepositMsg(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleDeposit(depositInput)}
            />
          </div>
          <button
            type="button"
            className="primary-button"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => handleDeposit(depositInput)}
          >
            Deposit
          </button>
        </div>

        {depositMsg && (
          <p className={depositMsg.ok ? 'notice' : 'error'} style={{ marginTop: 12 }}>
            {depositMsg.text}
          </p>
        )}
      </div>

    </section>
  );
}

export default ProfilePage;