import { useState } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { useNavigate } from 'react-router-dom';

function HistoryPage() {
    const transactions = usePortfolioStore((state) => state.transactions);
    const navigate = useNavigate();
    const [filter, setFilter] = useState('all');

    const filteredTransactions = transactions.filter((t) => {
        if (filter === 'all') return true;
        if (filter === 'limit') return t.type.includes('limit');
        if (filter === 'stock') return t.instrumentType === 'stock' && !t.type.includes('limit');
        if (filter === 'earn') return t.instrumentType === 'earn' && !t.type.includes('limit');
        if (filter === 'futures') return t.instrumentType === 'futures' && !t.type.includes('limit');
        return true;
    });

    const exportTransactionsToCSV = () => {
        if (filteredTransactions.length === 0) return;
        const headers = ['ID', 'Date/Time', 'Action Type', 'Asset', 'Symbol', 'Instrument', 'Quantity', 'Price', 'Total Value'];

        const rows = filteredTransactions.map(t => [
            t.id,
            `"${t.time}"`,
            t.type.toUpperCase(),
            `"${t.assetName}"`,
            t.symbol.toUpperCase(),
            t.instrumentType,
            t.quantity,
            t.price,
            t.total.toFixed(2)
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        const fileNameSuffix = filter === 'all' ? 'full' : filter;
        link.setAttribute('download', `trade_history_${fileNameSuffix}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <section style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="surface" style={{ width: '100%', boxSizing: 'border-box' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px', flexWrap: 'wrap' }}>
                    <button type="button" className="ghost-button" onClick={() => navigate(-1)} style={{ margin: 0 }}>
                        ← Back
                    </button>
                    <h2 style={{ margin: 0 }}>Trade History Ledger</h2>
                    <button
                        type="button"
                        className="tf-pill"
                        onClick={exportTransactionsToCSV}
                        disabled={filteredTransactions.length === 0}
                        style={{ marginLeft: 'auto', padding: '8px 16px', borderColor: 'var(--border)' }}
                    >
                        Export {filter === 'all' ? 'Full' : 'Filtered'} CSV
                    </button>
                </div>

                <div className="tf-row" style={{ marginBottom: '32px' }}>
                    <button className={`tf-pill ${filter === 'all' ? 'tf-pill--active' : ''}`} onClick={() => setFilter('all')}>
                        All History
                    </button>
                    <button className={`tf-pill ${filter === 'stock' ? 'tf-pill--active' : ''}`} onClick={() => setFilter('stock')}>
                        Spot Trading
                    </button>
                    <button className={`tf-pill ${filter === 'earn' ? 'tf-pill--active' : ''}`} onClick={() => setFilter('earn')} style={{ borderColor: filter === 'earn' ? 'rgba(247, 185, 85, 0.5)' : '', color: filter === 'earn' ? 'var(--auth-accent)' : '' }}>
                        Earn (Staking)
                    </button>
                    <button className={`tf-pill ${filter === 'futures' ? 'tf-pill--active' : ''}`} onClick={() => setFilter('futures')}>
                        Futures Contracts
                    </button>
                    <button className={`tf-pill ${filter === 'limit' ? 'tf-pill--active' : ''}`} onClick={() => setFilter('limit')} style={{ borderColor: filter === 'limit' ? 'rgba(168, 85, 247, 0.5)' : '', color: filter === 'limit' ? '#d8b4fe' : '' }}>
                        Limit Orders & Escrow
                    </button>
                </div>

                {filteredTransactions.length === 0 ? (
                    <div className="empty-state">No transaction history found for this category.</div>
                ) : (
                    <div className="section-list">
                        {filteredTransactions.map((transaction) => {
                            let isOutflow = false;
                            let isNeutral = false;
                            let absoluteValue = Math.abs(transaction.total);

                            if (transaction.type === 'buy' || transaction.type === 'limit_placed') {
                                isOutflow = true;
                            } else if (transaction.type === 'futures_close') {
                                isOutflow = transaction.total < 0;
                            } else if (transaction.type === 'limit_filled_buy') {
                                isNeutral = true;
                            }

                            const displaySign = isNeutral ? '' : isOutflow ? '-' : '+';
                            const displayClass = isNeutral ? 'asset-meta' : isOutflow ? 'negative' : 'positive';
                            const titlePrefix = transaction.type === 'buy' || transaction.type === 'sell' ? transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) : '';

                            return (
                                <div className="list-item" key={transaction.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>

                                    <div style={{ flex: '1.5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <strong style={{ fontSize: '1.05rem', whiteSpace: 'nowrap' }}>
                                            {titlePrefix} {transaction.assetName}
                                        </strong>
                                        {transaction.instrumentType === 'futures' && <span className="auth-pill" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(66, 211, 146, 0.1)' }}>(futures)</span>}
                                        {transaction.instrumentType === 'earn' && <span className="auth-pill" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(247, 185, 85, 0.1)', color: 'var(--auth-accent)' }}>(earn)</span>}
                                        {transaction.type.includes('limit') && !transaction.type.includes('filled') && <span className="auth-pill" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(168, 85, 247, 0.1)', color: '#d8b4fe' }}>(escrow)</span>}
                                    </div>

                                    <div className="asset-meta" style={{ flex: '2', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0 32px' }}>
                                        <span><strong>Qty:</strong> {transaction.quantity} {transaction.symbol.toUpperCase()}</span>
                                        <span><strong>Price:</strong> ${Number(transaction.price).toFixed(2)}</span>
                                        <span style={{ minWidth: '150px', textAlign: 'right' }}>{transaction.time}</span>
                                    </div>

                                    <div style={{ flex: '0.8', textAlign: 'right' }}>
                                        <strong className={displayClass} style={{ fontSize: '1.15rem' }}>
                                            {displaySign}${absoluteValue.toFixed(2)}
                                        </strong>
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

export default HistoryPage;