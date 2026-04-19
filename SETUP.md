# BrickStocks — Setup Guide

## Project Structure
```
BrickStocks/
├── index.html          ← Dashboard / Landing page
├── trade.html          ← Trade stocks, crypto, forex, commodities
├── portfolio.html      ← Portfolio tracker with P&L, charts, allocation
├── leaderboard.html    ← Global rankings with podium + tier system
├── league.html         ← 2-week league competitions ($10k per player)
├── research.html       ← News, stocks, crypto, forex, macro, earnings
├── agent.html          ← AI trading signals with self-learning
├── challenges.html     ← Daily/weekly challenges + Chips rewards
├── profile.html        ← User profile, stats, trade history
├── store.html          ← Buy Chips (fake premium currency)
├── css/
│   ├── shared.css      ← Global design system (colors, nav, components)
│   └── mobile.css      ← Responsive overrides
├── js/
│   ├── config.js       ← ← EDIT THIS FIRST (Supabase + API URLs)
│   ├── db.js           ← Supabase client
│   ├── auth.js         ← Auth modal, nav user, session handling
│   ├── market.js       ← Market data utilities + trade execution
│   └── mobile-nav.js   ← Mobile hamburger menu
└── backend/
    ├── main.py         ← FastAPI server
    ├── market_data.py  ← Data fetcher (Finnhub + yfinance + CoinGecko)
    ├── stock_agent.py  ← AI trading agent (RSI, MACD, sentiment, ML)
    ├── cron_update.py  ← Daily cron job
    ├── requirements.txt
    ├── .env.example    ← Copy to .env
    ├── render.yaml     ← Render deployment config
    └── schema/
        └── schema.sql  ← Full DB schema (run in Supabase)
```

## Step 1 — Supabase Setup

1. Create a new project at https://supabase.com
2. Go to **SQL Editor** → paste the contents of `backend/schema/schema.sql` → Run
3. Go to **Settings → API** and copy:
   - Project URL
   - `anon` public key
4. Open `js/config.js` and replace:
   ```js
   window.BS_SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   window.BS_SUPABASE_KEY = 'YOUR-ANON-KEY';
   ```

## Step 2 — Finnhub API Key (Free)

1. Register at https://finnhub.io → free tier (60 req/min)
2. Copy your API key
3. Set it in `backend/.env` as `FINNHUB_API_KEY=...`

## Step 3 — Deploy Frontend (Vercel)

```bash
# From BrickStocks/ directory
npx vercel --prod
```
Or connect the GitHub repo to Vercel dashboard.

## Step 4 — Deploy Backend (Render)

1. Push `BrickStocks/backend/` to a GitHub repo
2. Connect to Render: https://render.com → New Web Service
3. Use the `render.yaml` config
4. Add environment variables in Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (service role key from Supabase settings)
   - `FINNHUB_API_KEY`
5. After deploy, update `js/config.js`:
   ```js
   window.BS_API_BASE = 'https://YOUR-APP.onrender.com';
   ```

## Step 5 — Local Development

```bash
# Frontend: just open index.html in browser
# Or use a local server:
npx serve .

# Backend:
cd backend
pip install -r requirements.txt
cp .env.example .env  # fill in your keys
uvicorn main:app --reload
```

## Currency System

| Currency | What it is | How to get |
|----------|-----------|------------|
| **Virtual USD ($)** | Trading money for portfolio & leagues | Everyone starts with $10,000. Leagues reset each sprint. |
| **Chips (🪙)** | Premium in-app currency | Buy with real money, earn from challenges, win leagues |

- $100 virtual = same in-game value as $100 real (1:1 ratio, just like a demo account)
- Chips are for premium features, not for trading

## Tier System

| Tier    | Trophies Required | Perks |
|---------|-----------------|-------|
| 🌱 Rookie | 0 | Base access |
| 📈 Trader | 100 | Cyan badge |
| 🔬 Analyst | 300 | Blue badge |
| 💎 Expert | 600 | Purple badge |
| 👑 Legend | 1,000 | Gold badge + elite league access |

## AI Agent

The AI agent runs nightly and generates buy/sell/hold/watch signals for:
- **Stocks**: AAPL, MSFT, NVDA, TSLA, AMZN, META, GOOGL, JPM, V, AMD, NFLX + more
- **Crypto**: BTC, ETH, SOL, BNB, ADA, AVAX, DOGE, XRP
- **Forex**: EUR/USD, GBP/USD, USD/JPY, AUD/USD
- **Commodities**: Gold, Silver, Oil, Natural Gas, Copper

Signals use:
- **Technical (40%)**: RSI, MACD, Bollinger Bands, EMA crossovers, volume
- **Sentiment (30%)**: News headline NLP scoring
- **Fundamental (30%)**: P/E, revenue growth, margins, ROE

The agent tracks its own trade outcomes and adjusts indicator weights via `agent_config` table.
