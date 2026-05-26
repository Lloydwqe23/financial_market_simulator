import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate('/portfolio');
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="auth-aside">
          <span className="auth-pill">Market Simulator</span>
          <h2 className="auth-title">Return to the trading desk</h2>
          <p className="auth-subtitle">
            Sign in to buy, sell, and track your shared portfolio.
          </p>
          <ul className="auth-list">
            <li>Live crypto and stock quotes every second.</li>
            <li>One transaction timeline across all markets.</li>
            <li>Balance-aware trading feedback built in.</li>
          </ul>
        </div>
        <div className="auth-form">
          <div>
            <h2>Sign in</h2>
            <p>Use your account credentials to continue.</p>
          </div>
          <form className="auth-form-body" onSubmit={submit}>
            <label className="auth-label">
              Email
              <input
                className="auth-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="auth-label">
              Password
              <input
                className="auth-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="auth-actions">
              <button className="primary-button" type="submit">
                Sign in
              </button>
              <Link to="/register" className="secondary-button">
                Create account
              </Link>
            </div>
            {error && <p className="error">{error}</p>}
          </form>
          <p className="auth-footnote">Demo data is stored locally on this device.</p>
        </div>
      </div>
    </section>
  );
}
