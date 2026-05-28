import { create } from 'zustand';

const usePortfolioStore = create((set, get) => ({
  balance: 0,
  holdings: [],
  transactions: [],
  lastMessage: 'Start by buying your first asset on the dashboard.',

  // ── Deposit ───────────────────────────────────────────────────────────────
  deposit: (amount) => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return { ok: false };

    set((state) => ({
      balance: Number((state.balance + n).toFixed(2)),
      transactions: [
        {
          id: crypto.randomUUID(),
          type: 'deposit',
          assetName: 'Cash deposit',
          symbol: 'USD',
          quantity: n,
          price: 1,
          total: n,
          time: new Date().toLocaleString('en-US'),
        },
        ...state.transactions,
      ],
      lastMessage: `Deposited $${n.toLocaleString('en-US', { minimumFractionDigits: 2 })} to your account.`,
    }));

    setTimeout(async () => {
      try {
        await fetch('/api/portfolio', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            balance: get().balance,
            holdings: get().holdings,
            transactions: get().transactions,
            lastMessage: get().lastMessage,
          }),
        });
      } catch (e) {
        // ignore
      }
    }, 0);

    return { ok: true };
  },

  // ── Buy ───────────────────────────────────────────────────────────────────
  buyAsset: ({ asset, amount }) => {
    const quantity = Number(amount);
    if (!asset || !Number.isFinite(quantity) || quantity <= 0) {
      set({ lastMessage: 'Enter a valid amount.' });
      return { ok: false };
    }

    const assetPrice = Number(asset.price);
    if (!Number.isFinite(assetPrice) || assetPrice <= 0) {
      set({ lastMessage: 'Price unavailable for this asset right now.' });
      return { ok: false };
    }

    const totalCost = quantity * assetPrice;
    const currentBalance = get().balance;

    if (totalCost > currentBalance) {
      set({ lastMessage: `Not enough funds to buy ${asset.name}.` });
      return { ok: false };
    }

    set((state) => {
      const existing = state.holdings.find((item) => item.id === asset.id);
      const holdings = existing
        ? state.holdings.map((item) =>
            item.id === asset.id
              ? {
                  ...item,
                  quantity: Number((item.quantity + quantity).toFixed(8)),
                  averagePrice: Number(
                    ((item.averagePrice * item.quantity + totalCost) / (item.quantity + quantity)).toFixed(2),
                  ),
                }
              : item,
          )
        : [
            ...state.holdings,
            {
              id: asset.id,
              symbol: asset.symbol,
              name: asset.name,
              quantity,
              averagePrice: assetPrice,
              currentPrice: assetPrice,
              type: asset.type,
            },
          ];

      return {
        balance: Number((state.balance - totalCost).toFixed(2)),
        holdings,
        transactions: [
          {
            id: crypto.randomUUID(),
            type: 'buy',
            assetName: asset.name,
            symbol: asset.symbol,
            quantity,
            price: assetPrice,
            total: totalCost,
            time: new Date().toLocaleString('en-US'),
          },
          ...state.transactions,
        ],
        lastMessage: `Bought ${quantity} ${asset.symbol.toUpperCase()} for $${totalCost.toFixed(2)}.`,
      };
    });

    setTimeout(async () => {
      try {
        await fetch('/api/portfolio', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            balance: get().balance,
            holdings: get().holdings,
            transactions: get().transactions,
            lastMessage: get().lastMessage,
          }),
        });
      } catch (e) {
        // ignore
      }
    }, 0);

    return { ok: true };
  },

  // ── Sell ──────────────────────────────────────────────────────────────────
  sellAsset: ({ asset, amount }) => {
    const quantity = Number(amount);
    if (!asset || !Number.isFinite(quantity) || quantity <= 0) {
      set({ lastMessage: 'Enter a valid amount.' });
      return { ok: false };
    }

    const assetPrice = Number(asset.price);
    if (!Number.isFinite(assetPrice) || assetPrice <= 0) {
      set({ lastMessage: 'Price unavailable for this asset right now.' });
      return { ok: false };
    }

    const holding = get().holdings.find((item) => item.id === asset.id);
    if (!holding || holding.quantity < quantity) {
      set({ lastMessage: `Not enough ${asset.name} to sell.` });
      return { ok: false };
    }

    const totalGain = quantity * assetPrice;

    set((state) => ({
      balance: Number((state.balance + totalGain).toFixed(2)),
      holdings: state.holdings
        .map((item) =>
          item.id === asset.id
            ? { ...item, quantity: Number((item.quantity - quantity).toFixed(8)) }
            : item,
        )
        .filter((item) => item.quantity > 0),
      transactions: [
        {
          id: crypto.randomUUID(),
          type: 'sell',
          assetName: asset.name,
          symbol: asset.symbol,
          quantity,
          price: assetPrice,
          total: totalGain,
          time: new Date().toLocaleString('en-US'),
        },
        ...state.transactions,
      ],
      lastMessage: `Sold ${quantity} ${asset.symbol.toUpperCase()} for $${totalGain.toFixed(2)}.`,
    }));

    setTimeout(async () => {
      try {
        await fetch('/api/portfolio', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            balance: get().balance,
            holdings: get().holdings,
            transactions: get().transactions,
            lastMessage: get().lastMessage,
          }),
        });
      } catch (e) {
        // ignore
      }
    }, 0);

    return { ok: true };
  },

  // ── Sync market prices ────────────────────────────────────────────────────
  syncMarketPrices: (marketAssets) =>
    set((state) => ({
      holdings: state.holdings.map((holding) => {
        const found = marketAssets.find((a) => a.id === holding.id);
        if (!found) return holding;
        const nextPrice = Number(found.price);
        return Number.isFinite(nextPrice) && nextPrice > 0
          ? { ...holding, currentPrice: nextPrice }
          : holding;
      }),
    })),

  // ── Fetch from server ─────────────────────────────────────────────────────
  fetchFromServer: async () => {
    try {
      const res = await fetch('/api/portfolio', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const p = data.portfolio;
      if (!p) return null;
      set({ balance: p.balance, holdings: p.holdings, transactions: p.transactions, lastMessage: p.lastMessage });
      return p;
    } catch (e) {
      return null;
    }
  },
}));

export { usePortfolioStore };