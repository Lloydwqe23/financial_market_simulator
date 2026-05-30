import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CandleChart from '../components/CandleChart';
import TradePanel from '../components/TradePanel';
import {
  fetchBinanceKlines,
  fetchCoinGeckoMarketChart,
  fetchStockHistoryCandles,
} from '../api/marketApi';
import { CURRENCIES, useMarketStore } from '../store/marketStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useAuthStore } from '../store/authStore';

const TIMEFRAMES = [
  { value: '1m',  label: '1m',  ms: 60 * 1000,                binanceInterval: '1m'  },
  { value: '5m',  label: '5m',  ms: 5 * 60 * 1000,            binanceInterval: '5m'  },
  { value: '15m', label: '15m', ms: 15 * 60 * 1000,           binanceInterval: '15m' },
  { value: '30m', label: '30m', ms: 30 * 60 * 1000,           binanceInterval: '30m' },
  { value: '1h',  label: '1h',  ms: 60 * 60 * 1000,           binanceInterval: '1h'  },
  { value: '4h',  label: '4h',  ms: 4 * 60 * 60 * 1000,       binanceInterval: '4h'  },
  { value: '1d',  label: '1D',  ms: 24 * 60 * 60 * 1000,      binanceInterval: '1d'  },
  { value: '1w',  label: '1W',  ms: 7 * 24 * 60 * 60 * 1000,  binanceInterval: '1w'  },
  { value: '1M',  label: '1M',  ms: 30 * 24 * 60 * 60 * 1000, binanceInterval: '1M'  },
];

const PRESET_COLORS = ['#eab308', '#3b82f6', '#ec4899', '#a855f7', '#10b981', '#f43f5e', '#06b6d4'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getTimeframeConfig(value) {
  return TIMEFRAMES.find((tf) => tf.value === value) ?? TIMEFRAMES[2];
}

function getCoinGeckoDays(value) {
  switch (value) {
    case '1m':  return 1;
    case '5m':  return 7;
    case '15m':
    case '30m': return 30;
    case '1h':  return 90;
    case '4h':  return 180;
    default:    return 365;
  }
}

function hashCurrency(code) {
  return [...code].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 0);
}

function mulberry32(seed) {
  let v = seed >>> 0;
  return () => {
    v += 0x6d2b79f5;
    let t = v;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resampleDailyCandles(dailyCandles, intervalMs, seed) {
  if (!Array.isArray(dailyCandles) || dailyCandles.length === 0) return [];
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (intervalMs >= DAY_MS) {
    const buckets = new Map();
    for (const c of dailyCandles) {
      const bucket = Math.floor(c.t / intervalMs) * intervalMs;
      const existing = buckets.get(bucket);
      if (!existing) {
        buckets.set(bucket, { t: bucket, open: c.open, high: c.high, low: c.low, close: c.close });
      } else {
        existing.high  = Math.max(existing.high, c.high);
        existing.low   = Math.min(existing.low,  c.low);
        existing.close = c.close;
      }
    }
    return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
  }

  const rng      = mulberry32(seed);
  const stepsPerDay = Math.round(DAY_MS / intervalMs);
  const result   = [];

  for (const daily of dailyCandles) {
    const dayOpen  = daily.open;
    const dayClose = daily.close;
    const dayHigh  = daily.high;
    const dayLow   = daily.low;
    const range    = dayHigh - dayLow || dayOpen * 0.002;

    const rawWalk = [0];
    for (let i = 1; i < stepsPerDay; i++) {
      rawWalk.push(rawWalk[i - 1] + (rng() - 0.5));
    }
    rawWalk.push(0);

    const minW = Math.min(...rawWalk);
    const maxW = Math.max(...rawWalk);
    const walkRange = maxW - minW || 1;

    const prices = rawWalk.map((w, i) => {
      const progress = i / stepsPerDay;
      const trend    = dayOpen + (dayClose - dayOpen) * progress;
      const noise    = ((w - minW) / walkRange - 0.5) * range * 0.7;
      return clamp(trend + noise, dayLow, dayHigh);
    });
    prices[0]                  = dayOpen;
    prices[stepsPerDay - 1]    = dayClose;

    for (let i = 0; i < stepsPerDay; i++) {
      const t     = daily.t + i * intervalMs;
      const open  = prices[i];
      const close = prices[i + 1] ?? dayClose;
      const high  = Math.max(open, close) * (1 + rng() * 0.003);
      const low   = Math.min(open, close) * (1 - rng() * 0.003);
      result.push({ t, open, high: Math.min(high, dayHigh), low: Math.max(low, dayLow), close });
    }
  }
  return result;
}

function resamplePricesToCandles(prices, intervalMs) {
  const ms = Number(intervalMs);
  if (!Array.isArray(prices) || prices.length < 2 || !Number.isFinite(ms) || ms <= 0) return [];

  const points = prices
    .map((p) => ({ t: Number(p?.t), price: Number(p?.price) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) return [];

  const candles = [];
  let current   = null;

  for (const point of points) {
    const bucket = Math.floor(point.t / ms) * ms;
    if (!current || current.t !== bucket) {
      if (current) candles.push(current);
      current = { t: bucket, open: point.price, high: point.price, low: point.price, close: point.price };
      continue;
    }
    current.high  = Math.max(current.high,  point.price);
    current.low   = Math.min(current.low,   point.price);
    current.close = point.price;
  }
  if (current) candles.push(current);
  return candles;
}

function buildSyntheticCandles({ seed, endPrice, candleMs, count = 1000, baseVolatility = 0.002 }) {
  const price = Number(endPrice);
  const ms    = Number(candleMs);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ms) || ms <= 0) return [];

  const rng       = mulberry32(seed);
  const count_    = clamp(Number(count) || 0, 20, 2000);
  const hourMs    = 60 * 60 * 1000;
  const stepFactor = Math.sqrt(ms / hourMs);
  const vol       = clamp(baseVolatility * stepFactor, baseVolatility * 0.35, baseVolatility * 10);
  const wickVol   = vol * 0.8;
  const endBucket = Math.floor(Date.now() / ms) * ms;

  let close = price;
  const backwards = [];

  for (let step = 0; step < count_; step++) {
    const t     = endBucket - step * ms;
    const delta = (rng() - 0.5) * 2 * vol;
    const open  = Math.max(1e-9, close / (1 + delta));
    const bodyHigh = Math.max(open, close);
    const bodyLow  = Math.min(open, close);
    const high  = bodyHigh * (1 + rng() * wickVol);
    const low   = Math.max(1e-9, bodyLow * (1 - rng() * wickVol));
    backwards.push({ t, open, high, low, close });
    close = open;
  }
  return backwards.reverse();
}

function AssetDetailPage() {
  const navigate    = useNavigate();
  const params      = useParams();
  const assetType   = String(params.type || '').toLowerCase();
  const assetId     = decodeURIComponent(String(params.id || ''));

  const cryptoAssets     = useMarketStore((s) => s.cryptoAssets);
  const stockAssets      = useMarketStore((s) => s.stockAssets);
  const currencyBase     = useMarketStore((s) => s.currencyBase);
  const currencyRates    = useMarketStore((s) => s.currencyRates);
  const currencyChanges  = useMarketStore((s) => s.currencyChanges);
  const currencyStatus   = useMarketStore((s) => s.currencyStatus);

  const loadCryptoAssets  = useMarketStore((s) => s.loadCryptoAssets);
  const loadStockAssets   = useMarketStore((s) => s.loadStockAssets);
  const loadCurrencyRates = useMarketStore((s) => s.loadCurrencyRates);

  const balance         = usePortfolioStore((s) => s.balance);
  const buyAsset        = usePortfolioStore((s) => s.buyAsset);
  const sellAsset       = usePortfolioStore((s) => s.sellAsset);
  const syncMarketPrices = usePortfolioStore((s) => s.syncMarketPrices);
  const holdings        = usePortfolioStore((s) => s.holdings);

  const authUser = useAuthStore((s) => s.user);
  const activeUserBalance = authUser ? balance : 0;

  // Trigger Modifier Hooks
  const updatePositionTriggers = usePortfolioStore((s) => s.updatePositionTriggers);
  const [editingPositionId, setEditingPositionId] = useState(null);
  const [localSL, setLocalSL] = useState('');
  const [localTP, setLocalTP] = useState('');

  const handleOpenModifier = (holding) => {
    setEditingPositionId(holding.id);
    setLocalSL(holding.stopLoss ? String(holding.stopLoss) : '');
    setLocalTP(holding.takeProfit ? String(holding.takeProfit) : '');
  };

  const handleSaveTriggers = (positionId) => {
    updatePositionTriggers({
      positionId,
      stopLoss: localSL ? Number(localSL) : null,
      takeProfit: localTP ? Number(localTP) : null
    });
    setEditingPositionId(null);
  };

  const [timeframe, setTimeframe]       = useState('15m');
  const tfConfig   = useMemo(() => getTimeframeConfig(timeframe), [timeframe]);
  const timeframeMs = tfConfig?.ms || 15 * 60 * 1000;

  const [tick, setTick]               = useState(0);
  const [candles, setCandles]         = useState([]);
  const [historyReady, setHistoryReady] = useState(false);

  const stockDailyCache = useRef(null);
  const stockDailyCacheId = useRef(null);

  const [activeIndicators, setActiveIndicators] = useState([]);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);

  const addIndicatorInstance = (type) => {
    const defaultColor = type === 'rsi' ? '#a855f7' : type === 'macd' ? '#06b6d4' : PRESET_COLORS[activeIndicators.length % PRESET_COLORS.length];
    
    if ((type === 'rsi' || type === 'macd') && activeIndicators.some(i => i.type === type)) {
      return; 
    }

    const newInstance = {
      id: `${type}-${crypto.randomUUID().slice(0, 4)}`,
      type,
      color: defaultColor,
      ...(type === 'ma' ? { period: 20 } : {}),
      ...(type === 'bb' ? { period: 20, stdDev: 2 } : {}),
      ...(type === 'rsi' ? { period: 14 } : {}),
      ...(type === 'macd' ? { fast: 12, slow: 26, signal: 9 } : {})
    };
    setActiveIndicators((prev) => [...prev, newInstance]);
  };

  const removeIndicatorInstance = (id) => {
    setActiveIndicators((prev) => prev.filter((ind) => ind.id !== id));
  };

  const updateIndicatorParameter = (id, field, value) => {
    setActiveIndicators((prev) => prev.map((ind) => {
      if (ind.id !== id) return ind;
      return { ...ind, [field]: value };
    }));
  };

  const activeAssetHoldings = useMemo(() => {
    if (!Array.isArray(holdings)) return [];
    return holdings.filter((item) => {
      if (!item) return false;
      const positionBaseId = item.assetId || (item.id && typeof item.id === 'string' ? item.id.split('-')[0] : '');
      return positionBaseId === assetId;
    });
  }, [holdings, assetId]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setCandles([]);
    setHistoryReady(false);
  }, [assetId, assetType, currencyBase, timeframe]);

  useEffect(() => {
    let mounted   = true;
    let timerId   = 0;
    let inFlight  = false;

    const loop = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        if (assetType === 'crypto') {
          await loadCryptoAssets();
          if (mounted) syncMarketPrices(useMarketStore.getState().cryptoAssets);
        } else if (assetType === 'stock') {
          await loadStockAssets();
          if (mounted) syncMarketPrices(useMarketStore.getState().stockAssets);
        } else if (assetType === 'currency') {
          await loadCurrencyRates(currencyBase || 'USD');
          if (mounted) {
            const base        = currencyBase || 'USD';
            const usdPerBase  = base === 'USD' ? 1 : Number(useMarketStore.getState().currencyRates?.usd);
            const okUsdBase   = Number.isFinite(usdPerBase) && usdPerBase > 0 ? usdPerBase : null;
            if (okUsdBase) {
              const fxAssets = CURRENCIES.map((code) => {
                const codeLow    = code.toLowerCase();
                const baseToCode = Number(useMarketStore.getState().currencyRates?.[codeLow]);
                const priceUsd   = Number.isFinite(baseToCode) && baseToCode > 0 ? okUsdBase / baseToCode : null;
                return { id: `fx-${codeLow}`, symbol: codeLow, name: code, type: 'currency', price: priceUsd || 0, change24h: 0 };
              }).filter((a) => a.price > 0);
              syncMarketPrices(fxAssets);
            }
          }
        }
      } finally {
        inFlight = false;
        if (mounted) {
          timerId = window.setTimeout(loop, assetType === 'currency' ? 30000 : 1000);
        }
      }
    };
    loop();
    return () => { mounted = false; window.clearTimeout(timerId); };
  }, [assetType, currencyBase, loadCryptoAssets, loadCurrencyRates, loadStockAssets, syncMarketPrices]);

  const displayAsset = useMemo(() => {
    if (assetType === 'crypto')  return cryptoAssets.find((a) => a.id === assetId) ?? null;
    if (assetType === 'stock')   return stockAssets.find((a) => a.id === assetId) ?? null;
    if (assetType === 'currency') {
      const codeLow = assetId.replace(/^fx-/, '').toLowerCase();
      const base    = currencyBase || 'USD';
      if (codeLow === base.toLowerCase()) {
        return { id: `fx-${codeLow}`, symbol: codeLow, name: codeLow.toUpperCase(), type: 'currency', price: 1, change24h: 0, quoteCurrency: base, priceUsd: base === 'USD' ? 1 : Number(currencyRates?.usd) || 0 };
      }
      const baseToCode   = Number(currencyRates?.[codeLow]);
      if (!Number.isFinite(baseToCode) || baseToCode <= 0) return null;
      const usdPerBase   = base === 'USD' ? 1 : Number(currencyRates?.usd);
      const okUsdPerBase = Number.isFinite(usdPerBase) && usdPerBase > 0 ? usdPerBase : null;
      if (!okUsdPerBase) return null;
      const pulse        = Math.sin((tick + hashCurrency(`${base}-${codeLow}`)) / 6) * 0.0006;
      return { id: `fx-${codeLow}`, symbol: codeLow, name: codeLow.toUpperCase(), type: 'currency', price: (1 / baseToCode) * (1 + pulse), change24h: (-Number(currencyChanges?.[codeLow] || 0)) + pulse * 100, quoteCurrency: base, priceUsd: (okUsdPerBase / baseToCode) * (1 + pulse) };
    }
    return null;
  }, [assetId, assetType, cryptoAssets, currencyBase, currencyChanges, currencyRates, stockAssets, tick]);

  const historyKey = useMemo(() => `${assetType}:${assetId}:${timeframe}`, [assetId, assetType, timeframe]);

  useEffect(() => {
    let mounted = true;
    const loadHistory = async () => {
      if (!displayAsset || !tfConfig) return;
      try {
        if (assetType === 'crypto') {
          const isBinance = typeof displayAsset.quoteVolume === 'number' && Number.isFinite(displayAsset.quoteVolume);
          if (isBinance) {
            const klines = await fetchBinanceKlines({ symbol: `${String(displayAsset.name).toUpperCase()}USDT`, interval: tfConfig.binanceInterval, limit: 1000 });
            if (mounted) { setCandles(klines); setHistoryReady(true); }
            return;
          }
          const prices = await fetchCoinGeckoMarketChart({ id: String(displayAsset.id), days: getCoinGeckoDays(tfConfig.value) });
          const next   = resamplePricesToCandles(prices, timeframeMs);
          if (mounted) { setCandles(next); setHistoryReady(true); }
          return;
        }
        if (assetType === 'stock') {
          let dailyCandles = (stockDailyCacheId.current === assetId) ? stockDailyCache.current : null;
          if (!dailyCandles) {
            try {
              dailyCandles = await fetchStockHistoryCandles({ id: assetId, limit: 800 });
              if (mounted) { stockDailyCache.current = dailyCandles; stockDailyCacheId.current = assetId; }
            } catch { dailyCandles = null; }
          }
          if (dailyCandles && dailyCandles.length >= 2) {
            const resampled = resampleDailyCandles(dailyCandles, timeframeMs, hashCurrency(`stock:${assetId}:${timeframe}`));
            if (mounted) { setCandles(resampled); setHistoryReady(true); }
            return;
          }
          const synthetic = buildSyntheticCandles({ seed: hashCurrency(`stock:${assetId}:${timeframe}:synth`), endPrice: Number(displayAsset.price), candleMs: timeframeMs });
          if (mounted) { setCandles(synthetic); setHistoryReady(true); }
          return;
        }
        if (assetType === 'currency') {
          const baseCandles = buildSyntheticCandles({ seed: hashCurrency(`${currencyBase || 'usd'}:${assetId}:${timeframe}`), endPrice: Number(displayAsset.price), candleMs: timeframeMs });
          if (mounted) { setCandles(baseCandles); setHistoryReady(true); }
          return;
        }
      } catch (error) {
        if (!mounted) return;
        setCandles(buildSyntheticCandles({ seed: hashCurrency(`${assetType}:${assetId}`), endPrice: Number(displayAsset?.price || 0), candleMs: timeframeMs }));
        setHistoryReady(true);
      }
    };
    loadHistory();
    return () => { mounted = false; };
  }, [assetType, historyKey, displayAsset, tfConfig, timeframeMs, currencyBase, assetId, timeframe]);

  useEffect(() => {
    if (!historyReady || !displayAsset || !timeframeMs) return;
    const price = Number(displayAsset.price);
    if (!Number.isFinite(price) || price <= 0) return;

    const bucket = Math.floor(Date.now() / timeframeMs) * timeframeMs;

    setCandles((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (!last) return prev;

      if (Number(last.t) === bucket) {
        return [...prev.slice(0, -1), { ...last, close: price, high: Math.max(Number(last.high) || price, price), low: Math.min(Number(last.low) || price, price) }];
      }
      return [...prev, { t: bucket, open: last.close, high: price, low: price, close: price }].slice(-2000);
    });
  }, [displayAsset, historyReady, tick, timeframeMs]);

  const quoteCurrency = displayAsset?.type === 'currency' && typeof displayAsset.quoteCurrency === 'string' ? displayAsset.quoteCurrency : '';

  const balanceInQuote = useMemo(() => {
    if (assetType !== 'currency' || !quoteCurrency) return activeUserBalance;
    const usdPerBase = quoteCurrency === 'USD' ? 1 : Number(currencyRates?.usd || 1);
    return activeUserBalance / usdPerBase;
  }, [assetType, activeUserBalance, currencyRates?.usd, quoteCurrency]);

  if (!historyReady || !displayAsset || candles.length === 0) {
    return (
      <section className="surface" style={{ display: 'grid', placeItems: 'center', minHeight: '500px' }}>
        <div className="empty-state">Synchronizing secure asset data feeds...</div>
      </section>
    );
  }

  return (
    <section className="section-list">
      <div className="surface">
        <div className="asset-toolbar">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
        <div className="hero" style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 4 }}>{displayAsset.type === 'currency' && quoteCurrency ? `${displayAsset.name} / ${quoteCurrency.toUpperCase()}` : displayAsset.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="price">{displayAsset.type === 'currency' && quoteCurrency ? `${Number(displayAsset.price).toFixed(4)} ${quoteCurrency.toUpperCase()}` : `$${Number(displayAsset.price).toFixed(2)}`}</span>
            {Number.isFinite(displayAsset.change24h) && (
              <span className={`asset-meta ${displayAsset.change24h >= 0 ? 'positive' : 'negative'}`}>
                {displayAsset.change24h >= 0 ? '+' : ''}{Number(displayAsset.change24h).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="tf-row" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {TIMEFRAMES.map((tf) => (
              <button key={tf.value} type="button" className={`tf-pill ${timeframe === tf.value ? 'tf-pill--active' : ''}`} onClick={() => setTimeframe(tf.value)}>
                {tf.label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative' }}>
            <button 
              type="button" 
              className="tf-pill" 
              style={{ borderColor: activeIndicators.length > 0 ? 'var(--accent)' : 'var(--border)', color: activeIndicators.length > 0 ? 'var(--accent)' : 'var(--text)' }}
              onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
            >
              📊 Analysis Tools {activeIndicators.length > 0 ? `(${activeIndicators.length})` : ''}
            </button>

            {showIndicatorMenu && (
              <div 
                className="helper-box" 
                style={{ 
                  position: 'absolute', right: 0, top: '40px', zIndex: 110, width: '330px', 
                  background: 'rgba(7, 17, 31, 0.98)', backdropFilter: 'blur(10px)',
                  boxShadow: 'var(--shadow)', padding: '14px', display: 'grid', gap: '10px',
                  maxHeight: '480px', overflowY: 'auto'
                }}
              >
                <strong style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Add Chart Tools</strong>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button type="button" className="primary-button" style={{ fontSize: '0.75rem', padding: '6px 10px', flex: '1 1 auto' }} onClick={() => addIndicatorInstance('ma')}>+ MA</button>
                  <button type="button" className="primary-button" style={{ fontSize: '0.75rem', padding: '6px 10px', flex: '1 1 auto' }} onClick={() => addIndicatorInstance('bb')}>+ Bands</button>
                  <button type="button" className="primary-button" style={{ fontSize: '0.75rem', padding: '6px 10px', flex: '1 1 auto' }} onClick={() => addIndicatorInstance('rsi')}>+ RSI</button>
                  <button type="button" className="primary-button" style={{ fontSize: '0.75rem', padding: '6px 10px', flex: '1 1 auto' }} onClick={() => addIndicatorInstance('macd')}>+ MACD</button>
                </div>

                {activeIndicators.length > 0 && (
                  <>
                    <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                    <strong style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Active Chart Layers</strong>
                    
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {activeIndicators.map((ind) => (
                        <div 
                          key={ind.id} 
                          style={{ 
                            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', 
                            borderRadius: '8px', padding: '8px', display: 'grid', gap: '6px' 
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: ind.color }}>
                              {ind.type === 'ma' && '🎨 Moving Average'}
                              {ind.type === 'bb' && '░ Bollinger Bands'}
                              {ind.type === 'rsi' && '⚛ Relative Strength Index (RSI)'}
                              {ind.type === 'macd' && '⚡ MACD'}
                            </span>
                            <button 
                              type="button" 
                              style={{ background: 'transparent', border: 0, color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem' }}
                              onClick={() => removeIndicatorInstance(ind.id)}
                            >
                              ✕ Remove
                            </button>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                            {(ind.type === 'ma' || ind.type === 'bb' || ind.type === 'rsi') && (
                              <label style={{ flex: '1 1 70px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                Period
                                <input 
                                  type="number" 
                                  className="market-search-input"
                                  style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                                  min="2" max="500"
                                  value={ind.period} 
                                  onChange={(e) => updateIndicatorParameter(ind.id, 'period', Math.max(2, Number(e.target.value)))}
                                />
                              </label>
                            )}

                            {ind.type === 'bb' && (
                              <label style={{ flex: '1 1 70px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                Std Dev
                                <input 
                                  type="number" 
                                  className="market-search-input"
                                  style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                                  min="0.5" max="5" step="0.5"
                                  value={ind.stdDev} 
                                  onChange={(e) => updateIndicatorParameter(ind.id, 'stdDev', Number(e.target.value))}
                                />
                              </label>
                            )}

                            {ind.type === 'macd' && (
                              <>
                                <label style={{ flex: '1 1 50px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  Fast
                                  <input type="number" className="market-search-input" style={{ padding: '4px 6px', fontSize: '0.8rem' }} min="3" max="100" value={ind.fast} onChange={(e) => updateIndicatorParameter(ind.id, 'fast', Number(e.target.value))} />
                                </label>
                                <label style={{ flex: '1 1 50px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  Slow
                                  <input type="number" className="market-search-input" style={{ padding: '4px 6px', fontSize: '0.8rem' }} min="5" max="200" value={ind.slow} onChange={(e) => updateIndicatorParameter(ind.id, 'slow', Number(e.target.value))} />
                                </label>
                                <label style={{ flex: '1 1 50px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  Signal
                                  <input type="number" className="market-search-input" style={{ padding: '4px 6px', fontSize: '0.8rem' }} min="2" max="50" value={ind.signal} onChange={(e) => updateIndicatorParameter(ind.id, 'signal', Number(e.target.value))} />
                                </label>
                              </>
                            )}

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: 'auto' }}>
                              Color
                              <input 
                                type="color" 
                                style={{ width: '28px', height: '22px', border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}
                                value={ind.color} 
                                onChange={(e) => updateIndicatorParameter(ind.id, 'color', e.target.value)}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button type="button" className="secondary-button" style={{ fontSize: '0.7rem', padding: '6px', marginTop: '4px' }} onClick={() => setActiveIndicators([])}>
                      Clear All Tools
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <CandleChart candles={candles} activeIndicators={activeIndicators} />
      </div>

      <div className="surface">
        <h3>Your Active {displayAsset.name} Positions</h3>
        {activeAssetHoldings.length === 0 ? (
          <div className="empty-state">You do not hold any active spot positions or open futures contracts.</div>
        ) : (
          <div className="section-list">
            {activeAssetHoldings.map((holding) => {
              const isFutures = holding.instrumentType === 'futures';
              const isEditing = editingPositionId === holding.id;

              let displayPnL = 0;
              let totalDisplayValue = 0;

              if (isFutures) {
                displayPnL = holding.unrealizedPnL || 0;
                totalDisplayValue = (holding.margin || 0) + displayPnL;
              } else {
                totalDisplayValue = (holding.quantity || 0) * Number(holding.currentPrice || 0);
                const costBasis = (holding.quantity || 0) * Number(holding.averagePrice || 0);
                displayPnL = totalDisplayValue - costBasis;
              }

              const pnlClass = displayPnL >= 0 ? 'positive' : 'negative';
              const pnlSign = displayPnL >= 0 ? '+' : '';

              return (
                <div key={holding.id} className="section-list" style={{ background: 'rgba(255, 255, 255, 0.01)', padding: '12px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '8px' }}>
                  <div className="list-item" style={{ border: '0', background: 'transparent', padding: 0, borderLeft: `4px solid ${isFutures ? 'var(--auth-accent)' : 'var(--accent)'}`, paddingLeft: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ textTransform: 'uppercase' }}>{holding.symbol}</strong>
                        <span className="auth-pill" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                          {isFutures ? `${holding.direction.toUpperCase()} ${holding.leverage}x FUTURES` : 'SPOT'}
                        </span>
                      </div>
                      <small style={{ marginTop: '4px', display: 'block' }}>
                        {isFutures 
                          ? `Size: ${holding.quantity || 0} | Avg Entry: $${Number(holding.averagePrice || 0).toFixed(2)} | Current: $${Number(holding.currentPrice || 0).toFixed(2)}`
                          : `Quantity: ${holding.quantity || 0} | Avg Cost: $${Number(holding.averagePrice || 0).toFixed(2)} | Current Price: $${Number(holding.currentPrice || 0).toFixed(2)}`
                        }
                      </small>
                      {isFutures && (
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <small style={{ color: 'var(--danger)' }}>⚠️ Liquidation Price: ${Number(holding.liquidationPrice || 0).toFixed(2)}</small>
                          <small style={{ color: holding.takeProfit ? 'var(--accent)' : 'var(--muted)' }}>🎯 Take Profit Target: {holding.takeProfit ? `$${Number(holding.takeProfit).toFixed(2)}` : 'None Configured'}</small>
                          <small style={{ color: holding.stopLoss ? '#ff9e9e' : 'var(--muted)' }}>🛑 Stop Loss Safety: {holding.stopLoss ? `$${Number(holding.stopLoss).toFixed(2)}` : 'None Configured'}</small>
                        </div>
                      )}
                    </div>
                    
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong>${totalDisplayValue.toFixed(2)}</strong>
                      <span className={pnlClass} style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                        {pnlSign}${displayPnL.toFixed(2)} PnL
                      </span>
                      {isFutures && !isEditing && (
                        <button type="button" className="tf-pill" style={{ fontSize: '0.7rem', padding: '3px 8px', alignSelf: 'flex-end', marginTop: '4px' }} onClick={() => handleOpenModifier(holding)}>
                          ⚙️ Edit Limits
                        </button>
                      )}
                    </div>
                  </div>

                  {isFutures && isEditing && (
                    <div className="helper-box" style={{ marginTop: '12px', background: 'rgba(2, 8, 20, 0.8)', borderColor: 'var(--border)', display: 'grid', gap: '10px' }}>
                      <strong style={{ fontSize: '0.85rem' }}>Modify Triggers</strong>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <label style={{ flex: 1, fontSize: '0.8rem', display: 'grid', gap: '4px' }}>
                          Take Profit Price ($)
                          <input type="number" className="market-search-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={localTP} onChange={(e) => setLocalTP(e.target.value)} />
                        </label>
                        <label style={{ flex: 1, fontSize: '0.8rem', display: 'grid', gap: '4px' }}>
                          Stop Loss Price ($)
                          <input type="number" className="market-search-input" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={localSL} onChange={(e) => setLocalSL(e.target.value)} />
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button type="button" className="ghost-button" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setEditingPositionId(null)}>Cancel</button>
                        <button type="button" className="primary-button" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleSaveTriggers(holding.id)}>Save Changes</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TradePanel
        asset={displayAsset}
        balance={balanceInQuote}
        quoteCurrency={assetType === 'currency' ? quoteCurrency : ''}
        onClose={() => navigate(-1)}
        onBuy={(amount, type, options) => {
          if (!displayAsset) return;
          let target = { ...displayAsset };
          if (displayAsset.type === 'currency' && Number.isFinite(displayAsset.priceUsd)) target.price = displayAsset.priceUsd;
          buyAsset({ asset: target, amount, instrumentType: type, futuresOptions: options });
        }}
        onSell={(amount, type, options) => {
          if (!displayAsset) return;
          let target = { ...displayAsset };
          if (displayAsset.type === 'currency' && Number.isFinite(displayAsset.priceUsd)) target.price = displayAsset.priceUsd;
          sellAsset({ asset: target, amount, instrumentType: type });
        }}
      />
    </section>
  );
}

export default AssetDetailPage;