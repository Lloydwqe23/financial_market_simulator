import { useEffect, useMemo, useState } from 'react';
import AssetCard from '../components/AssetCard';
import { usePortfolioStore } from '../store/portfolioStore';
import { useMarketStore } from '../store/marketStore';

function CryptoPage() {
  const assets = useMarketStore((state) => state.cryptoAssets);
  const status = useMarketStore((state) => state.cryptoStatus);
  const loadCryptoAssets = useMarketStore((state) => state.loadCryptoAssets);
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
        await loadCryptoAssets();
        if (!mounted) return;
        syncMarketPrices(useMarketStore.getState().cryptoAssets);
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
  }, [loadCryptoAssets, syncMarketPrices]);

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

    if (sortBy === 'changeHigh') {
      result.sort((a, b) => b.change24h - a.change24h);
    } else if (sortBy === 'changeLow') {
      result.sort((a, b) => a.change24h - b.change24h);
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
        <h2>Crypto</h2>
        <p>Live crypto quotes updated every second.</p>
        <p className="asset-meta">Status: {status}</p>
        <p className="asset-meta">Average change: {marketSummary}%</p>
        <p className="asset-meta">Coins tracked: {assets.length || '...'}</p>
      </div>

      <div className="market-toolbar">
        <div className="filter-row-container">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <input
              type="text"
              className="market-search-input"
              placeholder="Search crypto name or symbol (e.g. BTC)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="tf-row" style={{ marginBottom: 0 }}>
            <button 
              type="button"
              className={`tf-pill ${sortBy === 'none' ? 'tf-pill--active' : ''}`}
              onClick={() => setSortBy('none')}
            >
              Default
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
          </div>
        </div>
      </div>

      <div className="grid-cards">
        {assets.length === 0 ? (
          <div className="empty-state">Loading crypto market...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="empty-state">No coins matched your filter.</div>
        ) : (
          filteredAssets.map((asset) => <AssetCard key={asset.id} asset={asset} />)
        )}
      </div>
    </section>
  );
}

export default CryptoPage;