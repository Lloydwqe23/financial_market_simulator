import { create } from 'zustand';
import { fetchCoinGeckoAssets, fetchLiveCryptoAssets, fetchLiveStockAssets } from '../api/marketApi';

export const CURRENCIES = [
  'USD',
  'EUR',
  'UAH',
  'GBP',
  'PLN',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'CNY',
  'HKD',
  'SGD',
  'SEK',
  'NOK',
  'DKK',
  'CZK',
  'HUF',
  'TRY',
  'INR',
  'BRL',
  'MXN',
  'ZAR',
  'AED',
  'SAR',
];

const initialMarketState = {
  cryptoAssets: [],
  stockAssets: [],
  currencyBase: 'USD',
  currencyRates: {},
  currencyPrevRates: {},
  currencyChanges: {},
  cryptoStatus: 'Loading crypto market...',
  stockStatus: 'Loading stocks...',
  currencyStatus: 'Loading FX rates...',
  cryptoReady: false,
  stockReady: false,
  currencyReady: false,
};

function normalizeCryptoAssets(assets) {
  return assets.filter((asset) => asset.type === 'crypto');
}

function normalizeCurrencyRates(baseCurrency, data) {
  return CURRENCIES.reduce((rates, code) => {
    if (code !== baseCurrency) {
      rates[code.toLowerCase()] = data?.[baseCurrency.toLowerCase()]?.[code.toLowerCase()] ?? null;
    }

    return rates;
  }, {});
}

function buildCurrencyChanges(previousRates, nextRates) {
  return Object.keys(nextRates).reduce((changes, code) => {
    const previousValue = previousRates[code];
    const nextValue = nextRates[code];

    if (typeof previousValue === 'number' && previousValue > 0 && typeof nextValue === 'number') {
      changes[code] = ((nextValue - previousValue) / previousValue) * 100;
    } else {
      changes[code] = null;
    }

    return changes;
  }, {});
}

const useMarketStore = create((set, get) => ({
  ...initialMarketState,
  loadCryptoAssets: async () => {
    try {
      const assets = await fetchLiveCryptoAssets();
      const cryptoAssets = normalizeCryptoAssets(assets);

      set({
        cryptoAssets,
        cryptoStatus: `${new Date().toLocaleTimeString('en-US')}`,
        cryptoReady: true,
      });
    } catch (liveError) {
      try {
        const assets = await fetchCoinGeckoAssets();
        const cryptoAssets = normalizeCryptoAssets(assets);

        set({
          cryptoAssets,
          cryptoStatus: `CoinGecko fallback • ${new Date().toLocaleTimeString('en-US')}`,
          cryptoReady: true,
        });
      } catch (fallbackError) {
        set({
          cryptoStatus: 'Local fallback for crypto.',
          cryptoReady: true,
        });
      }
    }
  },
  loadStockAssets: async () => {
    try {
      const stockAssets = await fetchLiveStockAssets();

      set({
        stockAssets,
        stockStatus: `${new Date().toLocaleTimeString('en-US')}`,
        stockReady: true,
      });
    } catch (error) {
      set({
        stockReady: true,
        stockStatus: 'Local fallback for stocks.',
      });
    }
  },
  loadCurrencyRates: async (baseCurrency) => {
    try {
      const previousRates = get().currencyRates;
      const previousBase = get().currencyBase;

      if (previousBase !== baseCurrency) {
        set({
          currencyBase: baseCurrency,
          currencyRates: {},
          currencyPrevRates: {},
          currencyChanges: {},
          currencyStatus: 'Loading FX rates...',
          currencyReady: false,
        });
      }

      const response = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${baseCurrency.toLowerCase()}.json`,
      );

      if (!response.ok) {
        throw new Error('Currency request failed');
      }

      const data = await response.json();

      if (get().currencyBase !== baseCurrency) {
        return;
      }

      const normalizedRates = normalizeCurrencyRates(baseCurrency, data);

      set({
        currencyBase: baseCurrency,
        currencyRates: normalizedRates,
        currencyPrevRates: previousRates,
        currencyChanges: previousBase === baseCurrency ? buildCurrencyChanges(previousRates, normalizedRates) : {},
        currencyStatus: `${new Date().toLocaleTimeString('en-US')}`,
        currencyReady: true,
      });
    } catch (error) {
      if (get().currencyBase !== baseCurrency) {
        return;
      }

      set({
        currencyBase: baseCurrency,
        currencyRates: {},
        currencyStatus: 'Failed to load FX market.',
        currencyReady: true,
      });
    }
  },
  syncAllMarketPrices: () => {
    const state = get();
    const marketAssets = [...state.cryptoAssets, ...state.stockAssets];

    return marketAssets;
  },
}));

export { useMarketStore };