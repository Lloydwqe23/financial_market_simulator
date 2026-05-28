import { useEffect, useMemo } from 'react';
import AssetCard from '../components/AssetCard';
import { usePortfolioStore } from '../store/portfolioStore';
import { useMarketStore } from '../store/marketStore';

function StocksPage() {
  const assets = useMarketStore((state) => state.stockAssets);
  const status = useMarketStore((state) => state.stockStatus);
  const loadStockAssets = useMarketStore((state) => state.loadStockAssets);
  const syncMarketPrices = usePortfolioStore((state) => state.syncMarketPrices);

  useEffect(() => {
    let mounted = true;
    let refreshTimerId = 0;
    let requestInFlight = false;

    const loadAssets = async () => {
      if (requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        await loadStockAssets();
        if (!mounted) {
          return;
        }

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

  const marketSummary = useMemo(() => {
    const averageChange = assets.reduce((sum, asset) => sum + asset.change24h, 0) / assets.length;
    return Number.isFinite(averageChange) ? averageChange.toFixed(2) : '0.00';
  }, [assets]);

  return (
    <section className="surface">
      <div className="hero">
        <h2>Stocks</h2>
        <p>Public quotes for Apple, Microsoft, NVIDIA, and other companies.</p>
        <p className="asset-meta">Status: {status}</p>
        <p className="asset-meta">Average change: {marketSummary}%</p>
        <p className="asset-meta">Stocks tracked: {assets.length || '...'}</p>
      </div>

      <div className="grid-cards">
        {assets.length === 0 ? (
          <div className="empty-state">Loading stocks...</div>
        ) : (
          assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)
        )}
      </div>
    </section>
  );
}

export default StocksPage;