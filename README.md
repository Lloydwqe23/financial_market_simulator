# Financial Market Simulator

The Financial Market Simulator is a high-performance, React-based trading sandbox designed for real-time asset tracking and portfolio execution. Built on a concurrent Vite and Node.js architecture, the platform streams live cryptocurrency and equity data via Binance and Stooq integrations, complete with automatic API failovers. It features a custom HTML Canvas charting engine for interactive technical analysis, alongside a robust execution panel supporting both Spot and high-leverage Futures trading. 

The platform’s execution engine supports both standard Spot market paper-trading and a high-leverage Futures desk for different crypto,stock and currency markets. An advanced risk management loop operates in real-time, enforcing Stop Loss limits, Take Profit targets, and automated liquidations on a per-second baseline clock. All trades, deposits, and active holdings are tracked through a centralized Zustand state manager and recorded in a comprehensive transaction ledger. Profile registration support with statistical analisys for individual and overall trades. Finally, the system supports dual-driver data persistence, allowing users to easly download and analyse though separate resources via downloadable csv history. 

## Installation

Node.js is needed to compile and run the Market Simulator.
Most importantly you need an environment that supports the concurrent Vite front-end and back-end micro-services. By default, the app uses an encrypted flat JSON ledger (`server/market.json`) for data persistence, which requires less setup than what a full relational schema expects.
The easiest way to work around database configuration is to use this default JSON storage for your current session. The JSON ledger can coexist with your system without extra background services.
Typical dependencies are installed via `npm`. If the setup reports that live data is missing, ensure your network allows connections to the Binance API, CoinGecko, or Stooq for real-time asset feeds.

## Database Configuration & Initialization

This project utilizes a strict MySQL connection pool. The application requires the database engine to be running and the specific database namespace to exist before boot. 

If you are not using Docker, connect to your MySQL CLI or Workbench and execute:

```sql
CREATE DATABASE IF NOT EXISTS market_simulator
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

To see the reviews you need to create a place for them in the database

```sql
CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(36) PRIMARY KEY,
  userEmail VARCHAR(255) NOT NULL,
  rating INT NOT NULL,
  text TEXT NOT NULL,
  date VARCHAR(50) NOT NULL
);
```


## MySQL Database Workaround

If you already have a MySQL database instance and want to use it instead of the JSON ledger, initialize it and point the build to it:

```bash
docker compose up -d mysql
cp .env.example .env
```
If your environment does not ship a .env file, set the variables manually instead:

```bash
export DB_DRIVER="mysql"
export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="3306"
export MYSQL_USER="your_username"
export MYSQL_PASSWORD="your_secure_password"
export MYSQL_DATABASE="market_simulator"
````
To verify the database is in use, check the connection variables and schemas:

```bash
grep -E "DB_DRIVER|MYSQL_HOST" ".env"
mysql -V
mysql -u root -p -e "SHOW DATABASES;"
```


## Compiling

To build the Market Simulator with MySQL database acceleration, use the environment from above in the same shell and then run:

```bash
npm install
```

If a MySQL instance is not available on your system, the local JSON ledger is the alternative. The key point is that one persistent storage backend must be enabled so the simulator can build portfolio states without falling back to a broken ephemeral path.
Once configured, run the following to fully compile the application:
```bash
npm run build
```
Afterwards to not recompile everything every time you make a change, you can use the following command to only recompile based on the changed files:

```bash
npm run dev
```

## Usage
To initialize the database tables you can use the following command:

```bash
node server/init-db.js
```
