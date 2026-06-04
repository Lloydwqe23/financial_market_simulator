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
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        set({
          user: {
            email: data.email,
            id: data.userId,
            displayName: data.displayName // Loads the database value on boot
          }
        });
      }
    } catch (_) {}
  },

  updateDisplayName: async (newName) => {
    try {
      const res = await fetch('/api/user/update-name', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newName })
      });

      if (res.ok) {
        set((state) => {
          if (!state.user) return state;
          return {
            user: {
              ...state.user,
              displayName: newName.trim()
            }
          };
        });
      }
    } catch (err) {
      console.error('Failed to persist custom username to database:', err);
    }
  },
}));

export default useAuthStore;
