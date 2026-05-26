import create from 'zustand';
import { usePortfolioStore } from './portfolioStore';

const STORAGE_KEY = 'marketSimulator.auth';
const canUseStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function readStoredAuth() {
  if (!canUseStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.email !== 'string') return null;
    return { user: { email: data.email }, token: data.token ?? null };
  } catch (e) {
    return null;
  }
}

function writeStoredAuth(user, token) {
  if (!canUseStorage) return;
  try {
    if (!user?.email) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: user.email, token: token ?? null }));
  } catch (e) {
    // ignore storage errors
  }
}

const storedAuth = readStoredAuth();

export const useAuthStore = create((set, get) => ({
  user: storedAuth?.user ?? null,
  token: storedAuth?.token ?? null,
  loading: false,
  error: null,
  setUser: (user, token) => {
    writeStoredAuth(user, token);
    set({ user, token, error: null });
  },
  clear: () => {
    writeStoredAuth(null, null);
    set({ user: null, token: null });
  },
  register: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'register failed');
      }
      set({ loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: e.message });
      return false;
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'login failed');
      const user = { email: data.email };
      writeStoredAuth(user, data.token);
      set({ user, token: data.token, loading: false });

      // hydrate portfolio after login
      try {
        const pRes = await fetch('/api/portfolio', { credentials: 'include' });
        if (pRes.ok) {
          const pData = await pRes.json();
          const portfolio = pData.portfolio;
          if (portfolio) {
            usePortfolioStore.setState({
              balance: portfolio.balance,
              holdings: portfolio.holdings,
              transactions: portfolio.transactions,
              lastMessage: portfolio.lastMessage,
            });
          }
        }
      } catch (e) {
        // ignore
      }
      return true;
    } catch (e) {
      set({ loading: false, error: e.message });
      return false;
    }
  },
  logout: async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // ignore
    }
    writeStoredAuth(null, null);
    set({ user: null, token: null });
    usePortfolioStore.setState({
      balance: 10000,
      holdings: [],
      transactions: [],
      lastMessage: 'Start by buying your first asset on the dashboard.',
    });
  },
  whoami: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) {
        writeStoredAuth(null, null);
        set({ loading: false, user: null, token: null });
        return null;
      }
      const data = await res.json();
      const user = { email: data.email };
      const token = get().token;
      writeStoredAuth(user, token);
      // if server returned portfolio, hydrate store
      if (data.portfolio) {
        usePortfolioStore.setState({
          balance: data.portfolio.balance,
          holdings: data.portfolio.holdings,
          transactions: data.portfolio.transactions,
          lastMessage: data.portfolio.lastMessage,
        });
      }
      set({ loading: false, user });
      return data.email;
    } catch (e) {
      writeStoredAuth(null, null);
      set({ loading: false, user: null });
      return null;
    }
  },
}));

export default useAuthStore;
