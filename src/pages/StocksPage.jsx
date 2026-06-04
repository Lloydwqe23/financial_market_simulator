import { useEffect, useMemo, useState } from 'react';
import AssetCard from '../components/AssetCard';
import { usePortfolioStore } from '../store/portfolioStore';
import { useMarketStore } from '../store/marketStore';

function StocksPage() {
  const assets = useMarketStore((state) => state.stockAssets);
  const status = useMarketStore((state) => state.stockStatus);
  const loadStockAssets = useMarketStore((state) => state.loadStockAssets);
  const syncMarketPrices = usePortfolioStore((state) => state.syncMarketPrices);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('none');

  useEffect(() => {
    let mounted = true;
    let refreshTimerId = 0;
    let requestInFlight = false;

    const loadAssets = async () => {
      if (requestInFlight) return;
      requestInFlight = true;

      try {
        await loadStockAssets();
        if (!mounted) return;

        syncMarketPrices(useMarketStore.getState().stockAssets);
      } finally {
        requestInFlight = false;
        if (mounted) {
          refreshTimerId = window.setTimeout(loadAssets, 1000);
        }
      }
    };

    loadAssets();

    return () => {
      mounted = false;
      window.clearTimeout(refreshTimerId);
    };
  }, [loadStockAssets, syncMarketPrices]);

  const filteredAssets = useMemo(() => {
    let result = [...assets];

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (asset) =>
          asset.name.toLowerCase().includes(query) ||
          asset.symbol.toLowerCase().includes(query)
      );
    }

    const getVol = (asset) => asset.volume || asset.total_volume || asset.totalVolume || asset.quoteVolume || 0;

    if (sortBy === 'changeHigh') {
      result.sort((a, b) => (b.change24h || 0) - (a.change24h || 0));
    } else if (sortBy === 'changeLow') {
      result.sort((a, b) => (a.change24h || 0) - (b.change24h || 0));
    } else if (sortBy === 'volumeHigh') {
      result.sort((a, b) => getVol(b) - getVol(a));
    } else if (sortBy === 'volumeLow') {
      result.sort((a, b) => getVol(a) - getVol(b));
    }

    return result;
  }, [assets, searchQuery, sortBy]);

  const marketSummary = useMemo(() => {
    const averageChange = assets.reduce((sum, asset) => sum + asset.change24h, 0) / assets.length;
    return Number.isFinite(averageChange) ? averageChange.toFixed(2) : '0.00';
  }, [assets]);

  return (
    <section className="surface">
      <div className="hero">
        <div className="hero-title-row">
          <h2>Stocks</h2>
          <div className="info-tooltip-wrapper">
            <svg className="info-icon" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span className="info-tooltip-text">Public quotes for Apple, Microsoft, NVIDIA, and other companies.</span>
          </div>
        </div>

        <div className="hero-meta-row">
          <span className="asset-meta">Time: {status}</span>
          <span className="asset-meta">•</span>
          <span className="asset-meta">Average change: {marketSummary}%</span>
          <span className="asset-meta">•</span>
          <span className="asset-meta">Stocks tracked: {assets.length || '...'}</span>
        </div>
      </div>

      <div className="market-toolbar">
        <div className="filter-row-container">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <input
              type="text"
              className="market-search-input"
              placeholder="Search stock ticker or name (e.g. AAPL)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="tf-row" style={{ marginBottom: 0, gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`tf-pill ${sortBy === 'none' ? 'tf-pill--active' : ''}`}
              onClick={() => setSortBy('none')}
            >
              Default
            </button>
            <button
              type="button"
              className={`tf-pill ${sortBy === 'name' ? 'tf-pill--active' : ''}`}
              onClick={() => setSortBy('name')}
            >
              Name (A-Z)
            </button>
            <button
              type="button"
              className={`tf-pill ${sortBy === 'changeHigh' ? 'tf-pill--active' : ''}`}
              onClick={() => setSortBy('changeHigh')}
            >
              Top Gainers
            </button>
            <button
              type="button"
              className={`tf-pill ${sortBy === 'changeLow' ? 'tf-pill--active' : ''}`}
              onClick={() => setSortBy('changeLow')}
            >
              Top Losers
            </button>
            <button
              type="button"
              className={`tf-pill ${sortBy === 'volumeHigh' ? 'tf-pill--active' : ''}`}
              onClick={() => setSortBy('volumeHigh')}
            >
              Highest Volume
            </button>
            <button
              type="button"
              className={`tf-pill ${sortBy === 'volumeLow' ? 'tf-pill--active' : ''}`}
              onClick={() => setSortBy('volumeLow')}
            >
              Lowest Volume
            </button>
          </div>
        </div>
      </div>

      <div className="grid-cards">
        {assets.length === 0 ? (
          <div className="empty-state">Loading stocks...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="empty-state">No matching stock quotes found.</div>
        ) : (
          filteredAssets.map((asset) => <AssetCard key={asset.id} asset={asset} />)
        )}
      </div>
    </section>
  );
}

export default StocksPage;