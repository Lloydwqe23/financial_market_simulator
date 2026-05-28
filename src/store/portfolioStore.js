import { create } from 'zustand';

const usePortfolioStore = create((set, get) => ({
  balance: 0,
  holdings: [],
  transactions: [],
  lastMessage: 'Start by buying your first asset on the dashboard.',

  // ── DEPOSIT FUNDS ────────────────────────────────────────────────────────
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
          instrumentType: 'spot',
        },
        ...state.transactions,
      ],
      lastMessage: `Deposited $${n.toLocaleString('en-US', { minimumFractionDigits: 2 })} to your account.`,
    }));

    // Async server syncing persistence framework
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
        // Ignore background network dropouts
      }
    }, 0);

    return { ok: true };
  },

  // ── OPEN ASSET OR FUTURE POSITION (BUY) ──────────────────────────────────
  buyAsset: ({ asset, amount, instrumentType = 'stock', futuresOptions = null }) => {
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

    const totalSize = quantity * assetPrice;
    
    // Futures only require (Total Size / Leverage) down-payment collateral
    const marginCost = instrumentType === 'futures' 
      ? totalSize / Number(futuresOptions?.leverage || 1) 
      : totalSize;

    if (marginCost > get().balance) {
      set({ lastMessage: `Not enough funds to cover the required margin of $${marginCost.toFixed(2)}.` });
      return { ok: false };
    }

    set((state) => {
      const holdings = [...state.holdings];

      if (instrumentType !== 'futures') {
        // ── Spot / Stock Branch ──
        const existingIndex = holdings.findIndex(
          (item) => item.id === asset.id && item.instrumentType !== 'futures'
        );

        if (existingIndex > -1) {
          const existingItem = holdings[existingIndex];
          const nextQuantity = Number((existingItem.quantity + quantity).toFixed(8));
          const nextAveragePrice = Number(
            ((existingItem.averagePrice * existingItem.quantity + totalSize) / nextQuantity).toFixed(2)
          );

          holdings[existingIndex] = {
            ...existingItem,
            quantity: nextQuantity,
            averagePrice: nextAveragePrice,
            currentPrice: assetPrice,
          };
        } else {
          holdings.push({
            id: asset.id,
            symbol: asset.symbol,
            name: asset.name,
            quantity,
            averagePrice: assetPrice,
            currentPrice: assetPrice,
            type: asset.type,
            instrumentType: 'stock',
          });
        }
      } else {
        // ── Advanced Leveraged Futures Contract Injection ──
        // Generate an independent specific unique identifier key for this custom isolated risk contract
        holdings.push({
          id: `${asset.id}-futures-${crypto.randomUUID().slice(0, 4)}`,
          assetId: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          quantity,
          averagePrice: assetPrice,
          currentPrice: assetPrice,
          type: asset.type,
          instrumentType: 'futures',
          direction: futuresOptions.direction, // 'long' | 'short'
          leverage: Number(futuresOptions.leverage),
          margin: marginCost,
          stopLoss: futuresOptions.stopLoss || null,
          takeProfit: futuresOptions.takeProfit || null,
          liquidationPrice: futuresOptions.liquidationPrice,
          unrealizedPnL: 0,
        });
      }

      return {
        balance: Number((state.balance - marginCost).toFixed(2)),
        holdings,
        transactions: [
          {
            id: crypto.randomUUID(),
            type: 'buy',
            assetName: asset.name,
            symbol: asset.symbol,
            quantity,
            price: assetPrice,
            total: marginCost,
            time: new Date().toLocaleString('en-US'),
            instrumentType,
          },
          ...state.transactions,
        ],
        lastMessage: instrumentType === 'futures'
          ? `Opened Futures ${futuresOptions.direction.toUpperCase()} ${futuresOptions.leverage}x Position for ${quantity} ${asset.symbol.toUpperCase()}.`
          : `Bought ${quantity} ${asset.symbol.toUpperCase()} on Spot for $${totalSize.toFixed(2)}.`,
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
      } catch (e) {}
    }, 0);

    return { ok: true };
  },

  // ── CLOSE/SELL POSITION ──────────────────────────────────────────────────
  sellAsset: ({ asset, amount, instrumentType = 'stock' }) => {
    const quantity = Number(amount);
    if (!asset || !Number.isFinite(quantity) || quantity <= 0) {
      set({ lastMessage: 'Enter a valid amount.' });
      return { ok: false };
    }

    const assetPrice = Number(asset.price);
    if (!Number.isFinite(assetPrice) || assetPrice <= 0) {
      set({ lastMessage: 'Price unavailable right now.' });
      return { ok: false };
    }

    // Isolated Spot asset verification check
    if (instrumentType !== 'futures') {
      const holding = get().holdings.find((item) => item.id === asset.id && item.instrumentType !== 'futures');
      if (!holding || holding.quantity < quantity) {
        set({ lastMessage: `Not enough ${asset.name} on spot to settle sell order.` });
        return { ok: false };
      }

      const totalGain = quantity * assetPrice;

      set((state) => ({
        balance: Number((state.balance + totalGain).toFixed(2)),
        holdings: state.holdings
          .map((item) =>
            item.id === asset.id && item.instrumentType !== 'futures'
              ? { ...item, quantity: Number((item.quantity - quantity).toFixed(8)) }
              : item
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
            instrumentType: 'stock',
          },
          ...state.transactions,
        ],
        lastMessage: `Sold ${quantity} ${asset.symbol.toUpperCase()} on spot for $${totalGain.toFixed(2)}.`,
      }));
    } else {
      // Manual futures complete order settlement override safety loop fallback notice
      set({ lastMessage: 'Futures contracts are closed dynamically via your Take Profit, Stop Loss, or Liquidation triggers.' });
      return { ok: false };
    }

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
      } catch (e) {}
    }, 0);

    return { ok: true };
  },

  // ── LIVE TICK OVERWATCH (AUTO LIQUIDATION & SL/TP EXECUTION KERNEL) ──────
  syncMarketPrices: (marketAssets) =>
    set((state) => {
      let updatedBalance = state.balance;
      let transactions = [...state.transactions];
      let logs = [];

      const nextHoldings = state.holdings.map((holding) => {
        const found = marketAssets.find((a) => a.id === (holding.assetId || holding.id));
        if (!found) return holding;
        const nextPrice = Number(found.price);

        if (holding.instrumentType !== 'futures') {
          return { ...holding, currentPrice: nextPrice };
        }

        // ─── DYNAMIC FUTURES CALCULATION PNL ───
        let priceDiff = holding.direction === 'long' 
          ? nextPrice - holding.averagePrice 
          : holding.averagePrice - nextPrice;

        let unrealizedPnL = priceDiff * holding.quantity;

        // Check Risk Triggers
        let triggered = false;
        let reason = '';

        if (holding.direction === 'long' && nextPrice <= holding.liquidationPrice) { triggered = true; reason = 'Liquidation'; }
        else if (holding.direction === 'short' && nextPrice >= holding.liquidationPrice) { triggered = true; reason = 'Liquidation'; }
        else if (holding.stopLoss && ((holding.direction === 'long' && nextPrice <= holding.stopLoss) || (holding.direction === 'short' && nextPrice >= holding.stopLoss))) { triggered = true; reason = 'Stop Loss'; }
        else if (holding.takeProfit && ((holding.direction === 'long' && nextPrice >= holding.takeProfit) || (holding.direction === 'short' && nextPrice <= holding.takeProfit))) { triggered = true; reason = 'Take Profit'; }

        if (triggered) {
          // Position close operation: return margin left + PnL realized
          let finalPayout = reason === 'Liquidation' ? 0 : holding.margin + unrealizedPnL;
          if (finalPayout < 0) finalPayout = 0;

          updatedBalance = Number((updatedBalance + finalPayout).toFixed(2));
          
          transactions.unshift({
            id: crypto.randomUUID(),
            type: 'futures_close',
            assetName: `${holding.name} (${reason})`,
            symbol: holding.symbol,
            quantity: holding.quantity,
            price: nextPrice,
            total: unrealizedPnL,
            time: new Date().toLocaleTimeString(),
            instrumentType: 'futures'
          });

          logs.push(`${holding.symbol.toUpperCase()} position closed via ${reason}.`);
          return null; // Removes it from holdings array
        }

        return { ...holding, currentPrice: nextPrice, unrealizedPnL };
      }).filter(Boolean);

      return {
        balance: updatedBalance,
        holdings: nextHoldings,
        transactions,
        ...(logs.length > 0 ? { lastMessage: logs[0] } : {})
      };
    }),

  // ── FETCH INITIAL PORTFOLIO STATE FROM API SERVER ────────────────────────
  fetchFromServer: async () => {
    try {
      const res = await fetch('/api/portfolio', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const p = data.portfolio;
      if (!p) return null;
      
      set({ 
        balance: p.balance, 
        holdings: p.holdings || [], 
        transactions: p.transactions || [], 
        lastMessage: p.lastMessage 
      });
      return p;
    } catch (e) {
      return null;
    }
  },
}));

export { usePortfolioStore };