import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

function TradePanel({ asset, onClose, onBuy, onSell, balance, quoteCurrency }) {
  const [amount, setAmount] = useState('1');
  const [instrumentType, setInstrumentType] = useState('stock'); // 'stock' | 'futures'
  const [leverage, setLeverage] = useState(1);
  const [direction, setDirection] = useState('long'); // 'long' | 'short'
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');

  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);

  if (!asset) {
    return null;
  }

  const amountNumber = Number(amount) || 0;
  const assetPrice = asset.price || 0;
  const estimatedCost = amountNumber * assetPrice;
  const marginRequired = instrumentType === 'futures' ? estimatedCost / leverage : estimatedCost;

  const liquidationPrice = useMemo(() => {
    if (instrumentType !== 'futures' || leverage <= 1) return null;
    return direction === 'long'
      ? assetPrice * (1 - 1 / leverage)
      : assetPrice * (1 + 1 / leverage);
  }, [assetPrice, leverage, direction, instrumentType]);

  const formatMoney = (value) => {
    const numericValue = Number(value) || 0;
    if (quoteCurrency) {
      return `${numericValue.toFixed(2)} ${String(quoteCurrency).toUpperCase()}`;
    }
    return `$${numericValue.toFixed(2)}`;
  };

  const handleTradeSubmit = (event, actionType) => {
    event.preventDefault();
    
    if (!authUser) {
      navigate('/login');
      return;
    }

    if (instrumentType === 'stock') {
      if (actionType === 'buy') onBuy(amountNumber, 'stock', {});
      if (actionType === 'sell') onSell(amountNumber, 'stock', {});
    } else {
      onBuy(amountNumber, 'futures', {
        direction,
        leverage,
        takeProfit: takeProfit ? Number(takeProfit) : null,
        stopLoss: stopLoss ? Number(stopLoss) : null,
        liquidationPrice,
        initialPrice: assetPrice
      });
    }
  };

  return (
    <div className="surface">
      <h3>Trade {asset.name}</h3>
      {!authUser && <p className="notice">Sign in to trade this asset.</p>}
      <p className="asset-meta">
        Balance: {formatMoney(balance)} | Required Margin: {formatMoney(marginRequired)}
      </p>

      {/* Mode Switches */}
      <div className="tf-row" style={{ margin: '14px 0' }}>
        <button
          type="button"
          className={`tf-pill ${instrumentType === 'stock' ? 'tf-pill--active' : ''}`}
          onClick={() => setInstrumentType('stock')}
        >
          Spot Market
        </button>
        <button
          type="button"
          className={`tf-pill ${instrumentType === 'futures' ? 'tf-pill--active' : ''}`}
          onClick={() => setInstrumentType('futures')}
        >
          Futures Margins
        </button>
      </div>

      <form className="trade-form" onSubmit={(e) => e.preventDefault()}>
        {instrumentType === 'futures' && (
          <>
            <div className="tf-row" style={{ marginBottom: '10px' }}>
              <button
                type="button"
                className={`tf-pill ${direction === 'long' ? 'tf-pill--active' : ''}`}
                style={{ flex: 1, textAlign: 'center' }}
                onClick={() => setDirection('long')}
              >
                Long (Buy Up)
              </button>
              <button
                type="button"
                className={`tf-pill ${direction === 'short' ? 'tf-pill--active' : ''}`}
                style={{ flex: 1, textAlign: 'center', borderColor: direction === 'short' ? 'var(--danger)' : '' }}
                onClick={() => setDirection('short')}
              >
                Short (Sell Down)
              </button>
            </div>

            <label>
              Leverage Options: {leverage}x
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
              />
            </label>

            <div style={{ display: 'flex', gap: '10px', margin: '8px 0' }}>
              <label style={{ flex: 1 }}>
                Take Profit Price
                <input
                  type="number"
                  placeholder="Target Payout"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                />
              </label>
              <label style={{ flex: 1 }}>
                Stop Loss Price
                <input
                  type="number"
                  placeholder="Safety Limit"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                />
              </label>
            </div>

            {liquidationPrice && (
              <p className="error" style={{ fontSize: '0.8rem', padding: '6px', margin: '4px 0 10px' }}>
                Est. Liquidation Price: {formatMoney(liquidationPrice)}
              </p>
            )}
          </>
        )}

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

        <div className="trade-actions" style={{ marginTop: '14px' }}>
          {instrumentType === 'stock' ? (
            <>
              <button type="button" className="primary-button" onClick={(e) => handleTradeSubmit(e, 'buy')} disabled={!authUser}>
                Buy Spot
              </button>
              <button type="button" className="secondary-button" onClick={(e) => handleTradeSubmit(e, 'sell')} disabled={!authUser}>
                Sell Spot
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-button"
              style={{
                gridColumn: 'span 2',
                background: direction === 'long' ? 'linear-gradient(135deg, var(--accent), #66f0b1)' : 'linear-gradient(135deg, var(--danger), #ff9e9e)',
                color: '#07111f'
              }}
              onClick={(e) => handleTradeSubmit(e, 'buy')}
              disabled={!authUser}
            >
              Open Futures Contract ({direction.toUpperCase()})
            </button>
          )}
        </div>
      </form>

      <p className="trade-hint" style={{ marginTop: '12px' }}>
        {instrumentType === 'stock' 
          ? 'Spot trading immediately allocates standard assets to your wallet balance.'
          : 'Futures: Contract uses margin values. High volatility risk involved.'}
      </p>

      <button type="button" className="secondary-button" style={{ width: '100%', marginTop: '8px' }} onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export default TradePanel;