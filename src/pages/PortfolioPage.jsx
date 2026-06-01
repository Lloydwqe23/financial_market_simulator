import { useEffect, useMemo, useState } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { CURRENCIES, useMarketStore } from '../store/marketStore';

function PortfolioPage() {
  const balance = usePortfolioStore((state) => state.balance);
  const holdings = usePortfolioStore((state) => state.holdings);
  const transactions = usePortfolioStore((state) => state.transactions);
  const syncMarketPrices = usePortfolioStore((state) => state.syncMarketPrices);

  const loadCryptoAssets = useMarketStore((state) => state.loadCryptoAssets);
  const loadStockAssets = useMarketStore((state) => state.loadStockAssets);
  const loadCurrencyRates = useMarketStore((state) => state.loadCurrencyRates);
  const currencyBase = useMarketStore((state) => state.currencyBase);

  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    let mounted = true;
    let timerId = 0;
    let inFlight = false;

    const refreshMarketFeeds = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        await Promise.allSettled([
          loadCryptoAssets(),
          loadStockAssets(),
          loadCurrencyRates(currencyBase || 'USD')
        ]);

        if (!mounted) return;

        const currentCrypto = useMarketStore.getState().cryptoAssets;
        const currentStocks = useMarketStore.getState().stockAssets;

        const rates = useMarketStore.getState().currencyRates;
        const base = currencyBase || 'USD';
        const usdPerBase = base === 'USD' ? 1 : Number(rates?.usd || 1);

        const fxAssets = CURRENCIES.map((code) => {
          const codeLow = code.toLowerCase();
          const baseToCode = Number(rates?.[codeLow]);
          const priceUsd = Number.isFinite(baseToCode) && baseToCode > 0 ? usdPerBase / baseToCode : null;
          return {
            id: `fx-${codeLow}`,
            symbol: codeLow,
            name: code,
            type: 'currency',
            price: priceUsd || 0,
          };
        }).filter((a) => a.price > 0);

        const aggregateMarketTickers = [...currentCrypto, ...currentStocks, ...fxAssets];
        syncMarketPrices(aggregateMarketTickers);

      } catch (err) {
      } finally {
        inFlight = false;
        if (mounted) {
          timerId = window.setTimeout(refreshMarketFeeds, 1000);
        }
      }
    };

    refreshMarketFeeds();

    return () => {
      mounted = false;
      window.clearTimeout(timerId);
    };
  }, [currencyBase, loadCryptoAssets, loadCurrencyRates, loadStockAssets, syncMarketPrices]);
  // ───────────────────────────────────────────────────────────────────────────

  const portfolioValue = useMemo(() => {
    return holdings.reduce((sum, item) => {
      if (item.instrumentType !== 'futures') {
        return sum + item.quantity * item.currentPrice;
      }
      const pnl = item.unrealizedPnL || 0;
      return sum + item.margin + pnl;
    }, 0);
  }, [holdings]);

  const investedValue = useMemo(
    () => holdings.reduce((sum, item) => sum + (item.margin || item.quantity * item.averagePrice), 0),
    [holdings],
  );

  const totalWorth = balance + portfolioValue;

  const groupedHoldings = useMemo(() => {
    const categories = {
      crypto: { stock: [], futures: [] },
      stock: { stock: [], futures: [] },
      currency: { stock: [], futures: [] },
    };

    holdings.forEach((holding) => {
      let cat = holding.type === 'stocks' ? 'stock' : holding.type;
      if (!categories[cat]) categories[cat] = { stock: [], futures: [] };

      const instType = holding.instrumentType === 'futures' ? 'futures' : 'stock';
      categories[cat][instType].push(holding);
    });

    return categories;
  }, [holdings]);

  const renderSubSection = (title, items) => {
    if (!items || items.length === 0) return null;

    return (
      <div style={{ margin: '14px 0 24px 16px' }}>
        <h5 className="user-label" style={{ marginBottom: '10px', fontSize: '0.75rem', color: 'var(--accent)' }}>
          {title.toUpperCase()}
        </h5>
        <div className="section-list">
          {items.map((holding) => {
            const isFutures = holding.instrumentType === 'futures';

            let displayPnL = 0;
            let totalDisplayValue = 0;

            if (isFutures) {
              displayPnL = holding.unrealizedPnL || 0;
              totalDisplayValue = holding.margin + displayPnL;
            } else {
              totalDisplayValue = holding.quantity * holding.currentPrice;
              const costBasis = holding.quantity * holding.averagePrice;
              displayPnL = totalDisplayValue - costBasis;
            }

            const pnlClass = displayPnL >= 0 ? 'positive' : 'negative';
            const pnlSign = displayPnL >= 0 ? '+' : '';

            return (
              <div className="list-item" key={holding.id}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>
                      {holding.name} ({holding.symbol.toUpperCase()})
                    </strong>
                    {isFutures && (
                      <span
                        className="auth-pill"
                        style={{
                          fontSize: '0.65rem',
                          padding: '2px 8px',
                          background: holding.direction === 'long' ? 'rgba(66, 211, 146, 0.16)' : 'rgba(255, 122, 122, 0.16)',
                          color: holding.direction === 'long' ? 'var(--accent)' : 'var(--danger)',
                          borderColor: holding.direction === 'long' ? 'rgba(66, 211, 146, 0.3)' : 'rgba(255, 122, 122, 0.3)',
                          borderStyle: 'solid',
                          borderWidth: '1px'
                        }}
                      >
                        {holding.direction?.toUpperCase()} {holding.leverage}x
                      </span>
                    )}
                  </div>
                  <small style={{ marginTop: '4px', display: 'block' }}>
                    {isFutures
                      ? `Contracts: ${holding.quantity} | Entry: $${holding.averagePrice.toFixed(2)} | Collateral Margin: $${holding.margin.toFixed(2)}`
                      : `Quantity: ${holding.quantity} | Avg: $${holding.averagePrice.toFixed(2)}`
                    }
                    {` | Current: $${holding.currentPrice.toFixed(2)}`}
                  </small>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <strong>${totalDisplayValue.toFixed(2)}</strong>
                  <span className={pnlClass} style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                    {pnlSign}${displayPnL.toFixed(2)} PnL
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="page-grid">
      <div className="surface">

        {/* --- UPDATED HERO SECTION --- */}
        <div className="hero">
          <div className="hero-title-row">
            <h2>Portfolio</h2>
            <div className="info-tooltip-wrapper">
              <svg className="info-icon" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span className="info-tooltip-text">Your global account state, segmented assets, and comprehensive trading distributions.</span>
            </div>
          </div>
        </div>
        {/* ---------------------------- */}

        <div className="grid-cards" style={{ marginBottom: 24 }}>
          <div className="asset-card">
            <span className="asset-meta">Cash balance</span>
            <strong className="price">${balance.toFixed(2)}</strong>
          </div>
          <div className="asset-card">
            <span className="asset-meta">Portfolio value</span>
            <strong className="price">${portfolioValue.toFixed(2)}</strong>
          </div>
          <div className="asset-card">
            <span className="asset-meta">Total worth</span>
            <strong className="price">${totalWorth.toFixed(2)}</strong>
          </div>
        </div>

        <div className="tf-row" style={{ marginBottom: '24px' }}>
          <button
            className={`tf-pill ${activeCategory === 'all' ? 'tf-pill--active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All Holdovers
          </button>
          <button
            className={`tf-pill ${activeCategory === 'crypto' ? 'tf-pill--active' : ''}`}
            onClick={() => setActiveCategory('crypto')}
          >
            Crypto
          </button>
          <button
            className={`tf-pill ${activeCategory === 'stock' ? 'tf-pill--active' : ''}`}
            onClick={() => setActiveCategory('stock')}
          >
            Stocks
          </button>
          <button
            className={`tf-pill ${activeCategory === 'currency' ? 'tf-pill--active' : ''}`}
            onClick={() => setActiveCategory('currency')}
          >
            Currencies
          </button>
        </div>

        <h3>Holdings Breakdown</h3>
        {holdings.length === 0 ? (
          <div className="empty-state">No investments held yet.</div>
        ) : (
          <div>
            {(activeCategory === 'all' || activeCategory === 'crypto') &&
              (groupedHoldings.crypto.stock.length > 0 || groupedHoldings.crypto.futures.length > 0) && (
                <div style={{ marginBottom: '24px' }}>
                  <h4>Cryptocurrency Ledger</h4>
                  {renderSubSection('Spot Asset Positions', groupedHoldings.crypto.stock)}
                  {renderSubSection('Derivative Futures Contracts', groupedHoldings.crypto.futures)}
                </div>
              )}

            {(activeCategory === 'all' || activeCategory === 'stock') &&
              (groupedHoldings.stock.stock.length > 0 || groupedHoldings.stock.futures.length > 0) && (
                <div style={{ marginBottom: '24px' }}>
                  <h4>Equity Shares</h4>
                  {renderSubSection('Standard Equity Shares', groupedHoldings.stock.stock)}
                  {renderSubSection('Stock Index Futures', groupedHoldings.stock.futures)}
                </div>
              )}

            {(activeCategory === 'all' || activeCategory === 'currency') &&
              (groupedHoldings.currency.stock.length > 0 || groupedHoldings.currency.futures.length > 0) && (
                <div style={{ marginBottom: '24px' }}>
                  <h4>Forex Matrix</h4>
                  {renderSubSection('Spot Currency Holdings', groupedHoldings.currency.stock)}
                  {renderSubSection('Currency Futures Options', groupedHoldings.currency.futures)}
                </div>
              )}
          </div>
        )}

        <div className="helper-box">
          <strong>Total Net Invested Capital Margin:</strong> ${investedValue.toFixed(2)}
        </div>
      </div>

      <div className="surface">
        <h3>Transaction history</h3>
        {transactions.length === 0 ? (
          <div className="empty-state">Transactions will appear after your first buy or sell.</div>
        ) : (
          <div className="section-list">
            {transactions.map((transaction) => {
              let isOutflow = false;
              let absoluteValue = Math.abs(transaction.total);

              if (transaction.type === 'buy' || transaction.type === 'deposit') {
                isOutflow = transaction.type === 'buy';
              } else if (transaction.type === 'futures_close') {
                isOutflow = transaction.total < 0;
              }

              const displaySign = isOutflow ? '-' : '+';
              const displayClass = isOutflow ? 'negative' : 'positive';

              return (
                <div className="list-item" key={transaction.id}>
                  <div>
                    <strong>
                      {transaction.type === 'buy' ? 'Buy' : transaction.type === 'sell' ? 'Sell' : 'Close'} {transaction.assetName}
                      {transaction.instrumentType === 'futures' && (
                        <span className="asset-meta" style={{ fontSize: '0.75rem', marginLeft: '6px' }}>
                          (futures)
                        </span>
                      )}
                    </strong>
                    <small>
                      {transaction.quantity} {transaction.symbol.toUpperCase()} • {transaction.time}
                    </small>
                  </div>

                  <strong className={displayClass}>
                    {displaySign}${absoluteValue.toFixed(2)}
                  </strong>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default PortfolioPage;