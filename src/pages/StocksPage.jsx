import { useEffect, useMemo, useState } from 'react';
import AssetCard from '../components/AssetCard';
import TradePanel from '../components/TradePanel';
import { usePortfolioStore } from '../store/portfolioStore';
import { useMarketStore } from '../store/marketStore';

function StocksPage() {
  const assets = useMarketStore((state) => state.stockAssets);
  const status = useMarketStore((state) => state.stockStatus);
  const ready = useMarketStore((state) => state.stockReady);
  const loadStockAssets = useMarketStore((state) => state.loadStockAssets);
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
  }, [syncMarketPrices]);

  useEffect(() => {
    if (ready && !selectedAssetId && assets.length > 0) {
      setSelectedAssetId(assets[0].id);
    }
  }, [assets, ready, selectedAssetId]);

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

export default StocksPage;