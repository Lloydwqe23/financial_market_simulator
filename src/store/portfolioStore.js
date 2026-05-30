import { create } from 'zustand';

async function persistToServer(get) {
  try {
    await fetch('/api/portfolio', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balance:      get().balance,
        holdings:     get().holdings,
        transactions: get().transactions,
        lastMessage:  get().lastMessage,
      }),
    });
  } catch (_) {}
}

const usePortfolioStore = create((set, get) => ({
  balance: 0,
  holdings: [],
  transactions: [],
  lastMessage: 'Start by buying your first asset on the dashboard.',

  //DEPOSIT
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

    setTimeout(() => persistToServer(get), 0);
    return { ok: true };
  },

  //BUY / OPEN POSITION
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

    const totalSize  = quantity * assetPrice;
    const marginCost = instrumentType === 'futures'
      ? totalSize / Number(futuresOptions?.leverage || 1)
      : totalSize;

    if (marginCost > get().balance) {
      set({ lastMessage: `Not enough funds to cover the required amount of $${marginCost.toFixed(2)}.` });
      return { ok: false };
    }

    set((state) => {
      const holdings = [...state.holdings];

      if (instrumentType !== 'futures') {
        const idx = holdings.findIndex(
          (item) => item.id === asset.id && item.instrumentType !== 'futures',
        );
        if (idx > -1) {
          const ex = holdings[idx];
          const nextQty = Number((ex.quantity + quantity).toFixed(8));
          holdings[idx] = {
            ...ex,
            quantity:     nextQty,
            averagePrice: Number(((ex.averagePrice * ex.quantity + totalSize) / nextQty).toFixed(2)),
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
              total: totalSize,
              time: new Date().toLocaleString('en-US'),
              instrumentType: 'stock',
            },
            ...state.transactions,
          ],
          lastMessage: `Bought ${quantity} ${asset.symbol.toUpperCase()} on Spot for $${totalSize.toFixed(2)}.`,
        };

      } else {
        holdings.push({
          id:               `${asset.id}-futures-${crypto.randomUUID().slice(0, 4)}`,
          assetId:          asset.id,
          symbol:           asset.symbol,
          name:             asset.name,
          quantity,
          averagePrice:     assetPrice,
          currentPrice:     assetPrice,
          type:             asset.type,
          instrumentType:   'futures',
          direction:        futuresOptions?.direction  || 'long',
          leverage:         Number(futuresOptions?.leverage || 1),
          margin:           marginCost,
          stopLoss:         futuresOptions?.stopLoss         || null,
          takeProfit:       futuresOptions?.takeProfit       || null,
          liquidationPrice: futuresOptions?.liquidationPrice || 0,
          unrealizedPnL:    0,
        });
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
              instrumentType: 'futures',
            },
            ...state.transactions,
          ],
          lastMessage: `Opened ${asset.type.toUpperCase()} Futures ${futuresOptions?.direction?.toUpperCase()} (${futuresOptions?.leverage}x) on ${asset.symbol.toUpperCase()} using $${marginCost.toFixed(2)} margin.`,
        };
      }
    });

    setTimeout(() => persistToServer(get), 0);
    return { ok: true };
  },

  //SELL / CLOSE SPOT POSITION
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

    if (instrumentType !== 'futures') {
      const holding = get().holdings.find(
        (item) => item.id === asset.id && item.instrumentType !== 'futures',
      );
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
            instrumentType: 'stock',
          },
          ...state.transactions,
        ],
        lastMessage: `Sold ${quantity} ${asset.symbol.toUpperCase()} on spot for $${totalGain.toFixed(2)}.`,
      }));
    } else {
      set({ lastMessage: 'Futures contracts close via Take Profit, Stop Loss, or Liquidation triggers.' });
      return { ok: false };
    }

    setTimeout(() => persistToServer(get), 0);
    return { ok: true };
  },

  //LIVE PRICE SYNC + AUTO LIQUIDATION
  syncMarketPrices: (marketAssets) =>
    set((state) => {
      let updatedBalance = state.balance;
      let transactions   = [...state.transactions];
      let logs           = [];

      const nextHoldings = state.holdings.map((holding) => {
        const baseAssetId = holding.assetId || holding.id.split('-')[0];
        const found = marketAssets.find((a) => a.id === baseAssetId);
        
        if (!found) return holding;
        const nextPrice = Number(found.price);

        if (holding.instrumentType !== 'futures') {
          return { ...holding, currentPrice: nextPrice };
        }

        const priceDiff    = holding.direction === 'long'
          ? nextPrice - holding.averagePrice
          : holding.averagePrice - nextPrice;
        const unrealizedPnL = priceDiff * holding.quantity;

        let triggered = false;
        let reason    = '';
        if (holding.direction === 'long'  && nextPrice <= holding.liquidationPrice) { triggered = true; reason = 'Liquidation'; }
        if (holding.direction === 'short' && nextPrice >= holding.liquidationPrice) { triggered = true; reason = 'Liquidation'; }
        if (!triggered && holding.stopLoss) {
          if (holding.direction === 'long'  && nextPrice <= holding.stopLoss) { triggered = true; reason = 'Stop Loss'; }
          if (holding.direction === 'short' && nextPrice >= holding.stopLoss) { triggered = true; reason = 'Stop Loss'; }
        }
        if (!triggered && holding.takeProfit) {
          if (holding.direction === 'long'  && nextPrice >= holding.takeProfit) { triggered = true; reason = 'Take Profit'; }
          if (holding.direction === 'short' && nextPrice <= holding.takeProfit) { triggered = true; reason = 'Take Profit'; }
        }

        if (triggered) {
          const finalPayout = Math.max(0, reason === 'Liquidation' ? 0 : holding.margin + unrealizedPnL);
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
            instrumentType: 'futures',
          });
          const sign = unrealizedPnL >= 0 ? 'won' : 'lost';
          logs.push(`Closed ${holding.symbol.toUpperCase()} Futures via ${reason}! You ${sign} $${Math.abs(unrealizedPnL).toFixed(2)}.`);
          return null;
        }

        return { ...holding, currentPrice: nextPrice, unrealizedPnL };
      }).filter(Boolean);

      return {
        balance:  updatedBalance,
        holdings: nextHoldings,
        transactions,
        ...(logs.length > 0 ? { lastMessage: logs[0] } : {}),
      };
    }),
  
  updatePositionTriggers: ({ positionId, stopLoss, takeProfit }) => {
    set((state) => {
      const holdings = state.holdings.map((item) => {
        if (item.id === positionId) {
          return {
            ...item,
            stopLoss: stopLoss ? Number(stopLoss) : null,
            takeProfit: takeProfit ? Number(takeProfit) : null,
          };
        }
        return item;
      });

      return {
        holdings,
        lastMessage: `Updated risk thresholds for position contract.`,
      };
    });

    setTimeout(() => persistToServer(get), 0);
    return { ok: true };
  },
  
  fetchFromServer: async () => {
    try {
      const res = await fetch('/api/portfolio', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const p = data.portfolio;
      if (!p) return null;
      set({
        balance:      p.balance,
        holdings:     p.holdings     || [],
        transactions: p.transactions || [],
        lastMessage:  p.lastMessage,
      });
      return p;
    } catch (_) {
      return null;
    }
  },
}));

export { usePortfolioStore };