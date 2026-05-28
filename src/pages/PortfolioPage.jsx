import { useMemo, useState } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';

function PortfolioPage() {
  const balance = usePortfolioStore((state) => state.balance);
  const holdings = usePortfolioStore((state) => state.holdings);
  const transactions = usePortfolioStore((state) => state.transactions);

  // Filter selection: 'all' | 'crypto' | 'stock' | 'currency'
  const [activeCategory, setActiveCategory] = useState('all');

  const portfolioValue = useMemo(
    () => holdings.reduce((sum, item) => sum + item.quantity * item.currentPrice, 0),
    [holdings],
  );

  const investedValue = useMemo(
    () => holdings.reduce((sum, item) => sum + item.quantity * item.averagePrice, 0),
    [holdings],
  );

  const totalWorth = balance + portfolioValue;

  // Group holdings by Category -> Instrument Type on the fly
  const groupedHoldings = useMemo(() => {
    const categories = {
      crypto: { stock: [], futures: [] },
      stock: { stock: [], futures: [] },
      currency: { stock: [], futures: [] },
    };

    holdings.forEach((holding) => {
      // Normalizing variations in asset type fields
      let cat = holding.type === 'stocks' ? 'stock' : holding.type;
      if (!categories[cat]) categories[cat] = { stock: [], futures: [] };

      // Map either to standard or futures bucket
      const instType = holding.instrumentType === 'futures' ? 'futures' : 'stock';
      categories[cat][instType].push(holding);
    });

    return categories;
  }, [holdings]);

  // Helper render method for handling sub-tables neatly
  const renderSubSection = (title, items) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={{ margin: '14px 0 24px 16px' }}>
        <h5 className="user-label" style={{ marginBottom: '10px', fontSize: '0.75rem', color: 'var(--accent)' }}>
          {title.toUpperCase()}
        </h5>
        <div className="section-list">
          {items.map((holding) => (
            <div className="list-item" key={`${holding.id}-${holding.instrumentType}`}>
              <div>
                <strong>
                  {holding.name} ({holding.symbol.toUpperCase()})
                </strong>
                <small>
                  Quantity: {holding.quantity} | Avg: ${holding.averagePrice.toFixed(2)} | Current: ${holding.currentPrice.toFixed(2)}
                </small>
              </div>
              <strong>${(holding.quantity * holding.currentPrice).toFixed(2)}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="page-grid">
      <div className="surface">
        <div className="hero">
          <h2>Portfolio</h2>
          <p>Your global account state, segmented assets, and comprehensive trading distributions.</p>
        </div>

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

        {/* Category Navigation Controls */}
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
            {/* Crypto Category Layer */}
            {(activeCategory === 'all' || activeCategory === 'crypto') && 
             (groupedHoldings.crypto.stock.length > 0 || groupedHoldings.crypto.futures.length > 0) && (
              <div style={{ marginBottom: '24px' }}>
                <h4>Cryptocurrency Ledger</h4>
                {renderSubSection('Spot Asset Positions', groupedHoldings.crypto.stock)}
                {renderSubSection('Derivative Futures Contracts', groupedHoldings.crypto.futures)}
              </div>
            )}

            {/* Stocks Category Layer */}
            {(activeCategory === 'all' || activeCategory === 'stock') && 
             (groupedHoldings.stock.stock.length > 0 || groupedHoldings.stock.futures.length > 0) && (
              <div style={{ marginBottom: '24px' }}>
                <h4>Equity Shares</h4>
                {renderSubSection('Standard Equity Shares', groupedHoldings.stock.stock)}
                {renderSubSection('Stock Index Futures', groupedHoldings.stock.futures)}
              </div>
            )}

            {/* Currencies Category Layer */}
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
          <strong>Total Initial Invested Value:</strong> ${investedValue.toFixed(2)}
        </div>
      </div>

      <div className="surface">
        <h3>Transaction history</h3>
        {transactions.length === 0 ? (
          <div className="empty-state">Transactions will appear after your first buy or sell.</div>
        ) : (
          <div className="section-list">
            {transactions.map((transaction) => (
              <div className="list-item" key={transaction.id}>
                <div>
                  <strong>
                    {transaction.type === 'buy' ? 'Buy' : 'Sell'} {transaction.assetName}
                    <span className="asset-meta" style={{ fontSize: '0.75rem', marginLeft: '6px' }}>
                      ({transaction.instrumentType || 'stock'})
                    </span>
                  </strong>
                  <small>
                    {transaction.quantity} {transaction.symbol.toUpperCase()} • {transaction.time}
                  </small>
                </div>
                <strong className={transaction.type === 'buy' ? 'negative' : 'positive'}>
                  {transaction.type === 'buy' ? '-' : '+'}${transaction.total.toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default PortfolioPage;