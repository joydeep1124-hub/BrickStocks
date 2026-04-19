"""
BrickStocks API — main.py
FastAPI server: market data, search, quotes, candles, news.
Deploy on Render (free tier).
"""

import os, time, json, asyncio
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from market_data import MarketDataService
from stock_agent import TradingAgent
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
FINNHUB_KEY  = os.getenv("FINNHUB_API_KEY", "")

db: Client = None
market: MarketDataService = None
agent: TradingAgent = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db, market, agent
    db     = create_client(SUPABASE_URL, SUPABASE_KEY)
    market = MarketDataService(finnhub_key=FINNHUB_KEY, db=db)
    agent  = TradingAgent(market=market, db=db)
    # Warm up market cache on startup
    asyncio.create_task(market.warm_cache())
    yield


app = FastAPI(title="BrickStocks API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Models ──────────────────────────────────────────────────────────

class BulkQuoteRequest(BaseModel):
    symbols: List[str]
    type: str = "stock"


# ─── Health ──────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "BrickStocks API"}

@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": int(time.time())}


# ─── Market data endpoints ────────────────────────────────────────────

@app.get("/market/quote")
async def get_quote(symbol: str, type: str = "stock"):
    """Get real-time quote for a symbol."""
    try:
        quote = await market.get_quote(symbol, type)
        if not quote:
            raise HTTPException(404, f"Quote not found for {symbol}")
        return quote
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/market/quotes")
async def get_bulk_quotes(req: BulkQuoteRequest):
    """Get quotes for multiple symbols."""
    try:
        quotes = await market.get_bulk_quotes(req.symbols, req.type)
        return quotes
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/market/candles")
async def get_candles(
    symbol: str,
    resolution: str = "D",
    from_ts: int = Query(None, alias="from"),
    to_ts:   int = Query(None, alias="to"),
    type:    str = "stock"
):
    """Get OHLCV candle data."""
    now  = int(time.time())
    from_ts = from_ts or now - 90 * 86400
    to_ts   = to_ts   or now
    try:
        candles = await market.get_candles(symbol, resolution, from_ts, to_ts, type)
        return candles or {}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/market/search")
async def search_symbols(q: str, types: str = "stock,etf,crypto"):
    """Search for symbols across asset classes."""
    try:
        type_list = [t.strip() for t in types.split(",")]
        results   = await market.search(q, type_list)
        return results
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/market/news")
async def get_news(symbol: Optional[str] = None, limit: int = 20):
    """Get market news, optionally filtered by symbol."""
    try:
        news = await market.get_news(symbol, limit)
        return news
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/market/overview")
async def market_overview():
    """Get market overview from Supabase cache."""
    try:
        result = db.table("market_cache").select("*").order("market_cap", desc=True).limit(60).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/market/trending")
async def trending():
    """Get top movers."""
    try:
        result = db.table("market_cache").select("*").order("change_pct_1d", desc=True).limit(10).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Agent endpoints ──────────────────────────────────────────────────

@app.get("/agent/signals")
async def get_signals(limit: int = 20, asset_type: Optional[str] = None):
    """Get latest AI trading signals from DB."""
    try:
        q = db.table("agent_signals").select("*").order("created_at", desc=True).limit(limit)
        if asset_type:
            q = q.eq("asset_type", asset_type)
        result = q.execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/agent/run")
async def run_agent():
    """Manually trigger agent signal generation (admin only)."""
    try:
        signals = await agent.generate_all_signals()
        return {"generated": len(signals), "signals": signals}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/agent/performance")
async def agent_performance():
    """Get agent's historical performance stats."""
    try:
        result = db.table("agent_trades").select("outcome, return_pct").neq("outcome", "pending").execute()
        trades = result.data or []
        wins   = [t for t in trades if t["outcome"] == "win"]
        losses = [t for t in trades if t["outcome"] == "loss"]
        total  = len(trades)
        win_rate   = len(wins) / total * 100 if total else 0
        avg_win    = sum(t["return_pct"] or 0 for t in wins)   / len(wins)   if wins   else 0
        avg_loss   = sum(abs(t["return_pct"] or 0) for t in losses) / len(losses) if losses else 0
        profit_fac = (avg_win * len(wins)) / (avg_loss * len(losses)) if losses and avg_loss else None
        return {
            "total": total, "wins": len(wins), "losses": len(losses),
            "win_rate": round(win_rate, 1),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "profit_factor": round(profit_fac, 2) if profit_fac else None,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Cron trigger ─────────────────────────────────────────────────────

@app.post("/cron/daily-update")
async def daily_update():
    """Called by Render cron daily at 6 AM ET."""
    try:
        await market.refresh_market_cache()
        signals = await agent.generate_all_signals()
        await agent.evaluate_closed_trades()
        await update_portfolio_values()
        await update_league_standings()
        return {"status": "ok", "signals_generated": len(signals)}
    except Exception as e:
        raise HTTPException(500, str(e))


async def update_portfolio_values():
    """Refresh current_price on all holdings."""
    try:
        result = db.table("holdings").select("symbol, asset_type").execute()
        holdings = result.data or []
        symbols_by_type = {}
        for h in holdings:
            symbols_by_type.setdefault(h["asset_type"], set()).add(h["symbol"])
        for asset_type, symbols in symbols_by_type.items():
            quotes = await market.get_bulk_quotes(list(symbols), asset_type)
            for symbol, quote in quotes.items():
                price = quote.get("c") or quote.get("price")
                if price:
                    db.table("holdings").update({"current_price": price}).eq("symbol", symbol).execute()
                    db.table("league_holdings").update({"current_price": price}).eq("symbol", symbol).execute()
    except Exception as e:
        print(f"update_portfolio_values error: {e}")


async def update_league_standings():
    """Recalculate league member portfolio values and rankings."""
    try:
        leagues = db.table("leagues").select("*").eq("status", "active").execute().data or []
        for league in leagues:
            members = db.table("league_members").select("*").eq("league_id", league["id"]).execute().data or []
            for member in members:
                holdings = db.table("league_holdings").select("*").eq("user_id", member["user_id"]).eq("league_id", league["id"]).execute().data or []
                invested_value = sum((h.get("current_price") or h.get("avg_cost", 0)) * h.get("quantity", 0) for h in holdings)
                total_value    = (member.get("current_cash") or 0) + invested_value
                starting       = league.get("starting_capital", 10000)
                return_pct     = ((total_value - starting) / starting) * 100
                db.table("league_members").update({
                    "current_value": round(total_value, 2),
                    "return_pct":    round(return_pct, 4)
                }).eq("id", member["id"]).execute()
    except Exception as e:
        print(f"update_league_standings error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=False)
