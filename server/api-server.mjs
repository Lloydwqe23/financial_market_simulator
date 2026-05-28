import 'dotenv/config';

import http from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret';

const HOST = process.env.API_HOST || '127.0.0.1';
const PORT = Number(process.env.API_PORT) || 8787;

// Persistence
const jsonPath = path.join(__dirname, 'market.json');
let store = { nextUserId: 1, users: [], sessions: {}, portfolios: {} };
try {
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    store = JSON.parse(raw);
  }
} catch (e) {
  console.warn('Failed to read JSON store, starting fresh');
}

function persistStore() {
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to persist store', e);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when DB_DRIVER=mysql`);
  return value;
}

async function ensureMySqlSchema(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(320) NOT NULL,
      salt VARCHAR(64) NOT NULL,
      hash VARCHAR(64) NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(512) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      exp BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (token),
      KEY idx_sessions_user_id (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS portfolios (
      user_id INT UNSIGNED NOT NULL,
      data LONGTEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_portfolios_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function createMySqlStatements(pool) {
  return {
    insertUser: {
      run: async (email, salt, hash, created_at) => {
        const [result] = await pool.execute(
          'INSERT INTO users (email, salt, hash, created_at) VALUES (?, ?, ?, ?)',
          [email, salt, hash, created_at],
        );
        return { lastInsertRowid: result.insertId };
      },
    },
    getUserByEmail: {
      get: async (email) => {
        const [rows] = await pool.execute(
          'SELECT id, email, salt, hash, created_at FROM users WHERE email = ? LIMIT 1',
          [email],
        );
        return rows[0];
      },
    },
    insertSession: {
      run: async (token, user_id, exp, created_at) => {
        await pool.execute(
          `INSERT INTO sessions (token, user_id, exp, created_at)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), exp = VALUES(exp), created_at = VALUES(created_at)`,
          [token, user_id, exp, created_at],
        );
      },
    },
    getSession: {
      get: async (token) => {
        const [rows] = await pool.execute(
          `SELECT s.token, s.exp, s.user_id, u.email
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token = ?
           LIMIT 1`,
          [token],
        );
        return rows[0];
      },
    },
    deleteSession: {
      run: async (token) => {
        await pool.execute('DELETE FROM sessions WHERE token = ?', [token]);
      },
    },
    getPortfolio: {
      get: async (user_id) => {
        const [rows] = await pool.execute('SELECT data FROM portfolios WHERE user_id = ? LIMIT 1', [user_id]);
        return rows[0];
      },
    },
    upsertPortfolio: {
      run: async (user_id, data, updated_at) => {
        await pool.execute(
          `INSERT INTO portfolios (user_id, data, updated_at)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)`,
          [user_id, data, updated_at],
        );
      },
    },
  };
}

let persistenceDriver = 'json';
let closePersistence = async () => {};

let statements = {
  insertUser: {
    run: async (email, salt, hash, created_at) => {
      const id = store.nextUserId++;
      store.users.push({ id, email, salt, hash, created_at });
      persistStore();
      return { lastInsertRowid: id };
    },
  },
  getUserByEmail: {
    get: async (email) => store.users.find((u) => u.email === email) || undefined,
  },
  insertSession: {
    run: async (token, user_id, exp, created_at) => {
      store.sessions[token] = { token, user_id, exp, created_at };
      persistStore();
    },
  },
  getSession: {
    get: async (token) => {
      const s = store.sessions[token];
      if (!s) return undefined;
      const user = store.users.find((u) => u.id === s.user_id);
      return { token: s.token, exp: s.exp, user_id: s.user_id, email: user?.email };
    },
  },
  deleteSession: {
    run: async (token) => {
      delete store.sessions[token];
      persistStore();
    },
  },
  getPortfolio: {
    get: async (user_id) => {
      const p = store.portfolios[user_id];
      if (!p) return undefined;
      return { data: JSON.stringify(p) };
    },
  },
  upsertPortfolio: {
    run: async (user_id, data, updated_at) => {
      try {
        store.portfolios[user_id] = JSON.parse(data);
      } catch (e) {
        store.portfolios[user_id] = {};
      }
      persistStore();
    },
  },
};

if (String(process.env.DB_DRIVER || '').toLowerCase() === 'mysql') {
  try {
    const mysql = await import('mysql2/promise');
    const database = requiredEnv('MYSQL_DATABASE');
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database,
      waitForConnections: true,
      connectionLimit: 10,
    });

    await pool.query('SELECT 1');
    await ensureMySqlSchema(pool);

    statements = createMySqlStatements(pool);
    persistenceDriver = 'mysql';
    closePersistence = async () => pool.end();
    console.log(`Persistence: MySQL (${process.env.MYSQL_HOST || '127.0.0.1'}:${process.env.MYSQL_PORT || 3306}/${database})`);
  } catch (e) {
    console.warn('MySQL init failed, falling back to JSON store:', e?.message || e);
    console.log(`Persistence: JSON (${jsonPath})`);
  }
} else {
  console.log(`Persistence: JSON (${jsonPath})`);
}

const DEFAULT_PORTFOLIO = {
  balance: 10000,
  holdings: [],
  transactions: [],
  lastMessage: 'Start by buying your first asset on the dashboard.',
};

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

function signToken(payload, secret = AUTH_SECRET) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token, secret = AUTH_SECRET) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function hashPassword(password, salt = null) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePortfolio(input) {
  // If the incoming payload has a nested .portfolio key object, extract it safely
  const target = input?.portfolio ? input.portfolio : input;

  const balance = Number(target?.balance);
  
  const normalizedHoldings = Array.isArray(target?.holdings)
    ? target.holdings.map((holding) => ({
        id: String(holding?.id || ''),
        symbol: String(holding?.symbol || ''),
        name: String(holding?.name || ''),
        quantity: Number(holding?.quantity || 0),
        averagePrice: Number(holding?.averagePrice || 0),
        currentPrice: Number(holding?.currentPrice || 0),
        type: String(holding?.type || 'crypto'),
        instrumentType: String(holding?.instrumentType || 'stock'),
        
        // Optional derivative contract parameters
        direction: holding?.direction ? String(holding.direction) : null,
        leverage: holding?.leverage ? Number(holding.leverage) : null,
        margin: holding?.margin ? Number(holding.margin) : null,
        stopLoss: holding?.stopLoss ? Number(holding.stopLoss) : null,
        takeProfit: holding?.takeProfit ? Number(holding.takeProfit) : null,
        liquidationPrice: holding?.liquidationPrice ? Number(holding.liquidationPrice) : null,
        unrealizedPnL: holding?.unrealizedPnL ? Number(holding.unrealizedPnL) : 0,
      }))
    : [];

  const normalizedTransactions = Array.isArray(target?.transactions)
    ? target.transactions.map((tx) => ({
        id: String(tx?.id || ''),
        type: String(tx?.type || 'buy'),
        assetName: String(tx?.assetName || ''),
        symbol: String(tx?.symbol || ''),
        quantity: Number(tx?.quantity || 0),
        price: Number(tx?.price || 0),
        total: Number(tx?.total || 0),
        time: String(tx?.time || ''),
        instrumentType: String(tx?.instrumentType || 'stock'),
      }))
    : [];

  return {
    balance: Number.isFinite(balance) ? balance : 10000,
    holdings: normalizedHoldings,
    transactions: normalizedTransactions,
    lastMessage: typeof target?.lastMessage === 'string' ? target.lastMessage : 'Portfolio updated.',
  };
}

async function loadPortfolio(userId) {
  const row = await statements.getPortfolio.get(userId);
  if (!row) {
    const payload = DEFAULT_PORTFOLIO;
    await statements.upsertPortfolio.run(userId, JSON.stringify(payload), Date.now());
    return payload;
  }

  try {
    const data = JSON.parse(row.data);
    return normalizePortfolio(data);
  } catch (e) {
    return DEFAULT_PORTFOLIO;
  }
}

async function savePortfolio(userId, portfolio) {
  const payload = normalizePortfolio(portfolio);
  await statements.upsertPortfolio.run(userId, JSON.stringify(payload), Date.now());
  return payload;
}

async function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/, '') || cookies.auth;

  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) {
    await statements.deleteSession.run(token);
    return null;
  }

  const session = await statements.getSession.get(token);
  if (!session) return null;

  if (Date.now() > session.exp) {
    await statements.deleteSession.run(token);
    return null;
  }

  return { token, email: session.email, userId: session.user_id };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const STOCK_WATCHLIST = [
  { id: 'aapl', symbol: 'AAPL', name: 'Apple' },
  { id: 'msft', symbol: 'MSFT', name: 'Microsoft' },
  { id: 'nvda', symbol: 'NVDA', name: 'NVIDIA' },
  { id: 'amzn', symbol: 'AMZN', name: 'Amazon' },
  { id: 'meta', symbol: 'META', name: 'Meta' },
  { id: 'googl', symbol: 'GOOGL', name: 'Alphabet' },
  { id: 'tsla', symbol: 'TSLA', name: 'Tesla' },
  { id: 'jpm', symbol: 'JPM', name: 'JPMorgan' },
  { id: 'v', symbol: 'V', name: 'Visa' },
  { id: 'ma', symbol: 'MA', name: 'Mastercard' },
  { id: 'unh', symbol: 'UNH', name: 'UnitedHealth' },
  { id: 'jnj', symbol: 'JNJ', name: 'Johnson & Johnson' },
  { id: 'xom', symbol: 'XOM', name: 'Exxon Mobil' },
  { id: 'pg', symbol: 'PG', name: 'Procter & Gamble' },
  { id: 'hd', symbol: 'HD', name: 'Home Depot' },
  { id: 'bac', symbol: 'BAC', name: 'Bank of America' },
  { id: 'avgo', symbol: 'AVGO', name: 'Broadcom' },
  { id: 'cost', symbol: 'COST', name: 'Costco' },
  { id: 'nflx', symbol: 'NFLX', name: 'Netflix' },
  { id: 'dis', symbol: 'DIS', name: 'Disney' },
  { id: 'ko', symbol: 'KO', name: 'Coca-Cola' },
  { id: 'pep', symbol: 'PEP', name: 'PepsiCo' },
  { id: 'orcl', symbol: 'ORCL', name: 'Oracle' },
  { id: 'intc', symbol: 'INTC', name: 'Intel' },
  { id: 'amd', symbol: 'AMD', name: 'AMD' },
  { id: 'qcom', symbol: 'QCOM', name: 'Qualcomm' },
];

const STOCK_CACHE_TTL_MS = Number(process.env.STOCK_CACHE_TTL_MS) || 5000;
let cachedStocks = { updatedAtMs: 0, updatedAtIso: null, quotes: null };
let stocksInFlight = null;

async function loadStockQuotesCached() {
  const now = Date.now();
  if (cachedStocks.quotes && now - cachedStocks.updatedAtMs < STOCK_CACHE_TTL_MS) {
    return { updatedAt: cachedStocks.updatedAtIso, quotes: cachedStocks.quotes };
  }

  if (stocksInFlight) {
    const result = await stocksInFlight;
    return { updatedAt: result.updatedAtIso, quotes: result.quotes };
  }

  stocksInFlight = (async () => {
    const quotes = await Promise.all(
      STOCK_WATCHLIST.map(async (stock) => {
        try {
          return await fetchStockQuote(stock);
        } catch (error) {
          return {
            id: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            type: 'stock',
            price: null,
            change24h: null,
            marketCapRank: 0,
            source: 'error',
            error: error.message,
          };
        }
      }),
    );

    const updatedAtIso = new Date().toISOString();
    cachedStocks = { updatedAtMs: Date.now(), updatedAtIso, quotes };
    return { updatedAtIso, quotes };
  })().finally(() => {
    stocksInFlight = null;
  });

  const result = await stocksInFlight;
  return { updatedAt: result.updatedAtIso, quotes: result.quotes };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStooqCsv(text, fallbackSymbol, fallbackName) {
  const row = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.toLowerCase().startsWith('symbol'));

  if (!row) {
    throw new Error(`No data returned for ${fallbackSymbol}`);
  }

  const [symbol, date, time, open, high, low, close, volume] = row.split(',');
  const openPrice = toNumber(open);
  const closePrice = toNumber(close);

  return {
    id: fallbackSymbol.toLowerCase(),
    symbol: fallbackSymbol,
    name: fallbackName,
    type: 'stock',
    price: closePrice ?? openPrice ?? 0,
    change24h: openPrice && closePrice ? ((closePrice - openPrice) / openPrice) * 100 : 0,
    marketCapRank: 0,
    source: 'stooq',
    quoteDate: date ?? null,
    quoteTime: time ?? null,
    volume: toNumber(volume),
    upstreamSymbol: symbol ?? `${fallbackSymbol}.US`,
    high: toNumber(high),
    low: toNumber(low),
    open: openPrice,
  };
}

function parseStooqDailyHistoryCsv(text, fallbackSymbol, fallbackName) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    throw new Error(`No history returned for ${fallbackSymbol}`);
  }

  const dataRows = rows.filter((line) => !line.toLowerCase().startsWith('date,'));
  const candles = dataRows
    .map((row) => {
      const [date, open, high, low, close] = row.split(',');
      const t = Date.parse(date);
      const openPrice = toNumber(open);
      const highPrice = toNumber(high);
      const lowPrice = toNumber(low);
      const closePrice = toNumber(close);

      if (!Number.isFinite(t) || ![openPrice, highPrice, lowPrice, closePrice].every((v) => typeof v === 'number')) {
        return null;
      }

      return {
        t,
        open: openPrice,
        high: highPrice,
        low: lowPrice,
        close: closePrice,
      };
    })
    .filter(Boolean);

  if (candles.length < 2) {
    throw new Error(`History parse failed for ${fallbackSymbol}`);
  }

  return {
    id: fallbackSymbol.toLowerCase(),
    symbol: fallbackSymbol,
    name: fallbackName,
    type: 'stock',
    candles,
  };
}

async function fetchStockHistory(stock) {
  const url = `https://stooq.com/q/d/l/?s=${stock.symbol.toLowerCase()}.us&i=d`;
  const response = await fetch(url, { headers: { accept: 'text/csv,*/*' } });

  if (!response.ok) {
    throw new Error(`Stooq history request failed for ${stock.symbol}`);
  }

  const text = await response.text();
  return parseStooqDailyHistoryCsv(text, stock.symbol, stock.name);
}

async function fetchStockQuote(stock) {
  const url = `https://stooq.com/q/l/?s=${stock.symbol.toLowerCase()}.us&f=sd2t2ohlcv&e=csv`;
  const response = await fetch(url, { headers: { accept: 'text/csv,*/*' } });

  if (!response.ok) {
    throw new Error(`Stooq request failed for ${stock.symbol}`);
  }

  const text = await response.text();
  return parseStooqCsv(text, stock.symbol, stock.name);
}

function getOrigin(req) {
  return req.headers.origin || '*';
}

function sendJson(res, req, statusCode, payload, extraHeaders = {}) {
  const origin = getOrigin(req);
  res.writeHead(statusCode, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }, extraHeaders));
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, req, 400, { error: 'Missing URL' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    const origin = getOrigin(req);
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    });
    res.end();
    return;
  }

  if (requestUrl.pathname === '/api/health') {
    sendJson(res, req, 200, {
      ok: true,
      service: 'market-simulator-api',
      time: new Date().toISOString(),
      host: HOST,
      port: PORT,
      persistence: persistenceDriver,
    });
    return;
  }

  if (requestUrl.pathname === '/api/stocks') {
    try {
      const { quotes, updatedAt } = await loadStockQuotesCached();

      sendJson(res, req, 200, {
        source: 'stooq-proxy',
        updatedAt,
        quotes,
      });
    } catch (error) {
      sendJson(res, req, 500, { error: error.message });
    }
    return;
  }

  if (requestUrl.pathname === '/api/stocks/history') {
    try {
      const id = String(requestUrl.searchParams.get('id') || '').trim().toLowerCase();
      const limit = Math.max(20, Math.min(800, Number(requestUrl.searchParams.get('limit') || 320)));

      const stock = STOCK_WATCHLIST.find((item) => item.id === id || item.symbol.toLowerCase() === id);
      if (!stock) {
        sendJson(res, req, 404, { error: 'unknown stock' });
        return;
      }

      const history = await fetchStockHistory(stock);
      const candles = Array.isArray(history?.candles) ? history.candles : [];
      const sliced = candles.slice(-limit);

      sendJson(res, req, 200, {
        id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        candles: sliced,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      sendJson(res, req, 500, { error: error.message });
    }
    return;
  }

  // Registration
  if (requestUrl.pathname === '/api/register' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const { email, password } = body || {};
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !password) {
        sendJson(res, req, 400, { error: 'email and password required' });
        return;
      }
      if (!normalizedEmail.includes('@')) {
        sendJson(res, req, 400, { error: 'valid email required' });
        return;
      }
      const existing = await statements.getUserByEmail.get(normalizedEmail);
      if (existing) {
        sendJson(res, req, 409, { error: 'user exists' });
        return;
      }
      const { salt, hash } = hashPassword(password);
      const info = await statements.insertUser.run(normalizedEmail, salt, hash, Date.now());
      if (!info || !info.lastInsertRowid) {
        sendJson(res, req, 500, { error: 'failed to create user' });
        return;
      }
      sendJson(res, req, 201, { ok: true });
    } catch (e) {
      sendJson(res, req, 500, { error: e.message });
    }
    return;
  }

  // Login
  if (requestUrl.pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const { email, password } = body || {};
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !password) {
        sendJson(res, req, 400, { error: 'email and password required' });
        return;
      }
      const stored = await statements.getUserByEmail.get(normalizedEmail);
      if (!stored) {
        sendJson(res, req, 401, { error: 'invalid credentials' });
        return;
      }
      const { hash } = hashPassword(password, stored.salt);
      if (hash !== stored.hash) {
        sendJson(res, req, 401, { error: 'invalid credentials' });
        return;
      }

      const exp = Date.now() + 1000 * 60 * 60 * 24; // 24h
      const token = signToken({ email: normalizedEmail, exp });
      await statements.insertSession.run(token, stored.id, exp, Date.now());

      sendJson(res, req, 200, { token, email: normalizedEmail }, {
        'Set-Cookie': `auth=${token}; Path=/; HttpOnly; SameSite=Lax`,
      });
    } catch (e) {
      sendJson(res, req, 500, { error: e.message });
    }
    return;
  }

  // Logout
  if (requestUrl.pathname === '/api/logout' && req.method === 'POST') {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/, '') || cookies.auth;
      if (token) await statements.deleteSession.run(token);
      sendJson(res, req, 200, { ok: true }, { 'Set-Cookie': 'auth=; Path=/; HttpOnly; Max-Age=0' });
    } catch (e) {
      sendJson(res, req, 500, { error: e.message });
    }
    return;
  }

  // Who am I
  if (requestUrl.pathname === '/api/me' && req.method === 'GET') {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        sendJson(res, req, 401, { error: 'not authenticated' });
        return;
      }
      const portfolio = await loadPortfolio(session.userId);
      sendJson(res, req, 200, { email: session.email, userId: session.userId, portfolio });
    } catch (e) {
      sendJson(res, req, 500, { error: e.message });
    }
    return;
  }

  // Portfolio endpoints
  if (requestUrl.pathname === '/api/portfolio' && req.method === 'GET') {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        sendJson(res, req, 401, { error: 'not authenticated' });
        return;
      }
      const portfolio = await loadPortfolio(session.userId);
      sendJson(res, req, 200, { portfolio });
    } catch (e) {
      sendJson(res, req, 500, { error: e.message });
    }
    return;
  }

  if (requestUrl.pathname === '/api/portfolio' && req.method === 'POST') {
    try {
      const session = await getSessionFromRequest(req);
      if (!session) {
        sendJson(res, req, 401, { error: 'not authenticated' });
        return;
      }
      const body = await readJsonBody(req);
      const saved = await savePortfolio(session.userId, body);
      sendJson(res, req, 200, { portfolio: saved });
    } catch (e) {
      sendJson(res, req, 500, { error: e.message });
    }
    return;
  }

  sendJson(res, req, 404, { error: 'Not found' });
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`API port already in use: http://${HOST}:${PORT}`);
    process.exit(1);
  }
  throw err;
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    await new Promise((resolve) => server.close(() => resolve()));
  } catch {
    // ignore
  }

  try {
    await closePersistence();
  } catch {
    // ignore
  }

  if (signal) {
    console.log(`Shutdown complete (${signal}).`);
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT').finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').finally(() => process.exit(0));
});

server.listen(PORT, HOST, () => {
  console.log(`API server listening on http://${HOST}:${PORT}`);
});