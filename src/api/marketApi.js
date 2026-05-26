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
