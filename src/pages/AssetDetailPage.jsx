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

/**
 * Given an array of daily OHLC candles, resample/synthesize to a finer timeframe.
 * For timeframes coarser than or equal to 1d, just aggregate daily candles into
 * weekly/monthly buckets. For intraday timeframes, interpolate inside each daily
 * candle using a seeded RNG so the result is stable across re-renders.
 */
function resampleDailyCandles(dailyCandles, intervalMs, seed) {
  if (!Array.isArray(dailyCandles) || dailyCandles.length === 0) return [];

  const DAY_MS = 24 * 60 * 60 * 1000;

  // ── Coarser-than-daily: aggregate ──────────────────────────────────────────
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

  // ── Intraday: synthesise sub-candles from each daily candle ────────────────
  const rng      = mulberry32(seed);
  const stepsPerDay = Math.round(DAY_MS / intervalMs);
  const result   = [];

  for (const daily of dailyCandles) {
    // distribute the day's move across intraday steps with a random walk
    const dayOpen  = daily.open;
    const dayClose = daily.close;
    const dayHigh  = daily.high;
    const dayLow   = daily.low;
    const range    = dayHigh - dayLow || dayOpen * 0.002;

    // build a tiny random walk that starts at open and ends at close
    const rawWalk = [0];
    for (let i = 1; i < stepsPerDay; i++) {
      rawWalk.push(rawWalk[i - 1] + (rng() - 0.5));
    }
    rawWalk.push(0); // anchor end to zero before scaling

    const minW = Math.min(...rawWalk);
    const maxW = Math.max(...rawWalk);
    const walkRange = maxW - minW || 1;

    // scale walk so it fits within day's high/low
    const prices = rawWalk.map((w, i) => {
      const progress = i / (stepsPerDay);
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

// ─────────────────────────────────────────────────────────────────────────────

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

  // ─── PLACE SNIPPET 1 HERE (STORE ACTION HOOK) ───
  const updatePositionTriggers = usePortfolioStore((s) => s.updatePositionTriggers);

  // ─── PLACE SNIPPET 2 HERE (LOCAL MODAL COMPONENT STATE) ───
  const [editingPositionId, setEditingPositionId] = useState(null);
  const [localSL, setLocalSL] = useState('');
  const [localTP, setLocalTP] = useState('');

  // ─── PLACE SNIPPET 3 HERE (THE CONTROLLER FUNCTIONS) ───
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
    setEditingPositionId(null); // Close modification menu
  };

  const [timeframe, setTimeframe]       = useState('15m');
  const tfConfig   = useMemo(() => getTimeframeConfig(timeframe), [timeframe]);
  const timeframeMs = tfConfig.ms;

  const [tick, setTick]               = useState(0);
  const [candles, setCandles]         = useState([]);
  const [historyReady, setHistoryReady] = useState(false);

  // Cache of raw daily stock candles so we don't re-fetch on every TF switch
  const stockDailyCache = useRef(null);
  const stockDailyCacheId = useRef(null);

  // ── Live tick every second ──────────────────────────────────────────────────
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── Reset on asset / currency change (not timeframe — handled separately) ──
  useEffect(() => {
    setCandles([]);
    setHistoryReady(false);
  }, [assetId, assetType, currencyBase]);

  // ── Reset history when timeframe changes (keep cache for stocks) ────────────
  useEffect(() => {
    setCandles([]);
    setHistoryReady(false);
  }, [timeframe]);

  // ── Market data refresh loop ────────────────────────────────────────────────
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
                const priceUsd   = Number.isFinite(baseToCode) && baseToCode > 0
                  ? okUsdBase / baseToCode : null;
                return { id: `fx-${codeLow}`, symbol: codeLow, name: code, type: 'currency',
                         price: typeof priceUsd === 'number' && Number.isFinite(priceUsd) ? priceUsd : 0,
                         change24h: 0 };
              }).filter((a) => a.price > 0);
              syncMarketPrices(fxAssets);
            }
          }
        }
      } finally {
        inFlight = false;
        if (mounted) {
          const delay = assetType === 'currency' ? 30000 : 1000;
          timerId = window.setTimeout(loop, delay);
        }
      }
    };

    loop();
    return () => { mounted = false; window.clearTimeout(timerId); };
  }, [assetType, currencyBase, loadCryptoAssets, loadCurrencyRates, loadStockAssets, syncMarketPrices]);

  // ── Derived display asset ───────────────────────────────────────────────────
  const displayAsset = useMemo(() => {
    if (assetType === 'crypto')  return cryptoAssets.find((a) => a.id === assetId) ?? null;
    if (assetType === 'stock')   return stockAssets.find((a) => a.id === assetId) ?? null;
    if (assetType === 'currency') {
      const codeLow = assetId.replace(/^fx-/, '').toLowerCase();
      const base    = currencyBase || 'USD';
      if (codeLow === base.toLowerCase()) {
        return { id: `fx-${codeLow}`, symbol: codeLow, name: codeLow.toUpperCase(),
                 type: 'currency', price: 1, change24h: 0, quoteCurrency: base,
                 priceUsd: base === 'USD' ? 1 : Number(currencyRates?.usd) || 0 };
      }
      const baseToCode   = Number(currencyRates?.[codeLow]);
      if (!Number.isFinite(baseToCode) || baseToCode <= 0) return null;
      const usdPerBase   = base === 'USD' ? 1 : Number(currencyRates?.usd);
      const okUsdPerBase = Number.isFinite(usdPerBase) && usdPerBase > 0 ? usdPerBase : null;
      if (!okUsdPerBase) return null;
      const pulse        = Math.sin((tick + hashCurrency(`${base}-${codeLow}`)) / 6) * 0.0006;
      const priceInBase  = (1 / baseToCode) * (1 + pulse);
      const priceUsd     = (okUsdPerBase / baseToCode) * (1 + pulse);
      const changeRaw    = currencyChanges?.[codeLow];
      const changeRate   = typeof changeRaw === 'number' && Number.isFinite(changeRaw) ? changeRaw : null;
      const changeInBase = (changeRate !== null ? -changeRate : 0) + pulse * 100;
      return { id: `fx-${codeLow}`, symbol: codeLow, name: codeLow.toUpperCase(),
               type: 'currency', price: priceInBase, change24h: changeInBase,
               quoteCurrency: base, priceUsd };
    }
    return null;
  }, [assetId, assetType, cryptoAssets, currencyBase, currencyChanges, currencyRates, stockAssets, tick]);


  const holdings = usePortfolioStore((state) => state.holdings);

  const activeAssetHoldings = useMemo(() => {
    return holdings.filter((item) => {
      // FIX: Parse the prefix out of composite contract strings safely
      const positionBaseId = item.assetId || item.id.split('-')[0];
      return positionBaseId === assetId;
    });
  }, [holdings, assetId]);

  // ── History key (triggers reload when asset/TF/currency changes) ────────────
  const historyKey = useMemo(() => {
    if (assetType === 'currency')
      return `${assetType}:${assetId}:${String(currencyBase || 'USD').toLowerCase()}:${timeframe}`;
    return `${assetType}:${assetId}:${timeframe}`;
  }, [assetId, assetType, currencyBase, timeframe]);

  // ── History load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      if (!displayAsset) return;

      try {
        // ── CRYPTO ──────────────────────────────────────────────────────────
        if (assetType === 'crypto') {
          const isBinance = typeof displayAsset.quoteVolume === 'number' &&
                            Number.isFinite(displayAsset.quoteVolume);
          if (isBinance) {
            const symbol = `${String(displayAsset.name || '').toUpperCase()}USDT`;
            const klines = await fetchBinanceKlines({
              symbol,
              interval: tfConfig.binanceInterval,
              limit: 1000,
            });
            if (!mounted) return;
            setCandles(klines);
            setHistoryReady(true);
            return;
          }
          const days   = getCoinGeckoDays(tfConfig.value);
          const prices = await fetchCoinGeckoMarketChart({ id: String(displayAsset.id), days });
          const next   = resamplePricesToCandles(prices, timeframeMs);
          if (!mounted) return;
          setCandles(next);
          setHistoryReady(true);
          return;
        }

        // ── STOCK ────────────────────────────────────────────────────────────
        // Fetch (or reuse cached) real daily candles, then resample to chosen TF
        if (assetType === 'stock') {
          let dailyCandles = null;

          if (stockDailyCacheId.current === assetId && stockDailyCache.current) {
            dailyCandles = stockDailyCache.current;
          } else {
            try {
              dailyCandles = await fetchStockHistoryCandles({ id: assetId, limit: 800 });
              if (!mounted) return;
              stockDailyCache.current   = dailyCandles;
              stockDailyCacheId.current = assetId;
            } catch {
              dailyCandles = null;
            }
          }

          if (dailyCandles && dailyCandles.length >= 2) {
            const seed        = hashCurrency(`stock:${assetId}:${timeframe}`);
            const resampled   = resampleDailyCandles(dailyCandles, timeframeMs, seed);
            if (!mounted) return;
            setCandles(resampled);
            setHistoryReady(true);
            return;
          }

          // Fallback: purely synthetic if API failed
          const seed      = hashCurrency(`stock:${assetId}:${timeframe}:synth`);
          const synthetic = buildSyntheticCandles({
            seed,
            endPrice:      Number(displayAsset.price),
            candleMs:      timeframeMs,
            count:         1000,
            baseVolatility: 0.0018,
          });
          if (!mounted) return;
          setCandles(synthetic);
          setHistoryReady(true);
          return;
        }

        // ── CURRENCY ─────────────────────────────────────────────────────────
        if (assetType === 'currency') {
          const seed       = hashCurrency(`${currencyBase || 'usd'}:${assetId}:${timeframe}`);
          const baseCandles = buildSyntheticCandles({
            seed,
            endPrice:      Number(displayAsset.price),
            candleMs:      timeframeMs,
            count:         1000,
            baseVolatility: 0.001,
          });
          if (!mounted) return;
          setCandles(baseCandles);
          setHistoryReady(true);
          return;
        }

        if (mounted) setHistoryReady(true);
      } catch (error) {
        if (!mounted) return;
        const seed     = hashCurrency(`${assetType}:${assetId}`);
        const fallback = buildSyntheticCandles({
          seed,
          endPrice:      Number(displayAsset?.price || 0),
          candleMs:      timeframeMs,
          count:         1000,
          baseVolatility: 0.002,
        });
        setCandles(fallback);
        setHistoryReady(true);
      }
    };

    loadHistory();
    return () => { mounted = false; };
  }, [
    assetType,
    historyKey,
    displayAsset?.id,
    displayAsset?.name,
    displayAsset?.quoteVolume,
    tfConfig.binanceInterval,
    tfConfig.value,
    timeframeMs,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    currencyBase,
  ]);

  // ── Live candle stitching ───────────────────────────────────────────────────
  useEffect(() => {
    if (!historyReady) return;
    const price = Number(displayAsset?.price);
    if (!displayAsset || !Number.isFinite(price) || price <= 0) return;

    const now    = Date.now();
    const bucket = Math.floor(now / timeframeMs) * timeframeMs;

    setCandles((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) {
        return [{ t: bucket, open: price, high: price, low: price, close: price }];
      }
      const last      = prev[prev.length - 1];
      const lastTime  = Number(last?.t);
      const lastClose = Number(last?.close);
      const openFallback = Number.isFinite(lastClose) && lastClose > 0 ? lastClose : price;

      if (Number.isFinite(lastTime) && lastTime === bucket) {
        const updated = {
          ...last,
          close: price,
          high:  Math.max(Number(last.high) || price, price),
          low:   Math.min(Number(last.low)  || price, price),
        };
        return [...prev.slice(0, -1), updated];
      }

      const open  = openFallback;
      const close = price;
      const high  = Math.max(open, close);
      const low   = Math.min(open, close);
      const next  = [...prev, { t: bucket, open, high, low, close }];
      return next.slice(-5000);
    });
  }, [displayAsset, historyReady, tick, timeframeMs]);

  // ── Derived display values ──────────────────────────────────────────────────
  const quoteCurrency = displayAsset?.type === 'currency' &&
    typeof displayAsset.quoteCurrency === 'string' ? displayAsset.quoteCurrency : '';

  const balanceInQuote = useMemo(() => {
    if (assetType !== 'currency' || !quoteCurrency) return balance;
    const usdPerBase   = quoteCurrency === 'USD' ? 1 : Number(currencyRates?.usd);
    const okUsdPerBase = Number.isFinite(usdPerBase) && usdPerBase > 0 ? usdPerBase : null;
    if (!okUsdPerBase) return balance;
    return balance / okUsdPerBase;
  }, [assetType, balance, currencyRates?.usd, quoteCurrency]);

  const headerTitle = useMemo(() => {
    if (!displayAsset) return 'Asset';
    if (displayAsset.type === 'currency' && quoteCurrency)
      return `${displayAsset.name} / ${quoteCurrency.toUpperCase()}`;
    return displayAsset.name;
  }, [displayAsset, quoteCurrency]);

  const headerPrice = useMemo(() => {
    if (!displayAsset) return '...';
    const price = Number(displayAsset.price);
    if (!Number.isFinite(price) || price <= 0) return '...';
    if (displayAsset.type === 'currency' && quoteCurrency)
      return `${price.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${quoteCurrency.toUpperCase()}`;
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }, [displayAsset, quoteCurrency]);

  const change24h = Number(displayAsset?.change24h);
  const changeStr = Number.isFinite(change24h)
    ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`
    : null;

  return (
    <section className="section-list">
      <div className="surface">
        <div className="asset-toolbar">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>

        <div className="hero" style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 4 }}>{headerTitle}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="price">{headerPrice}</span>
            {changeStr && (
              <span className={`asset-meta ${change24h >= 0 ? 'positive' : 'negative'}`}>
                {changeStr}
              </span>
            )}
          </div>
          {assetType === 'currency' && (
            <p className="asset-meta" style={{ marginTop: 4 }}>Status: {currencyStatus}</p>
          )}
        </div>

        {/* ── Timeframe pill selector ─────────────────────────────────────── */}
        <div className="tf-row">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              type="button"
              className={`tf-pill${timeframe === tf.value ? ' tf-pill--active' : ''}`}
              onClick={() => setTimeframe(tf.value)}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <CandleChart candles={candles} />
      </div>
      
      <div className="surface">
        <h3>Your Active {displayAsset?.name} Positions</h3>
        {activeAssetHoldings.length === 0 ? (
          <div className="empty-state">
            You do not hold any active spot shares or open futures contracts for this asset.
          </div>
        ) : (
          <div className="section-list">
            {activeAssetHoldings.map((holding) => {
              const isFutures = holding.instrumentType === 'futures';
              const pnl = holding.unrealizedPnL || 0;
              const isEditing = editingPositionId === holding.id;

              return (
                <div 
                  key={holding.id}
                  className="section-list"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.01)',
                    padding: '12px',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '8px'
                  }}
                >
                  <div 
                    className="list-item" 
                    style={{ 
                      border: '0', 
                      background: 'transparent', 
                      padding: 0,
                      borderLeft: `4px solid ${isFutures ? 'var(--auth-accent)' : 'var(--accent)'}`,
                      paddingLeft: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ textTransform: 'uppercase' }}>
                          {holding.symbol}
                        </strong>
                        <span className="auth-pill" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                          {isFutures ? `${holding.direction.toUpperCase()} ${holding.leverage}x FUTURES` : 'SPOT'}
                        </span>
                      </div>
                      
                      <small style={{ marginTop: '4px', display: 'block' }}>
                        Size: {holding.quantity} | Avg Entry: ${holding.averagePrice.toFixed(2)}
                      </small>
                      
                      {/* Live Risk trigger displays */}
                      {isFutures && (
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <small style={{ color: 'var(--danger)' }}>
                            ⚠️ Liquidation Price: ${holding.liquidationPrice?.toFixed(2)}
                          </small>
                          <small style={{ color: holding.takeProfit ? 'var(--accent)' : 'var(--muted)' }}>
                            🎯 Take Profit Target: {holding.takeProfit ? `$${holding.takeProfit.toFixed(2)}` : 'None Configured'}
                          </small>
                          <small style={{ color: holding.stopLoss ? '#ff9e9e' : 'var(--muted)' }}>
                            🛑 Stop Loss Safety: {holding.stopLoss ? `$${holding.stopLoss.toFixed(2)}` : 'None Configured'}
                          </small>
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {isFutures ? (
                        <>
                          <strong className={pnl >= 0 ? 'positive' : 'negative'}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </strong>
                          <button 
                            type="button" 
                            className="tf-pill" 
                            style={{ fontSize: '0.7rem', padding: '3px 8px', alignSelf: 'flex-end' }}
                            onClick={() => handleOpenModifier(holding)}
                          >
                            ⚙️ Edit Limits
                          </button>
                        </>
                      ) : (
                        <strong>${(holding.quantity * holding.currentPrice).toFixed(2)}</strong>
                      )}
                    </div>
                  </div>

                  {/* Dynamic interactive inline modification tray menu */}
                  {isFutures && isEditing && (
                    <div 
                      className="helper-box" 
                      style={{ 
                        marginTop: '12px', 
                        background: 'rgba(2, 8, 20, 0.8)', 
                        borderColor: 'var(--border)',
                        display: 'grid',
                        gap: '10px'
                      }}
                    >
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>Modify Triggers for contract</strong>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <label style={{ flex: 1, fontSize: '0.8rem', display: 'grid', gap: '4px' }}>
                          Take Profit Price ($)
                          <input
                            type="number"
                            className="market-search-input"
                            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                            value={localTP}
                            placeholder="Deactivate target"
                            onChange={(e) => setLocalTP(e.target.value)}
                          />
                        </label>
                        <label style={{ flex: 1, fontSize: '0.8rem', display: 'grid', gap: '4px' }}>
                          Stop Loss Price ($)
                          <input
                            type="number"
                            className="market-search-input"
                            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                            value={localSL}
                            placeholder="Deactivate limits"
                            onChange={(e) => setLocalSL(e.target.value)}
                          />
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <button 
                          type="button" 
                          className="ghost-button" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => setEditingPositionId(null)}
                        >
                          Cancel
                        </button>
                        <button 
                          type="button" 
                          className="primary-button" 
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => handleSaveTriggers(holding.id)}
                        >
                          Save Changes
                        </button>
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
        
        // ─── UPGRADED FUTURES-AWARE BUY HANDLER ───
        onBuy={(amount, type, options) => {
          if (!displayAsset) return;
          
          let targetAsset = { ...displayAsset };
          // Keep your special currency fallback parsing logic if applicable
          if (displayAsset.type === 'currency' && Number.isFinite(displayAsset.priceUsd)) {
            targetAsset.price = displayAsset.priceUsd;
          }
          
          // Pass all parameters to the store
          buyAsset({ 
            asset: targetAsset, 
            amount, 
            instrumentType: type, 
            futuresOptions: options 
          });
        }}

        // ─── UPGRADED FUTURES-AWARE SELL HANDLER ───
        onSell={(amount, type, options) => {
          if (!displayAsset) return;
          
          let targetAsset = { ...displayAsset };
          if (displayAsset.type === 'currency' && Number.isFinite(displayAsset.priceUsd)) {
            targetAsset.price = displayAsset.priceUsd;
          }
          
          // Pass all parameters to the store
          sellAsset({ 
            asset: targetAsset, 
            amount, 
            instrumentType: type 
          });
        }}
      />
    </section>
  );
}

export default AssetDetailPage;