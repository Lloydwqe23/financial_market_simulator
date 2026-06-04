import { create } from 'zustand';

async function persistToServer(get) {
  try {
    await fetch('/api/portfolio', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balance: get().balance,
        holdings: get().holdings,
        transactions: get().transactions,
        pendingOrders: get().pendingOrders,
        lastMessage: get().lastMessage,
      }),
    });
  } catch (_) { }
}

const usePortfolioStore = create((set, get) => ({
  balance: 0,
  holdings: [],
  transactions: [],
  pendingOrders: [],
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

  placeLimitOrder: ({ asset, amount, instrumentType, limitPrice, direction = 'buy', futuresOptions = null, currentLivePrice }) => {
    const quantity = Number(amount);
    const targetPrice = Number(limitPrice);
    const live = Number(currentLivePrice);

    if (!asset || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      set({ lastMessage: 'Invalid order parameters.' });
      return { ok: false };
    }

    const alreadyTriggered = (direction === 'buy' && live <= targetPrice) ||
      (direction === 'sell' && live >= targetPrice);

    if (alreadyTriggered) {
      const state = get();
      if (direction === 'buy') {
        const res = state.buyAsset({ asset, amount, instrumentType, futuresOptions });
        if (res.ok) set({ lastMessage: `Limit reached instantly! Executed at live market price of $${live.toFixed(2)}.` });
        return res;
      } else {
        const res = state.sellAsset({ asset, amount, instrumentType });
        if (res.ok) set({ lastMessage: `Limit reached instantly! Executed at live market price of $${live.toFixed(2)}.` });
        return res;
      }
    }

    const totalSize = quantity * targetPrice;
    const marginCost = instrumentType === 'futures' ? totalSize / Number(futuresOptions?.leverage || 1) : totalSize;

    if (direction === 'buy' && marginCost > get().balance) {
      set({ lastMessage: `Insufficient funds for limit order. Requires $${marginCost.toFixed(2)}.` });
      return { ok: false };
    }

    if (direction === 'sell') {
      const holding = get().holdings.find(h => h.id === asset.id && h.instrumentType === instrumentType);
      if (!holding || holding.quantity < quantity) {
        set({ lastMessage: `Not enough ${asset.symbol} to place sell limit order.` });
        return { ok: false };
      }
    }

    set((state) => {
      const newOrder = {
        id: crypto.randomUUID(), assetId: asset.id, symbol: asset.symbol, name: asset.name, type: asset.type,
        quantity, limitPrice: targetPrice, instrumentType, direction, futuresOptions, time: new Date().toLocaleString('en-US')
      };
      const newBalance = direction === 'buy' ? state.balance - marginCost : state.balance;

      return {
        balance: Number(newBalance.toFixed(2)),
        pendingOrders: [newOrder, ...state.pendingOrders],
        transactions: [
          {
            id: crypto.randomUUID(), type: 'limit_placed', assetName: `Escrow: ${asset.name} Limit`,
            symbol: asset.symbol, quantity, price: targetPrice, total: direction === 'buy' ? marginCost : 0,
            time: new Date().toLocaleString('en-US'), instrumentType: instrumentType,
          },
          ...state.transactions
        ],
        lastMessage: `Limit ${direction.toUpperCase()} order placed for ${quantity} ${asset.symbol} at $${targetPrice.toFixed(2)}.`
      };
    });

    setTimeout(() => persistToServer(get), 0);
    return { ok: true };
  },

  cancelOrder: (orderId) => {
    set((state) => {
      const order = state.pendingOrders.find(o => o.id === orderId);
      if (!order) return state;

      let newBalance = state.balance;
      let marginCost = 0;
      if (order.direction === 'buy') {
        const totalSize = order.quantity * order.limitPrice;
        marginCost = order.instrumentType === 'futures' ? totalSize / Number(order.futuresOptions?.leverage || 1) : totalSize;
        newBalance += marginCost;
      }

      return {
        balance: Number(newBalance.toFixed(2)),
        pendingOrders: state.pendingOrders.filter(o => o.id !== orderId),
        transactions: [
          {
            id: crypto.randomUUID(), type: 'limit_cancelled', assetName: `Refund: ${order.name} Limit`,
            symbol: order.symbol, quantity: order.quantity, price: order.limitPrice, total: order.direction === 'buy' ? marginCost : 0,
            time: new Date().toLocaleString('en-US'), instrumentType: order.instrumentType,
          },
          ...state.transactions
        ],
        lastMessage: `Cancelled limit order for ${order.symbol}.`
      };
    });
    setTimeout(() => persistToServer(get), 0);
  },

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
    const marginCost = instrumentType === 'futures'
      ? totalSize / Number(futuresOptions?.leverage || 1)
      : totalSize;

    if (marginCost > get().balance) {
      set({ lastMessage: `Not enough funds to cover the required amount of $${marginCost.toFixed(2)}.` });
      return { ok: false };
    }

    set((state) => {
      const holdings = [...state.holdings];

      if (instrumentType === 'stock' || instrumentType === 'earn') {
        const idx = holdings.findIndex(
          (item) => item.id === asset.id && item.instrumentType === instrumentType,
        );
        if (idx > -1) {
          const ex = holdings[idx];
          const nextQty = Number((ex.quantity + quantity).toFixed(8));
          holdings[idx] = {
            ...ex,
            quantity: nextQty,
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
            instrumentType: instrumentType,
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
              instrumentType: instrumentType,
            },
            ...state.transactions,
          ],
          lastMessage: instrumentType === 'earn'
            ? `Staked ${quantity} ${asset.symbol.toUpperCase()} into the Earn Wallet for $${totalSize.toFixed(2)}.`
            : `Bought ${quantity} ${asset.symbol.toUpperCase()} on Spot for $${totalSize.toFixed(2)}.`,
        };

      } else {
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
          direction: futuresOptions?.direction || 'long',
          leverage: Number(futuresOptions?.leverage || 1),
          margin: marginCost,
          stopLoss: futuresOptions?.stopLoss || null,
          takeProfit: futuresOptions?.takeProfit || null,
          liquidationPrice: futuresOptions?.liquidationPrice || 0,
          unrealizedPnL: 0,
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

    if (instrumentType === 'stock' || instrumentType === 'earn') {
      const holding = get().holdings.find(
        (item) => item.id === asset.id && item.instrumentType === instrumentType,
      );

      if (!holding || holding.quantity < quantity - 0.000001) {
        set({ lastMessage: `Not enough ${asset.name} in ${instrumentType} wallet to settle sell order.` });
        return { ok: false };
      }

      const isSellingAll = (holding.quantity - quantity) < 0.000001;
      const actualSellQuantity = isSellingAll ? holding.quantity : quantity;
      const totalGain = actualSellQuantity * assetPrice;

      set((state) => ({
        balance: Number((state.balance + totalGain).toFixed(2)),
        holdings: state.holdings
          .map((item) =>
            item.id === asset.id && item.instrumentType === instrumentType
              ? { ...item, quantity: isSellingAll ? 0 : Number((item.quantity - actualSellQuantity).toFixed(8)) }
              : item,
          )
          .filter((item) => item.quantity > 0),
        transactions: [
          {
            id: crypto.randomUUID(),
            type: 'sell',
            assetName: asset.name,
            symbol: asset.symbol,
            quantity: Number(actualSellQuantity.toFixed(8)),
            price: assetPrice,
            total: totalGain,
            time: new Date().toLocaleString('en-US'),
            instrumentType: instrumentType,
          },
          ...state.transactions,
        ],
        lastMessage: instrumentType === 'earn'
          ? `Unstaked and sold ${actualSellQuantity.toFixed(4)} ${asset.symbol.toUpperCase()} from Earn for $${totalGain.toFixed(2)}.`
          : `Sold ${actualSellQuantity.toFixed(4)} ${asset.symbol.toUpperCase()} on Spot for $${totalGain.toFixed(2)}.`,
      }));
    } else {
      set({ lastMessage: 'Futures contracts close via Take Profit, Stop Loss, or Liquidation triggers.' });
      return { ok: false };
    }

    setTimeout(() => persistToServer(get), 0);
    return { ok: true };
  },

  syncMarketPrices: (marketAssets) =>
    set((state) => {
      let updatedBalance = state.balance;
      let transactions = [...state.transactions];
      let pendingOrders = [...state.pendingOrders];
      let holdings = [...state.holdings];
      let logs = [];

      pendingOrders = pendingOrders.filter((order) => {
        const found = marketAssets.find((a) => a.id === order.assetId);
        if (!found) return true;
        const livePrice = Number(found.price);

        const triggered = (order.direction === 'buy' && livePrice <= order.limitPrice) ||
          (order.direction === 'sell' && livePrice >= order.limitPrice);

        if (triggered) {
          const totalSize = order.quantity * order.limitPrice;

          if (order.direction === 'buy') {
            if (order.instrumentType === 'stock' || order.instrumentType === 'earn') {
              const idx = holdings.findIndex(h => h.id === order.assetId && h.instrumentType === order.instrumentType);
              if (idx > -1) {
                const ex = holdings[idx];
                const nextQty = Number((ex.quantity + order.quantity).toFixed(8));
                holdings[idx] = {
                  ...ex,
                  quantity: nextQty,
                  averagePrice: Number(((ex.averagePrice * ex.quantity + totalSize) / nextQty).toFixed(2)),
                };
              } else {
                holdings.push({
                  id: order.assetId, symbol: order.symbol, name: order.name, quantity: order.quantity,
                  averagePrice: order.limitPrice, currentPrice: livePrice, type: order.type, instrumentType: order.instrumentType,
                });
              }
            } else if (order.instrumentType === 'futures') {
              const marginCost = totalSize / Number(order.futuresOptions?.leverage || 1);
              holdings.push({
                id: `${order.assetId}-futures-${crypto.randomUUID().slice(0, 4)}`,
                assetId: order.assetId, symbol: order.symbol, name: order.name, quantity: order.quantity,
                averagePrice: order.limitPrice, currentPrice: livePrice, type: order.type, instrumentType: 'futures',
                direction: order.futuresOptions?.direction || 'long', leverage: Number(order.futuresOptions?.leverage || 1),
                margin: marginCost, stopLoss: order.futuresOptions?.stopLoss || null, takeProfit: order.futuresOptions?.takeProfit || null,
                liquidationPrice: order.futuresOptions?.liquidationPrice || 0, unrealizedPnL: 0,
              });
            }
          } else if (order.direction === 'sell') {
            const idx = holdings.findIndex(h => h.id === order.assetId && h.instrumentType === order.instrumentType);
            if (idx > -1) {
              holdings[idx].quantity = Number((holdings[idx].quantity - order.quantity).toFixed(8));
              updatedBalance += totalSize;
            }
            holdings = holdings.filter(h => h.quantity > 0);
          }

          transactions.unshift({
            id: crypto.randomUUID(), type: order.direction, assetName: `${order.name} (Limit)`,
            symbol: order.symbol, quantity: order.quantity, price: order.limitPrice, total: totalSize,
            time: new Date().toLocaleTimeString(), instrumentType: order.instrumentType,
          });

          logs.push(`Limit ${order.direction} filled for ${order.quantity} ${order.symbol} at $${order.limitPrice.toFixed(2)}.`);
          return false;
        }
        return true;
      });

      const nextHoldings = holdings.map((holding) => {
        const baseAssetId = holding.assetId || holding.id.split('-')[0];
        const found = marketAssets.find((a) => a.id === baseAssetId);

        if (!found) return holding;
        const nextPrice = Number(found.price);

        if (holding.instrumentType === 'stock') {
          return { ...holding, currentPrice: nextPrice };
        }

        if (holding.instrumentType === 'earn') {
          const APY = 0.12;
          const SECONDS_IN_YEAR = 31536000;
          const yieldPerSec = APY / SECONDS_IN_YEAR;
          const compoundedQuantity = holding.quantity + (holding.quantity * yieldPerSec);
          return { ...holding, currentPrice: nextPrice, quantity: compoundedQuantity };
        }

        const priceDiff = holding.direction === 'long'
          ? nextPrice - holding.averagePrice
          : holding.averagePrice - nextPrice;
        const unrealizedPnL = priceDiff * holding.quantity;

        let triggered = false;
        let reason = '';
        if (holding.direction === 'long' && nextPrice <= holding.liquidationPrice) { triggered = true; reason = 'Liquidation'; }
        if (holding.direction === 'short' && nextPrice >= holding.liquidationPrice) { triggered = true; reason = 'Liquidation'; }
        if (!triggered && holding.stopLoss) {
          if (holding.direction === 'long' && nextPrice <= holding.stopLoss) { triggered = true; reason = 'Stop Loss'; }
          if (holding.direction === 'short' && nextPrice >= holding.stopLoss) { triggered = true; reason = 'Stop Loss'; }
        }
        if (!triggered && holding.takeProfit) {
          if (holding.direction === 'long' && nextPrice >= holding.takeProfit) { triggered = true; reason = 'Take Profit'; }
          if (holding.direction === 'short' && nextPrice <= holding.takeProfit) { triggered = true; reason = 'Take Profit'; }
        }

        if (triggered) {
          const finalPayout = Math.max(0, reason === 'Liquidation' ? 0 : holding.margin + unrealizedPnL);
          updatedBalance = Number((updatedBalance + finalPayout).toFixed(2));
          transactions.unshift({
            id: crypto.randomUUID(), type: 'futures_close', assetName: `${holding.name} (${reason})`,
            symbol: holding.symbol, quantity: holding.quantity, price: nextPrice,
            total: finalPayout,
            pnl: unrealizedPnL,
            margin: holding.margin,
            time: new Date().toLocaleTimeString(), instrumentType: 'futures',
          });
          const sign = unrealizedPnL >= 0 ? 'won' : 'lost';
          logs.push(`Closed ${holding.symbol.toUpperCase()} Futures via ${reason}! You ${sign} $${Math.abs(unrealizedPnL).toFixed(2)}.`);
          return null;
        }

        return { ...holding, currentPrice: nextPrice, unrealizedPnL };
      }).filter(Boolean);

      return {
        balance: updatedBalance,
        holdings: nextHoldings,
        pendingOrders,
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
        balance: p.balance,
        holdings: p.holdings || [],
        transactions: p.transactions || [],
        pendingOrders: p.pendingOrders || [],
        lastMessage: p.lastMessage,
      });
      return p;
    } catch (_) {
      return null;
    }
  },
}));

export { usePortfolioStore };