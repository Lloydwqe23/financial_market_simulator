import { useNavigate } from 'react-router-dom';

function CreditsPage() {
    const navigate = useNavigate();

    return (
        <section style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="surface" style={{ width: '100%', boxSizing: 'border-box' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
                    <button type="button" className="ghost-button" onClick={() => navigate(-1)} style={{ margin: 0 }}>
                        ← Back
                    </button>
                    <h2 style={{ margin: 0 }}>Project Credits</h2>
                </div>

                <p className="asset-meta" style={{ marginBottom: '32px', fontSize: '0.95rem', lineHeight: '1.5' }}>
                    The Financial Market Simulator was developed as a web technologies project at the Ukrainian Catholic University (UCU) within the Faculty of Applied Sciences (FPN).
                </p>

                <h3 style={{ marginBottom: '16px', color: 'var(--accent)' }}>Core Developers</h3>
                <div className="section-list" style={{ marginBottom: '32px' }}>

                    <a href="https://github.com/Lloydwqe23" target="_blank" rel="noreferrer" className="list-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <img
                                src="https://github.com/Lloydwqe23.png"
                                alt="Lloydwqe23 Avatar"
                                style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' }}
                            />
                            <div>
                                <strong style={{ fontSize: '1.05rem' }}>Holovin Maksym</strong>
                            </div>
                        </div>
                        <span className="tf-pill" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>@Lloydwqe23 ↗</span>
                    </a>

                    <a href="https://github.com/antondep" target="_blank" rel="noreferrer" className="list-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <img
                                src="https://github.com/antondep.png"
                                alt="Anton Avatar"
                                style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                            />
                            <div>
                                <strong style={{ fontSize: '1.05rem' }}>Deputat Anton</strong>
                            </div>
                        </div>
                        <span className="tf-pill" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>@antondep ↗</span>
                    </a>

                </div>

                <h3 style={{ marginBottom: '16px', color: '#a855f7' }}>Source Code</h3>
                <div className="section-list" style={{ marginBottom: '32px' }}>
                    <a href="https://github.com/Lloydwqe23/financial_market_simulator" target="_blank" rel="noreferrer" className="list-item" style={{ textDecoration: 'none', color: 'inherit', borderLeft: '3px solid #a855f7' }}>
                        <div>
                            <strong>financial_market_simulator</strong>
                            <small style={{ display: 'block', marginTop: '4px', color: 'var(--muted)' }}>View the full commit history and repository graph.</small>
                        </div>
                        <span className="ghost-button" style={{ margin: 0, fontSize: '0.8rem' }}>View on GitHub ↗</span>
                    </a>
                </div>

                <h3 style={{ marginBottom: '16px' }}>API</h3>
                <div className="section-list">

                    <div className="list-item">
                        <div>
                            <strong>Binance API</strong>
                            <small style={{ display: 'block', marginTop: '4px', color: 'var(--muted)' }}>Real-time cryptocurrency pricing and candlestick (kline) data.</small>
                        </div>
                    </div>

                    <div className="list-item">
                        <div>
                            <strong>Yahoo API</strong>
                            <small style={{ display: 'block', marginTop: '4px', color: 'var(--muted)' }}>Market charts and stocks prices.</small>
                        </div>
                    </div>

                    <div className="list-item">
                        <div>
                            <strong>CoinGeko API</strong>
                            <small style={{ display: 'block', marginTop: '4px', color: 'var(--muted)' }}>Historical market charts and altcoin metrics</small>
                        </div>
                    </div>

                </div>

            </div>
        </section>
    );
}

export default CreditsPage;