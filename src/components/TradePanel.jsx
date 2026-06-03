import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePortfolioStore } from '../store/portfolioStore';

function TradePanel({ asset, onClose, onBuy, onSell, balance, quoteCurrency }) {
  const [amount, setAmount] = useState('1');
  const [instrumentType, setInstrumentType] = useState('stock'); // 'stock' | 'earn' | 'futures'
  const [orderType, setOrderType] = useState('market'); // 'market' | 'limit'
  const [limitPrice, setLimitPrice] = useState('');
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

  // If it's a limit order, calculate margin based on their target price, otherwise use live price
  const activePriceTarget = orderType === 'limit' && limitPrice ? Number(limitPrice) : assetPrice;
  const estimatedCost = amountNumber * activePriceTarget;
  const marginRequired = instrumentType === 'futures' ? estimatedCost / leverage : estimatedCost;

  const liquidationPrice = useMemo(() => {
    if (instrumentType !== 'futures' || leverage <= 1) return null;
    return direction === 'long'
      ? activePriceTarget * (1 - 1 / leverage)
      : activePriceTarget * (1 + 1 / leverage);
  }, [activePriceTarget, leverage, direction, instrumentType]);

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

    const isLimit = orderType === 'limit';
    const placeLimitOrder = usePortfolioStore.getState().placeLimitOrder;

    if (instrumentType === 'stock' || instrumentType === 'earn') {
      if (isLimit) {
        placeLimitOrder({ asset, amount: amountNumber, instrumentType, limitPrice, direction: actionType, currentLivePrice: assetPrice });
      } else {
        if (actionType === 'buy') onBuy(amountNumber, instrumentType, {});
        if (actionType === 'sell') onSell(amountNumber, instrumentType, {});
      }
    } else {
      const fOpts = {
        direction,
        leverage,
        takeProfit: takeProfit ? Number(takeProfit) : null,
        stopLoss: stopLoss ? Number(stopLoss) : null,
        liquidationPrice,
        initialPrice: activePriceTarget
      };

      if (isLimit) {
        placeLimitOrder({ asset, amount: amountNumber, instrumentType: 'futures', limitPrice, direction: actionType, futuresOptions: fOpts, currentLivePrice: assetPrice });
      } else {
        onBuy(amountNumber, 'futures', fOpts);
      }
    }
  };

  return (
    <div className="surface">
      <h3>Trade {asset.name}</h3>
      {!authUser && <p className="notice">Sign in to trade this asset.</p>}
      <p className="asset-meta">
        Balance: {formatMoney(balance)} | Required Margin: {formatMoney(marginRequired)}
      </p>

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
          className={`tf-pill ${instrumentType === 'earn' ? 'tf-pill--active' : ''}`}
          onClick={() => setInstrumentType('earn')}
          style={{ borderColor: instrumentType === 'earn' ? 'rgba(247, 185, 85, 0.5)' : '', color: instrumentType === 'earn' ? 'var(--auth-accent)' : '' }}
        >
          Earn (Staking)
        </button>
        <button
          type="button"
          className={`tf-pill ${instrumentType === 'futures' ? 'tf-pill--active' : ''}`}
          onClick={() => setInstrumentType('futures')}
        >
          Futures Margins
        </button>
      </div>

      <div className="tf-row" style={{ margin: '16px 0', padding: '6px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px' }}>
        <button
          type="button"
          className={`tf-pill ${orderType === 'market' ? 'tf-pill--active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setOrderType('market')}
        >
          Market Order
        </button>
        <button
          type="button"
          className={`tf-pill ${orderType === 'limit' ? 'tf-pill--active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setOrderType('limit')}
        >
          Limit Order
        </button>
      </div>

      <form className="trade-form" onSubmit={(e) => e.preventDefault()}>

        {orderType === 'limit' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', color: 'var(--text)' }}>
            Target Execution Price ($)
            <input
              type="number"
              min="0.00000001"
              step="any"
              placeholder={`Current market price: $${assetPrice.toFixed(2)}`}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              style={{ borderLeft: '3px solid var(--accent)' }}
            />
          </label>
        )}

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
          Amount to Trade
          <input
            type="number"
            min="0.00000001"
            step="0.00000001"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        <div className="trade-actions" style={{ marginTop: '14px' }}>
          {instrumentType === 'stock' && (
            <>
              <button type="button" className="primary-button" onClick={(e) => handleTradeSubmit(e, 'buy')} disabled={!authUser}>
                {orderType === 'limit' ? 'Place Limit Buy' : 'Buy Spot'}
              </button>
              <button type="button" className="secondary-button" onClick={(e) => handleTradeSubmit(e, 'sell')} disabled={!authUser}>
                {orderType === 'limit' ? 'Place Limit Sell' : 'Sell Spot'}
              </button>
            </>
          )}

          {instrumentType === 'earn' && (
            <>
              <button type="button" className="primary-button" style={{ background: 'linear-gradient(135deg, var(--auth-accent), #ffd38a)' }} onClick={(e) => handleTradeSubmit(e, 'buy')} disabled={!authUser}>
                {orderType === 'limit' ? 'Limit Stake' : 'Stake (Buy)'}
              </button>
              <button type="button" className="secondary-button" onClick={(e) => handleTradeSubmit(e, 'sell')} disabled={!authUser}>
                {orderType === 'limit' ? 'Limit Unstake' : 'Unstake (Sell)'}
              </button>
            </>
          )}

          {instrumentType === 'futures' && (
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
              {orderType === 'limit' ? 'Queue Limit Contract' : `Open Futures Contract (${direction.toUpperCase()})`}
            </button>
          )}
        </div>
      </form>

      <p className="trade-hint" style={{ marginTop: '12px' }}>
        {orderType === 'limit' ? 'Limit orders hold funds in escrow until the target execution price is reached on the live market.' : ''}
        {instrumentType === 'stock' && orderType === 'market' && 'Spot trading immediately allocates standard assets to your wallet balance.'}
        {instrumentType === 'earn' && orderType === 'market' && 'Earn Wallet: Locked assets dynamically generate 12% APY compounded every second.'}
        {instrumentType === 'futures' && orderType === 'market' && 'Futures: Contract uses margin values. High volatility risk involved.'}
      </p>

      <button type="button" className="secondary-button" style={{ width: '100%', marginTop: '8px' }} onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export default TradePanel;