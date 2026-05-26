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

        if (!mounted) {
          return;
        }

        setAssets(liveAssets);
        setSelectedAssetId((currentId) =>
          liveAssets.some((asset) => asset.id === currentId) ? currentId : liveAssets[0].id,
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

  const selectedAsset = selectedAssetId
    ? assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null
    : null;

  const marketSummary = useMemo(() => {
    const averageChange = assets.reduce((sum, asset) => sum + asset.change24h, 0) / assets.length;
    return averageChange.toFixed(2);
  }, [assets]);

  return (
    <section className="page-grid">
      <div className="surface">
        <div className="hero">
          <h2>Market dashboard</h2>
          <p>
            Live crypto and stock quotes updated every second through public APIs.
          </p>
          <p className="asset-meta">Status: {status}</p>
          <p className="asset-meta">Average market change: {marketSummary}%</p>
          <p className="asset-meta">Assets tracked: {assets.length}</p>
        </div>

        <div className="grid-cards">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onTrade={(assetItem) => setSelectedAssetId(assetItem.id)} />
          ))}
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

export default DashboardPage;