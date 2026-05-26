import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    const ok = await register(email, password);
    if (ok) {
      await login(email, password);
      navigate('/portfolio');
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="auth-aside">
          <span className="auth-pill">Market Simulator</span>
          <h2 className="auth-title">Create your account in minutes</h2>
          <p className="auth-subtitle">
            Registration unlocks trading and captures your portfolio history.
          </p>
          <ul className="auth-list">
            <li>Track profit and balance in your portfolio.</li>
            <li>Quotes update without page refresh.</li>
            <li>Personal tips for trading practice.</li>
          </ul>
        </div>
        <div className="auth-form">
          <div>
            <h2>Create account</h2>
            <p>Set your email and password to start trading.</p>
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="auth-actions">
              <button className="primary-button" type="submit">
                Create account
              </button>
              <Link to="/login" className="secondary-button">
                Sign in
              </Link>
            </div>
            {error && <p className="error">{error}</p>}
          </form>
          <p className="auth-footnote">Demo accounts are stored only on this device.</p>
        </div>
      </div>
    </section>
  );
}
