import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolioStore } from '../store/portfolioStore';

function StatsPage() {
    const navigate = useNavigate();
    const transactions = usePortfolioStore((state) => state.transactions);
    const holdings = usePortfolioStore((state) => state.holdings);

    const stats = useMemo(() => {
        let totalVolume = 0;

        const breakdown = {
            stock: { volume: 0, invested: 0, realized: 0, color: '#42d392', label: 'Spot Trading' },
            earn: { volume: 0, invested: 0, realized: 0, color: '#f7b955', label: 'Earn (Staking)' },
            futures: { volume: 0, invested: 0, realized: 0, color: '#a855f7', label: 'Futures Contracts' }
        };

        transactions.forEach(t => {
        const isNeutral = t.type.includes('limit_filled');
        if (isNeutral) return;

        const category = breakdown[t.instrumentType] ? t.instrumentType : 'stock';

        if (t.type === 'buy' || t.type === 'limit_placed') {
            const cost = Math.abs(t.total);
            totalVolume += cost;
            breakdown[category].volume += cost;
            breakdown[category].invested += cost;

        } else if (t.type === 'futures_close') {
            if (t.margin !== undefined) {
            const payout = Math.max(0, t.margin + (t.pnl ?? t.total));
            totalVolume += payout;
            breakdown[category].volume += payout;
            breakdown[category].realized += payout;
            } else {
            if (t.total > 0) {
                breakdown[category].realized += t.total;
            }
            }

        } else {
            const val = Math.abs(t.total);
            totalVolume += val;
            breakdown[category].volume += val;
            breakdown[category].realized += val;
        }
        });

        return { totalVolume, breakdown };
    }, [transactions]);

    const activePositions = holdings.length;

    const ProgressBar = ({ label, value, max, color, isCurrency = true }) => {
        const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem' }}>
                    <span>{label}</span>
                    <strong>{isCurrency ? `$${value.toFixed(2)}` : value.toFixed(2)}</strong>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: color,
                        transition: 'width 0.5s ease-out'
                    }} />
                </div>
            </div>
        );
    };

    return (
        <section style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="surface" style={{ width: '100%', maxWidth: '900px', boxSizing: 'border-box' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
                    <button type="button" className="ghost-button" onClick={() => navigate(-1)} style={{ margin: 0 }}>
                        ← Back
                    </button>
                    <h2 style={{ margin: 0 }}>Financial Statistics</h2>
                </div>

                {transactions.length === 0 ? (
                    <div className="empty-state">Execute a trade to generate your statistical profile.</div>
                ) : (
                    <>
                        <div className="grid-cards" style={{ marginBottom: '32px' }}>
                            <div className="asset-card" style={{ borderTop: '3px solid var(--accent)' }}>
                                <span className="asset-meta">Total Lifetime Trading Volume</span>
                                <strong className="price">${stats.totalVolume.toFixed(2)}</strong>
                            </div>
                            <div className="asset-card" style={{ borderTop: '3px solid var(--text)' }}>
                                <span className="asset-meta">Total Executed Trades</span>
                                <strong className="price">{transactions.length}</strong>
                            </div>
                            <div className="asset-card" style={{ borderTop: '3px solid var(--auth-accent)' }}>
                                <span className="asset-meta">Currently Active Positions</span>
                                <strong className="price">{activePositions}</strong>
                            </div>
                        </div>

                        <h3 style={{ marginBottom: '16px' }}>Volume Distribution</h3>
                        <div className="helper-box" style={{ marginBottom: '32px' }}>
                            <div style={{ display: 'flex', width: '100%', height: '16px', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                                {Object.keys(stats.breakdown).map(key => {
                                    const data = stats.breakdown[key];
                                    const width = stats.totalVolume > 0 ? (data.volume / stats.totalVolume) * 100 : 0;
                                    return width > 0 ? <div key={key} style={{ width: `${width}%`, background: data.color, height: '100%' }} title={data.label} /> : null;
                                })}
                            </div>

                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {Object.keys(stats.breakdown).map(key => {
                                    const data = stats.breakdown[key];
                                    const percent = stats.totalVolume > 0 ? ((data.volume / stats.totalVolume) * 100).toFixed(1) : 0;
                                    return (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: data.color }} />
                                            <strong>{percent}%</strong> <span className="asset-meta">{data.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>

                            {Object.keys(stats.breakdown).map(key => {
                                const data = stats.breakdown[key];
                                if (data.volume === 0) return null; 

                                const maxBarValue = Math.max(data.invested, data.realized);

                                return (
                                    <div key={key} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                            <div style={{ width: '4px', height: '16px', background: data.color, borderRadius: '4px' }} />
                                            <h4 style={{ margin: 0 }}>{data.label}</h4>
                                        </div>

                                        <div style={{ marginBottom: '20px' }}>
                                            <span className="asset-meta" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Instrument Volume</span>
                                            <strong style={{ display: 'block', fontSize: '1.2rem', marginTop: '4px' }}>${data.volume.toFixed(2)}</strong>
                                        </div>

                                        <ProgressBar
                                            label="Total Capital Invested (Spent)"
                                            value={data.invested}
                                            max={maxBarValue}
                                            color="#ff7a7a"
                                        />
                                        <ProgressBar
                                            label="Total Capital Realized (Returned)"
                                            value={data.realized}
                                            max={maxBarValue}
                                            color={data.color}
                                        />

                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                            <span className="asset-meta">Net Cash Flow</span>
                                            <strong style={{ color: data.realized >= data.invested ? 'var(--accent)' : 'var(--danger)' }}>
                                                {data.realized >= data.invested ? '+' : ''}${(data.realized - data.invested).toFixed(2)}
                                            </strong>
                                        </div>
                                    </div>
                                );
                            })}

                        </div>
                    </>
                )}
            </div>
        </section>
    );
}

export default StatsPage;