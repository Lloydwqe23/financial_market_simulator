import { useEffect, useMemo, useState } from 'react';
import AssetCard from '../components/AssetCard';
import TradePanel from '../components/TradePanel';
import { usePortfolioStore } from '../store/portfolioStore';
import { useMarketStore } from '../store/marketStore';

function CryptoPage() {
  const assets = useMarketStore((state) => state.cryptoAssets);
  const status = useMarketStore((state) => state.cryptoStatus);
  const ready = useMarketStore((state) => state.cryptoReady);
  const loadCryptoAssets = useMarketStore((state) => state.loadCryptoAssets);
  const [selectedAssetId, setSelectedAssetId] = useState('');
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
  }, [syncMarketPrices]);

  const selectedAsset = selectedAssetId
    ? assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null
    : assets[0] ?? null;

  const marketSummary = useMemo(() => {
    const averageChange = assets.reduce((sum, asset) => sum + asset.change24h, 0) / assets.length;
    return Number.isFinite(averageChange) ? averageChange.toFixed(2) : '0.00';
  }, [assets]);

  return (
    <section className="page-grid">
      <div className="surface">
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
            assets.map((asset) => (
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
          onBuy={(amount) => buyAsset({ asset: selectedAsset, amount })}
          onSell={(amount) => sellAsset({ asset: selectedAsset, amount })}
        />

        <div className="surface">
          <h3>Latest message</h3>
          <p>{lastMessage}</p>
        </div>
      </div>
    </section>
  );
}

export default CryptoPage;