Market Simulator
A React-based financial market and cryptocurrency trading simulation platform. This application provides a sandbox environment for tracking asset data, managing portfolios, and simulating spot and futures execution.

Features
Asset Tracking and Data Integration
Cryptocurrency Feeds: Real-time price updates fetched via the Binance API, with an automatic fallback to the CoinGecko API to ensure constant uptime.

Equity Markets: Real-time stock data delivered through a custom local API proxy routing directly to Stooq.

Forex Matrix: Live currency exchange rates sourced via a specialized currency API, featuring dynamic fluctuation modeling calculated relative to a base USD value.

Interactive Charting Terminal: Custom-built HTML Canvas candle charts providing interactive zoom and pan controls, dynamic timeline scaling, live crosshair HUD tracking, and real-time technical analysis indicators (Simple Moving Averages and Bollinger Bands).

Trading Simulation Engine
Account Ecosystem: Full support for secure user registration, session management, authenticated persistent portfolios, and initial paper-trading asset distributions.

Execution Panel: Fully operational Spot market buy and sell triggers along with a high-leverage Futures trading desk.

Risk Management Systems: Advanced architectural support for real-time portfolio risk overwatch loops, tracking live automated liquidations, Stop Loss targets, and Take Profit execution boundaries on a per-second baseline clock.

Transaction Ledger: Comprehensive database archiving all incoming fund deposits, spot purchases, options closures, and historical liquidations.

Architecture and State Management
State Management: Core client states, account values, current token parameters, and active transactions are centralized using a unified Zustand memory store model.

Data Persistence Engine: Built with a clean, dual-driver abstractions layer. The application saves layout states locally to an encrypted flat JSON ledger by default, but it can pivot seamlessly to an enterprise relational schema without forcing front-end logic overrides.

Installation and Deployment
Ensure you have Node.js installed on your local environment before proceeding.

Standard Setup
Install the necessary dependencies and initialize the development servers:

Bash
npm install
npm run dev
The unified npm run dev script starts the Vite front-end client interface and launches the concurrent back-end micro-service responsible for data proxying and asset persistence.

Persistent Database Engine Configuration (Optional)
By default, the application runs entirely standalone, persisting user credentials, authorization sessions, and asset portfolios locally into a JSON storage file located at server/market.json.

To scale up and pivot your configuration to a structured MySQL database instance, follow the initialization instructions below.

1. Initialize the MySQL Instance
Start your local database database service runner.

On Windows (Native Service Install): Open PowerShell as an Administrator and execute:

PowerShell
Start-Service MySQL80
Alternative Deployment via Docker (Recommended for cross-platform environments): A pre-configured container blueprint is included in the project root directory. Spin up a production-ready isolated MySQL image by running:

Bash
docker compose up -d mysql
2. Prepare the Database Schema
Access your preferred database command-line interface or administration tool (such as MySQL Workbench) and execute the structural creation query:

SQL
CREATE DATABASE market_simulator
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
3. Bind Environmental Environment Variables
Duplicate the distributed .env.example file to create a localized configurations environment file named .env:

Bash
cp .env.example .env
Open the newly created .env file and update your variables to route through the database driver:

Code snippet
DB_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=your_username
MYSQL_PASSWORD=your_secure_password
MYSQL_DATABASE=market_simulator
4. Run the Platform
Launch the development workflow suite:

Bash
npm run dev
The back-end initialization lifecycle maps, validates, and builds all necessary relational database schemas automatically on boot.