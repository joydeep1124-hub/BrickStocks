"""
BrickStocks — cron_update.py
Daily job: refresh market data, generate AI signals, snapshot portfolios,
update league standings, finalize ended leagues.
Run via Render Cron Job at 6 AM ET (11:00 UTC).
"""

import os, asyncio
from dotenv import load_dotenv
from supabase import create_client
from market_data import MarketDataService
from stock_agent import TradingAgent

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
FINNHUB_KEY  = os.getenv("FINNHUB_API_KEY", "")


async def main():
    print("=== BrickStocks daily cron starting ===")

    db     = create_client(SUPABASE_URL, SUPABASE_KEY)
    market = MarketDataService(finnhub_key=FINNHUB_KEY, db=db)
    agent  = TradingAgent(market=market, db=db)

    # 1. Refresh market cache
    print("Step 1: Refreshing market cache…")
    await market.refresh_market_cache()

    # 2. Generate AI signals
    print("Step 2: Generating AI signals…")
    signals = await agent.generate_all_signals()
    print(f"  Generated {len(signals)} signals")

    # 3. Evaluate closed agent trades (self-learning)
    print("Step 3: Evaluating closed trades (self-learning)…")
    await agent.evaluate_closed_trades()

    # 4. Update portfolio holdings prices + snapshot
    print("Step 4: Updating portfolio values…")
    await update_all_portfolios(db, market)

    # 5. Update league standings
    print("Step 5: Updating league standings…")
    await update_league_standings(db, market)

    # 6. Finalize ended leagues
    print("Step 6: Finalizing ended leagues…")
    await finalize_ended_leagues(db)

    # 7. Roll new league if none active
    print("Step 7: Checking if new league needed…")
    await maybe_create_league(db)

    print("=== Daily cron complete ===")


async def update_all_portfolios(db, market: MarketDataService):
    """Update current_price on all holdings and snapshot portfolio values."""
    from datetime import date, timedelta

    # Get all unique symbols
    holdings_res = db.table("holdings").select("symbol, asset_type").execute()
    holdings     = holdings_res.data or []
    by_type: dict = {}
    for h in holdings:
        by_type.setdefault(h["asset_type"], set()).add(h["symbol"])

    price_map = {}
    for asset_type, symbols in by_type.items():
        quotes = await market.get_bulk_quotes(list(symbols), asset_type)
        for sym, q in quotes.items():
            price = q.get("c") or q.get("price")
            if price:
                price_map[sym] = price
        await asyncio.sleep(0.5)

    # Update holdings
    for sym, price in price_map.items():
        db.table("holdings").update({"current_price": price}).eq("symbol", sym).execute()
        db.table("league_holdings").update({"current_price": price}).eq("symbol", sym).execute()

    # Snapshot all active users' portfolios
    profiles_res = db.table("profiles").select("id").execute()
    for p in (profiles_res.data or []):
        try:
            db.rpc("snapshot_portfolio", {"p_user_id": p["id"]}).execute()
        except Exception as e:
            print(f"  snapshot_portfolio {p['id']}: {e}")


async def update_league_standings(db, market: MarketDataService):
    """Recalculate return_pct and current_value for all active league members."""
    leagues = db.table("leagues").select("*").eq("status","active").execute().data or []
    for league in leagues:
        members = db.table("league_members").select("*").eq("league_id", league["id"]).execute().data or []
        for m in members:
            holdings = db.table("league_holdings").select("*")\
                .eq("user_id", m["user_id"]).eq("league_id", league["id"]).execute().data or []
            invested = sum((h.get("current_price") or h.get("avg_cost",0)) * (h.get("quantity",0)) for h in holdings)
            total    = (m.get("current_cash") or 0) + invested
            starting = league.get("starting_capital", 10000)
            ret_pct  = ((total - starting) / starting) * 100 if starting else 0
            db.table("league_members").update({
                "current_value": round(total, 2),
                "return_pct":    round(ret_pct, 4)
            }).eq("id", m["id"]).execute()


async def finalize_ended_leagues(db):
    """Mark leagues past their end_date as completed and award prizes."""
    from datetime import date
    ended = db.table("leagues").select("id").eq("status","active")\
        .lte("end_date", date.today().isoformat()).execute().data or []
    for row in ended:
        try:
            db.rpc("finalize_league", {"p_league_id": row["id"]}).execute()
            print(f"  Finalized league {row['id']}")
        except Exception as e:
            print(f"  finalize_league error: {e}")


async def maybe_create_league(db):
    """Create a new league if no active or upcoming league exists."""
    from datetime import date, timedelta
    active = db.table("leagues").select("id").in_("status",["active","upcoming"]).execute().data or []
    if active:
        return
    start = date.today()
    end   = start + timedelta(days=14)
    name  = f"BrickStocks League — {start.strftime('%b %Y')}"
    db.table("leagues").insert({
        "name":             name,
        "description":      "2-week trading competition. Best % return wins.",
        "start_date":       start.isoformat(),
        "end_date":         end.isoformat(),
        "starting_capital": 10000,
        "status":           "active",
        "prize_chips":      500,
        "prize_2nd":        250,
        "prize_3rd":        100,
    }).execute()
    print(f"  Created new league: {name}")


if __name__ == "__main__":
    asyncio.run(main())
