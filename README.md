# Market Simulator

React-курсова робота для симуляції фінансового ринку та крипто-трейдингу.

## Функціональність

- окремі сторінки для крипти, акцій, валют і портфоліо
- глобальний стан через `Zustand`
- live-крипта з Binance + CoinGecko fallback
- live-акції через локальний API-проксі до Stooq
- live-валюта через currency API з динамічними змінами відносно USD
- форма купівлі/продажу та портфоліо з історією транзакцій

## Запуск

```bash
npm install
npm run dev
```

`npm run dev` запускає і Vite, і локальний API-сервер для акцій.

## MySQL (optional)

By default the API persists users/sessions/portfolio into a local JSON file (`server/market.json`).

To switch persistence to MySQL:

Note: the database is an external service. It is not “inside the repo”, so other people who clone from GitHub must run their own MySQL (or you deploy a shared backend + DB).

0) Start a MySQL server.

On Windows (service install), start it from **Services** (MySQL80) or run PowerShell as Administrator:

```powershell
Start-Service MySQL80
```

1) Create a database (example):

Important: this is **SQL** — run it inside MySQL (e.g. MySQL Workbench or the `mysql` CLI), not in PowerShell.

```sql
CREATE DATABASE market_simulator
	CHARACTER SET utf8mb4
	COLLATE utf8mb4_unicode_ci;
```

Example using the MySQL CLI:

```bash
mysql -u root -p
```

Then paste the SQL and run it.

2) Create `.env` from `.env.example` and set:

- `DB_DRIVER=mysql`
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`

### Option A: Docker (recommended for collaborators)

This repo includes `docker-compose.yml` so anyone can start MySQL without installing it:

```bash
docker compose up -d mysql
```

Then copy `.env.example` to `.env`, set `DB_DRIVER=mysql`, and run:

```bash
npm run dev
```

### Option B: Local MySQL install

Use the MySQL service/installer on your machine and point `.env` to it.

3) Run:

```bash
npm run dev
```

Tables are auto-created on startup.

Quick verification:

- Open `/api/health` and check `"persistence": "mysql"`.
- Note: if port `8787` is already taken, the dev runner will auto-pick another port and print it in the console.
