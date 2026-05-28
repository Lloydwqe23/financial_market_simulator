import { useEffect, useMemo } from 'react';
import AssetCard from '../components/AssetCard';
import { usePortfolioStore } from '../store/portfolioStore';
import { useMarketStore } from '../store/marketStore';

function CryptoPage() {
  const assets = useMarketStore((state) => state.cryptoAssets);
  const status = useMarketStore((state) => state.cryptoStatus);
  const loadCryptoAssets = useMarketStore((state) => state.loadCryptoAssets);
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
        await loadCryptoAssets();

        if (!mounted) {
          return;
        }

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

      <div className="grid-cards">
        {assets.length === 0 ? (
          <div className="empty-state">Loading crypto market...</div>
        ) : (
          assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)
        )}
      </div>
    </section>
  );
}

export default CryptoPage;