function toCryptoAsset(item) {
  return {
    id: item.symbol.toLowerCase().replace('usdt', ''),
    symbol: item.symbol.replace('USDT', '').toLowerCase(),
    name: item.symbol.replace('USDT', ''),
    type: 'crypto',
    price: Number(item.lastPrice),
    change24h: Number(item.priceChangePercent),
    quoteVolume: Number(item.quoteVolume),
    marketCapRank: 0,
  };
}

export async function fetchLiveCryptoAssets() {
  const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');

  if (!response.ok) {
    throw new Error('Binance request failed');
  }

  const data = await response.json();
  return data
    .filter((item) => item.symbol.endsWith('USDT'))
    .filter((item) => Number(item.quoteVolume) > 1000000)
    .map(toCryptoAsset)
    .sort((left, right) => Number(right.quoteVolume ?? 0) - Number(left.quoteVolume ?? 0))
    .slice(0, 250);
}

export async function fetchCoinGeckoAssets() {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h',
  );

  if (!response.ok) {
    throw new Error('CoinGecko request failed');
  }

  const data = await response.json();
  return data.map((item) => ({
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    type: 'crypto',
    price: item.current_price,
    change24h: item.price_change_percentage_24h ?? 0,
    marketCapRank: item.market_cap_rank ?? 0,
  }));
}

export async function fetchLiveStockAssets() {
  const response = await fetch('/api/stocks');

  if (!response.ok) {
    throw new Error('Stock proxy request failed');
  }

  const data = await response.json();

  if (!Array.isArray(data.quotes)) {
    throw new Error('Stock proxy response invalid');
  }

  return data.quotes.map((item) => ({
    ...item,
    symbol: item.symbol.toLowerCase(),
    source: item.source ?? 'stooq-proxy',
  }));
}

export async function fetchBinanceKlines({ symbol, interval = '15m', limit = 500 }) {
  const response = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(
      interval,
    )}&limit=${Number(limit)}`,
  );

  if (!response.ok) {
    throw new Error('Binance klines request failed');
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Binance klines response invalid');
  }

  return data
    .map((kline) => {
      const openTime = Number(kline?.[0]);
      const open = Number(kline?.[1]);
      const high = Number(kline?.[2]);
      const low = Number(kline?.[3]);
      const close = Number(kline?.[4]);

      if (![openTime, open, high, low, close].every(Number.isFinite)) {
        return null;
      }

      return {
        t: openTime,
        open,
        high,
        low,
        close,
      };
    })
    .filter(Boolean);
}

export async function fetchCoinGeckoMarketChart({ id, days = 7 }) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
      id,
    )}/market_chart?vs_currency=usd&days=${Number(days)}&interval=hourly`,
  );

  if (!response.ok) {
    throw new Error('CoinGecko market chart request failed');
  }

  const data = await response.json();
  const prices = Array.isArray(data?.prices) ? data.prices : null;
  if (!prices) {
    throw new Error('CoinGecko market chart response invalid');
  }

  return prices
    .map((point) => {
      const t = Number(point?.[0]);
      const price = Number(point?.[1]);
      if (!Number.isFinite(t) || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      return { t, price };
    })
    .filter(Boolean);
}

export async function fetchStockHistoryCandles({ id, limit = 320 }) {
  const response = await fetch(`/api/stocks/history?id=${encodeURIComponent(String(id))}&limit=${Number(limit)}`);

  if (!response.ok) {
    throw new Error('Stock history request failed');
  }

  const data = await response.json();
  if (!Array.isArray(data?.candles)) {
    throw new Error('Stock history response invalid');
  }

  return data.candles
    .map((candle) => {
      const t = Number(candle?.t);
      const open = Number(candle?.open);
      const high = Number(candle?.high);
      const low = Number(candle?.low);
      const close = Number(candle?.close);

      if (![t, open, high, low, close].every(Number.isFinite)) {
        return null;
      }

      return { t, open, high, low, close };
    })
    .filter(Boolean);
}
