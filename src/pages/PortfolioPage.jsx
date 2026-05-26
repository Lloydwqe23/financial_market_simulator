import { useMemo } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';

function PortfolioPage() {
  const balance = usePortfolioStore((state) => state.balance);
  const holdings = usePortfolioStore((state) => state.holdings);
  const transactions = usePortfolioStore((state) => state.transactions);

  const portfolioValue = useMemo(
    () => holdings.reduce((sum, item) => sum + item.quantity * item.currentPrice, 0),
    [holdings],
  );

  const investedValue = useMemo(
    () => holdings.reduce((sum, item) => sum + item.quantity * item.averagePrice, 0),
    [holdings],
  );

  const totalWorth = balance + portfolioValue;

  return (
    <section className="page-grid">
      <div className="surface">
        <div className="hero">
          <h2>Portfolio</h2>
          <p>Your global account state, owned assets, and trade history.</p>
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

        <h3>Holdings</h3>
        {holdings.length === 0 ? (
          <div className="empty-state">No holdings yet. Go back to the dashboard and make your first trade.</div>
        ) : (
          <div className="section-list">
            {holdings.map((holding) => (
              <div className="list-item" key={holding.id}>
                <div>
                  <strong>
                    {holding.name} ({holding.symbol.toUpperCase()})
                  </strong>
                  <small>
                    Quantity: {holding.quantity} | Avg price: ${holding.averagePrice.toFixed(2)} | Current price: $
                    {holding.currentPrice.toFixed(2)}
                  </small>
                </div>
                <strong>${(holding.quantity * holding.currentPrice).toFixed(2)}</strong>
              </div>
            ))}
          </div>
        )}

        <div className="helper-box">
          <strong>Invested:</strong> ${investedValue.toFixed(2)}
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