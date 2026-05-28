import { useEffect, useMemo, useState } from 'react';
import AssetCard from '../components/AssetCard';
import TradePanel from '../components/TradePanel';
import { fetchCoinGeckoAssets, fetchLiveCryptoAssets, fetchLiveStockAssets } from '../api/marketApi';
import { FALLBACK_ASSETS } from '../data/marketAssets';
import { usePortfolioStore } from '../store/portfolioStore';

function DashboardPage() {
  const [assets, setAssets] = useState(FALLBACK_ASSETS);
  const [selectedAssetId, setSelectedAssetId] = useState(FALLBACK_ASSETS[0].id);
  const [status, setStatus] = useState('Loading market...');
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'crypto' | 'stock'
  const [sortBy, setSortBy] = useState('none'); // 'none' | 'name' | 'changeHigh' | 'changeLow'

  const balance = usePortfolioStore((state) => state.balance);
  const buyAsset = usePortfolioStore((state) => state.buyAsset);
  const sellAsset = usePortfolioStore((state) => state.sellAsset);
  const syncMarketPrices = usePortfolioStore((state) => state.syncMarketPrices);
  const lastMessage = usePortfolioStore((state) => state.lastMessage);

  useEffect(() => {
    let mounted = true;
    let refreshTimerId = 0;
    let requestInFlight = false;

    const loadAssets = async () => {
      if (requestInFlight) return;
      requestInFlight = true;

      try {
        const [cryptoResult, stockResult] = await Promise.allSettled([
          fetchLiveCryptoAssets(),
          fetchLiveStockAssets(),
        ]);

        let cryptoAssets = [];
        let stockAssets = [];
        let sourceLabel = [];

        if (cryptoResult.status === 'fulfilled') {
          cryptoAssets = cryptoResult.value;
          sourceLabel.push('Binance');
        } else {
          try {
            cryptoAssets = await fetchCoinGeckoAssets();
            sourceLabel.push('CoinGecko fallback');
          } catch (fallbackError) {
            cryptoAssets = FALLBACK_ASSETS.filter((asset) => asset.type === 'crypto');
            sourceLabel.push('local crypto fallback');
          }
        }

        if (stockResult.status === 'fulfilled') {
          stockAssets = stockResult.value;
          sourceLabel.push('Yahoo Finance');
        } else {
          stockAssets = [];
          sourceLabel.push('stocks unavailable');
        }

        const liveAssets = [...cryptoAssets, ...stockAssets];

        if (!mounted) return;

        setAssets(liveAssets);
        setSelectedAssetId((currentId) =>
          liveAssets.some((asset) => asset.id === currentId) ? currentId : liveAssets[0]?.id || '',
        );
        syncMarketPrices(liveAssets);
        setStatus(`${sourceLabel.join(' • ')} • ${new Date().toLocaleTimeString('en-US')}`);
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
  }, [syncMarketPrices]);

  // Compute filtered and sorted assets dynamically
  const filteredAssets = useMemo(() => {
    let result = [...assets];

    // 1. Text Search Filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (asset) =>
          asset.name.toLowerCase().includes(query) ||
          asset.symbol.toLowerCase().includes(query)
      );
    }

    // 2. Type Filter
    if (typeFilter !== 'all') {
      result = result.filter((asset) => asset.type === typeFilter);
    }

    // 3. Sorting Rules
    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'changeHigh') {
      result.sort((a, b) => b.change24h - a.change24h);
    } else if (sortBy === 'changeLow') {
      result.sort((a, b) => a.change24h - b.change24h);
    }

    return result;
  }, [assets, searchQuery, typeFilter, sortBy]);

  const selectedAsset = selectedAssetId
    ? assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null
    : null;

  const marketSummary = useMemo(() => {
    if (assets.length === 0) return '0.00';
    const averageChange = assets.reduce((sum, asset) => sum + asset.change24h, 0) / assets.length;
    return averageChange.toFixed(2);
  }, [assets]);

  return (
    <section className="page-grid">
      <div className="surface">
        <div className="hero">
          <h2>Market dashboard</h2>
          <p>Live crypto and stock quotes updated every second through public APIs.</p>
          <p className="asset-meta">Status: {status}</p>
          <p className="asset-meta">Average market change: {marketSummary}%</p>
          <p className="asset-meta">Assets tracked: {assets.length}</p>
        </div>

        {/* Toolbar Controls */}
        <div className="market-toolbar">
          <div className="search-wrapper">
            <input
              type="text"
              className="market-search-input"
              placeholder="Search asset or ticker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-row-container">
            {/* Type Filter using your beautiful active/inactive pill buttons */}
            <div className="tf-row" style={{ marginBottom: 0 }}>
              <button 
                type="button"
                className={`tf-pill ${typeFilter === 'all' ? 'tf-pill--active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All Assets
              </button>
              <button 
                type="button"
                className={`tf-pill ${typeFilter === 'crypto' ? 'tf-pill--active' : ''}`}
                onClick={() => setTypeFilter('crypto')}
              >
                Crypto
              </button>
              <button 
                type="button"
                className={`tf-pill ${typeFilter === 'stock' ? 'tf-pill--active' : ''}`}
                onClick={() => setTypeFilter('stock')}
              >
                Stocks
              </button>
            </div>

            {/* Dropdown sorting selector matches your native .chart-controls style */}
            <select 
              className="market-select"
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="none">Sort By</option>
              <option value="name">Name (A-Z)</option>
              <option value="changeHigh">Top Gainers</option>
              <option value="changeLow">Top Losers</option>
            </select>
          </div>
        </div>

        <div className="grid-cards">
          {filteredAssets.length === 0 ? (
            <div className="empty-state">No assets found matching your criteria.</div>
          ) : (
            filteredAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onTrade={(assetItem) => setSelectedAssetId(assetItem.id)} />
            ))
          )}
        </div>
      </div>

      <div className="section-list">
        <TradePanel
          asset={selectedAsset}
          balance={balance}
          onClose={() => setSelectedAssetId('')}
          
          // Update these two lines to pass all 3 parameters down to the Zustand store:
          onBuy={(amount, type, options) => 
            buyAsset({ 
              asset: selectedAsset, 
              amount, 
              instrumentType: type, 
              futuresOptions: options 
            })
          }
          onSell={(amount, type, options) => 
            sellAsset({ 
              asset: selectedAsset, 
              amount, 
              instrumentType: type, 
              futuresOptions: options 
            })
          }
        />

        <div className="surface">
          <h3>Latest message</h3>
          <p>{lastMessage}</p>
        </div>
      </div>
    </section>
  );
}

export default DashboardPage;