import { useEffect, useMemo, useState } from 'react';
import AssetCard from '../components/AssetCard';
import { usePortfolioStore } from '../store/portfolioStore';
import { CURRENCIES, useMarketStore } from '../store/marketStore';

function hashCurrency(code) {
  return [...code].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 0);
}

function CurrencyPage() {
  const rates = useMarketStore((state) => state.currencyRates);
  const changes = useMarketStore((state) => state.currencyChanges);
  const status = useMarketStore((state) => state.currencyStatus);
  const ready = useMarketStore((state) => state.currencyReady);
  const loadCurrencyRates = useMarketStore((state) => state.loadCurrencyRates);
  const [selectedBase, setSelectedBase] = useState('USD');
  const [tick, setTick] = useState(0);
  const syncMarketPrices = usePortfolioStore((state) => state.syncMarketPrices);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let mounted = true;
    let refreshTimerId = 0;
    let requestInFlight = false;

    const loadRates = async () => {
      if (requestInFlight) return;
      requestInFlight = true;

      try {
        await loadCurrencyRates(selectedBase);
        if (!mounted) return;
      } catch (error) {
        if (!mounted) return;
      } finally {
        requestInFlight = false;
        if (mounted) {
          refreshTimerId = window.setTimeout(loadRates, 30000);
        }
      }
    };

    loadRates();

    return () => {
      mounted = false;
      window.clearTimeout(refreshTimerId);
    };
  }, [loadCurrencyRates, selectedBase]);

  const usdPerBase = useMemo(() => {
    if (selectedBase === 'USD') return 1;
    const value = Number(rates.usd);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [rates.usd, selectedBase]);

  const usdAnchor = useMemo(() => {
    if (selectedBase === 'USD') return 1;
    const anchorRate = rates.usd;
    return typeof anchorRate === 'number' ? anchorRate : null;
  }, [rates.usd, selectedBase]);

  const fxCards = useMemo(() => {
    if (!usdPerBase) return [];

    return CURRENCIES.filter((code) => code !== selectedBase)
      .map((code) => {
        const codeLower = code.toLowerCase();
        const baseToCodeRate = Number(rates[codeLower]);
        const pulse = Math.sin((tick + hashCurrency(`${selectedBase}-${codeLower}`)) / 6) * 0.0006;

        if (!Number.isFinite(baseToCodeRate) || baseToCodeRate <= 0) return null;

        const priceInBase = 1 / baseToCodeRate;
        const changeRaw = changes[codeLower];
        const changeRate = typeof changeRaw === 'number' && Number.isFinite(changeRaw) ? changeRaw : null;
        const changeInBase = (changeRate !== null ? -changeRate : 0) + pulse * 100;
        const priceUsd = (usdPerBase / baseToCodeRate) * (1 + pulse);

        return {
          id: `fx-${codeLower}`,
          symbol: codeLower,
          name: code,
          type: 'currency',
          price: priceInBase * (1 + pulse),
          change24h: changeInBase,
          quoteCurrency: selectedBase,
          priceUsd,
        };
      })
      .filter(Boolean);
  }, [changes, rates, selectedBase, tick, usdPerBase]);

  const filteredFxCards = useMemo(() => {
    if (searchQuery.trim() === '') return fxCards;
    const query = searchQuery.toLowerCase();
    return fxCards.filter(
      (card) => card.name.toLowerCase().includes(query) || card.symbol.toLowerCase().includes(query)
    );
  }, [fxCards, searchQuery]);

  const fxMarketAssetsUsd = useMemo(() => {
    if (!usdPerBase) return [];

    return CURRENCIES.map((code) => {
      const codeLower = code.toLowerCase();
      const baseToCodeRate = code === selectedBase ? 1 : Number(rates[codeLower]);
      const priceUsd = Number.isFinite(baseToCodeRate) && baseToCodeRate > 0 ? usdPerBase / baseToCodeRate : null;

      return {
        id: `fx-${codeLower}`,
        symbol: codeLower,
        name: code,
        type: 'currency',
        price: typeof priceUsd === 'number' && Number.isFinite(priceUsd) ? priceUsd : 0,
        change24h: 0,
      };
    }).filter((asset) => asset.price > 0);
  }, [rates, selectedBase, usdPerBase]);

  useEffect(() => {
    if (!ready || fxMarketAssetsUsd.length === 0) return;
    syncMarketPrices(fxMarketAssetsUsd);
  }, [fxMarketAssetsUsd, ready, syncMarketPrices]);

  return (
    <section className="surface">
      <div className="hero">
        <h2><h2>Currency</h2></h2>
        <p>Pick a base currency and trade FX pairs.</p>
        <p className="asset-meta">Status: {status}</p>
        <p className="asset-meta">
          1 {selectedBase} ≈ {usdAnchor === null ? '...' : `${Number(usdAnchor).toFixed(4)} USD`}
        </p>
        <p className="asset-meta">Currencies tracked: {CURRENCIES.length}</p>
      </div>

      <div className="market-toolbar">
        <div className="filter-row-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="asset-meta">Base currency:</span>
            <select 
              className="market-select"
              value={selectedBase} 
              onChange={(event) => setSelectedBase(event.target.value)}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          
          <div className="search-wrapper" style={{ maxWidth: '300px' }}>
            <input
              type="text"
              className="market-search-input"
              placeholder="Filter conversion pairs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid-cards">
        {fxCards.length === 0 ? (
          <div className="empty-state">Loading FX market...</div>
        ) : filteredFxCards.length === 0 ? (
          <div className="empty-state">No conversion currency found.</div>
        ) : (
          filteredFxCards.map((asset) => <AssetCard key={asset.id} asset={asset} />)
        )}
      </div>
    </section>
  );
}

export default CurrencyPage;