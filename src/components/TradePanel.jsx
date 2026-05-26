import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

function TradePanel({ asset, onClose, onBuy, onSell, balance, quoteCurrency }) {
  const [amount, setAmount] = useState('1');
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);

  if (!asset) {
    return null;
  }

  const amountNumber = Number(amount) || 0;
  const estimatedCost = amountNumber * asset.price;

  const formatMoney = (value) => {
    const numericValue = Number(value) || 0;
    if (quoteCurrency) {
      return `${numericValue.toFixed(2)} ${String(quoteCurrency).toUpperCase()}`;
    }
    return `$${numericValue.toFixed(2)}`;
  };

  const submitBuy = (event) => {
    event.preventDefault();
    if (!authUser) {
      navigate('/login');
      return;
    }
    onBuy(amountNumber);
  };

  const submitSell = (event) => {
    event.preventDefault();
    if (!authUser) {
      navigate('/login');
      return;
    }
    onSell(amountNumber);
  };

  return (
    <div className="surface">
      <h3>Trade {asset.name}</h3>
      {!authUser && <p className="notice">Sign in to trade this asset.</p>}
      <p className="asset-meta">
        Balance: {formatMoney(balance)} | Estimated total: {formatMoney(estimatedCost)}
      </p>

      <form className="trade-form">
        <label>
          Amount
          <input
            type="number"
            min="0.00000001"
            step="0.00000001"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        <div className="trade-actions">
          <button type="submit" className="primary-button" onClick={submitBuy} disabled={!authUser}>
            Buy
          </button>
          <button type="button" className="secondary-button" onClick={submitSell} disabled={!authUser}>
            Sell
          </button>
        </div>
      </form>

      <p className="trade-hint">
        Balance is checked before buying. You can sell only assets you hold.
      </p>

      <button type="button" className="secondary-button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export default TradePanel;