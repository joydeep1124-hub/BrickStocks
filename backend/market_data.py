"""
BrickStocks — market_data.py
Market data service. Uses Finnhub for stocks/forex, CoinGecko for crypto, yfinance fallback.
"""

import os, time, asyncio, json
from typing import Optional, List, Dict, Any
import httpx
import yfinance as yf
from pycoingecko import CoinGeckoAPI

# Finnhub symbol map for crypto
CRYPTO_FINNHUB = {"BTC": "BINANCE:BTCUSDT", "ETH": "BINANCE:ETHUSDT", "SOL": "BINANCE:SOLUSDT",
                  "BNB": "BINANCE:BNBUSDT", "XRP": "BINANCE:XRPUSDT", "DOGE": "BINANCE:DOGEUSDT",
                  "ADA": "BINANCE:ADAUSDT", "AVAX": "BINANCE:AVAXUSDT", "DOT": "BINANCE:DOTUSDT"}

COINGECKO_IDS = {"BTC":"bitcoin","ETH":"ethereum","SOL":"solana","BNB":"binancecoin",
                 "XRP":"ripple","DOGE":"dogecoin","ADA":"cardano","AVAX":"avalanche-2"}

# Forex pairs for Finnhub
FOREX_PAIRS = {"EUR/USD":"OANDA:EUR_USD","GBP/USD":"OANDA:GBP_USD","USD/JPY":"OANDA:USD_JPY",
               "USD/CAD":"OANDA:USD_CAD","AUD/USD":"OANDA:AUD_USD","USD/CHF":"OANDA:USD_CHF"}

# Commodity symbols (yfinance)
COMMODITY_YF = {"GOLD":"GC=F","SILVER":"SI=F","OIL":"CL=F","BRENT":"BZ=F",
                "NATGAS":"NG=F","COPPER":"HG=F","WHEAT":"ZW=F","CORN":"ZC=F"}

DEFAULT_SYMBOLS = {
    "stock":     ["AAPL","MSFT","NVDA","TSLA","AMZN","META","GOOGL","JPM","V","WMT","AMD","BA","DIS","NFLX","UBER"],
    "etf":       ["SPY","QQQ","IWM","GLD","VTI","ARKK","XLK","XLF"],
    "crypto":    list(COINGECKO_IDS.keys()),
    "forex":     list(FOREX_PAIRS.keys()),
    "commodity": list(COMMODITY_YF.keys()),
}


class MarketDataService:
    def __init__(self, finnhub_key: str, db):
        self.finnhub_key = finnhub_key
        self.db          = db
        self.cg          = CoinGeckoAPI()
        self._cache: Dict[str, Dict] = {}   # in-memory 60s cache
        self._cache_ts: Dict[str, float] = {}

    def _cached(self, key: str, ttl: int = 60) -> Optional[Dict]:
        if key in self._cache and time.time() - self._cache_ts.get(key, 0) < ttl:
            return self._cache[key]
        return None

    def _set_cache(self, key: str, val):
        self._cache[key] = val
        self._cache_ts[key] = time.time()

    # ─── Quote ───────────────────────────────────────────────────────

    async def get_quote(self, symbol: str, asset_type: str = "stock") -> Optional[Dict]:
        cached = self._cached(f"q:{symbol}")
        if cached:
            return cached

        try:
            if asset_type in ("stock", "etf"):
                return await self._quote_finnhub(symbol)
            elif asset_type == "crypto":
                return await self._quote_crypto(symbol)
            elif asset_type == "forex":
                return await self._quote_forex(symbol)
            elif asset_type == "commodity":
                return await self._quote_yfinance(COMMODITY_YF.get(symbol, symbol + "=F"))
        except Exception as e:
            print(f"get_quote {symbol} error: {e}")
            # Try DB cache as fallback
            result = self.db.table("market_cache").select("*").eq("symbol", symbol).maybe_single().execute()
            return result.data if result.data else None

    async def _quote_finnhub(self, symbol: str) -> Optional[Dict]:
        if not self.finnhub_key:
            return await self._quote_yfinance(symbol)
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"https://finnhub.io/api/v1/quote",
                params={"symbol": symbol, "token": self.finnhub_key}
            )
            if r.status_code != 200:
                return await self._quote_yfinance(symbol)
            data = r.json()
            if not data.get("c"):
                return await self._quote_yfinance(symbol)
            result = {
                "symbol": symbol, "c": data["c"], "h": data["h"], "l": data["l"],
                "o": data["o"], "pc": data["pc"],
                "d": data["d"], "dp": data["dp"],
                "price": data["c"],
                "change_pct_1d": data["dp"],
            }
            self._set_cache(f"q:{symbol}", result)
            return result

    async def _quote_yfinance(self, symbol: str) -> Optional[Dict]:
        try:
            t   = yf.Ticker(symbol)
            inf = t.fast_info
            price = float(getattr(inf, "last_price", 0) or 0)
            prev  = float(getattr(inf, "previous_close", price) or price)
            d     = price - prev
            dp    = (d / prev * 100) if prev else 0
            result = {
                "symbol": symbol, "c": price, "h": getattr(inf, "day_high", price),
                "l": getattr(inf, "day_low", price), "o": prev, "pc": prev,
                "d": d, "dp": dp, "price": price, "change_pct_1d": dp,
                "v": getattr(inf, "three_month_average_volume", 0),
                "mc": getattr(inf, "market_cap", None),
            }
            self._set_cache(f"q:{symbol}", result)
            return result
        except Exception as e:
            print(f"_quote_yfinance {symbol}: {e}")
            return None

    async def _quote_crypto(self, symbol: str) -> Optional[Dict]:
        cg_id = COINGECKO_IDS.get(symbol)
        if not cg_id:
            return None
        try:
            data = self.cg.get_price(
                ids=cg_id,
                vs_currencies="usd",
                include_24hr_change="true",
                include_market_cap="true",
                include_24hr_vol="true"
            )
            d = data.get(cg_id, {})
            price = d.get("usd", 0)
            change = d.get("usd_24h_change", 0)
            result = {
                "symbol": symbol, "c": price, "price": price,
                "d": price * change / 100 if price and change else 0,
                "dp": change, "change_pct_1d": change,
                "mc": d.get("usd_market_cap"),
                "v":  d.get("usd_24h_vol"),
            }
            self._set_cache(f"q:{symbol}", result)
            return result
        except Exception as e:
            print(f"_quote_crypto {symbol}: {e}")
            return None

    async def _quote_forex(self, symbol: str) -> Optional[Dict]:
        fh_sym = FOREX_PAIRS.get(symbol)
        if fh_sym and self.finnhub_key:
            return await self._quote_finnhub(fh_sym)
        # Fallback: frankfurter.app free API
        base, quote = symbol.split("/") if "/" in symbol else (symbol[:3], symbol[3:])
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(f"https://api.frankfurter.app/latest?from={base}&to={quote}")
                if r.status_code == 200:
                    data  = r.json()
                    price = data["rates"].get(quote, 0)
                    return {"symbol": symbol, "c": price, "price": price, "dp": 0, "change_pct_1d": 0}
        except Exception as e:
            print(f"_quote_forex {symbol}: {e}")
        return None

    # ─── Bulk quotes ─────────────────────────────────────────────────

    async def get_bulk_quotes(self, symbols: List[str], asset_type: str = "stock") -> Dict:
        tasks = {s: self.get_quote(s, asset_type) for s in symbols}
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        out = {}
        for sym, res in zip(tasks.keys(), results):
            if isinstance(res, Exception):
                print(f"bulk quote {sym}: {res}")
            elif res:
                out[sym] = res
        return out

    # ─── Candles ─────────────────────────────────────────────────────

    async def get_candles(self, symbol: str, resolution: str, from_ts: int, to_ts: int, asset_type: str = "stock") -> Optional[Dict]:
        try:
            if asset_type in ("stock", "etf"):
                return await self._candles_finnhub(symbol, resolution, from_ts, to_ts)
            elif asset_type == "crypto":
                fh_sym = CRYPTO_FINNHUB.get(symbol)
                if fh_sym:
                    return await self._candles_finnhub(fh_sym, resolution, from_ts, to_ts)
                return await self._candles_yfinance(symbol + "-USD", resolution, from_ts, to_ts)
            elif asset_type in ("forex", "commodity"):
                yf_sym = COMMODITY_YF.get(symbol, symbol + "=F")
                return await self._candles_yfinance(yf_sym, resolution, from_ts, to_ts)
        except Exception as e:
            print(f"get_candles {symbol}: {e}")
            return None

    async def _candles_finnhub(self, symbol: str, resolution: str, from_ts: int, to_ts: int) -> Optional[Dict]:
        if not self.finnhub_key:
            return await self._candles_yfinance(symbol, resolution, from_ts, to_ts)
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/stock/candle",
                params={"symbol": symbol, "resolution": resolution, "from": from_ts, "to": to_ts, "token": self.finnhub_key}
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("s") == "ok":
                    return data
        return await self._candles_yfinance(symbol, resolution, from_ts, to_ts)

    async def _candles_yfinance(self, symbol: str, resolution: str, from_ts: int, to_ts: int) -> Optional[Dict]:
        try:
            period_map = {"1": "1m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "D": "1d", "W": "1wk", "M": "1mo"}
            interval   = period_map.get(resolution, "1d")
            import pandas as pd
            start = pd.Timestamp(from_ts, unit="s")
            end   = pd.Timestamp(to_ts,   unit="s")
            t     = yf.Ticker(symbol)
            hist  = t.history(start=start, end=end, interval=interval)
            if hist.empty:
                return None
            return {
                "s": "ok",
                "t": [int(ts.timestamp()) for ts in hist.index],
                "o": hist["Open"].tolist(),
                "h": hist["High"].tolist(),
                "l": hist["Low"].tolist(),
                "c": hist["Close"].tolist(),
                "v": hist["Volume"].tolist(),
            }
        except Exception as e:
            print(f"_candles_yfinance {symbol}: {e}")
            return None

    # ─── Search ──────────────────────────────────────────────────────

    async def search(self, query: str, types: List[str]) -> List[Dict]:
        results = []
        q_lower = query.lower()

        # Search Finnhub symbol lookup
        if self.finnhub_key and ("stock" in types or "etf" in types):
            try:
                async with httpx.AsyncClient(timeout=8) as client:
                    r = await client.get(
                        "https://finnhub.io/api/v1/search",
                        params={"q": query, "token": self.finnhub_key}
                    )
                    if r.status_code == 200:
                        for item in r.json().get("result", [])[:8]:
                            t = "etf" if "ETF" in (item.get("type","")).upper() else "stock"
                            if t in types:
                                results.append({"symbol": item["symbol"], "description": item["description"], "type": t})
            except Exception as e:
                print(f"search finnhub: {e}")

        # Crypto search
        if "crypto" in types:
            for sym, cg_id in COINGECKO_IDS.items():
                if q_lower in sym.lower() or q_lower in cg_id.lower():
                    results.append({"symbol": sym, "description": cg_id.replace("-"," ").title(), "type": "crypto"})

        # Forex search
        if "forex" in types:
            for pair in FOREX_PAIRS.keys():
                if q_lower in pair.lower():
                    results.append({"symbol": pair, "description": f"Forex pair {pair}", "type": "forex"})

        # Commodity search
        if "commodity" in types:
            names = {"GOLD":"Gold Spot","SILVER":"Silver Spot","OIL":"Crude Oil WTI","BRENT":"Brent Crude",
                     "NATGAS":"Natural Gas","COPPER":"Copper","WHEAT":"Wheat","CORN":"Corn"}
            for sym, name in names.items():
                if q_lower in sym.lower() or q_lower in name.lower():
                    results.append({"symbol": sym, "description": name, "type": "commodity"})

        # If Finnhub unavailable, search DB cache
        if not results:
            try:
                db_res = self.db.table("market_cache").select("symbol,name,asset_type").ilike("symbol", f"%{query}%").limit(10).execute()
                for row in (db_res.data or []):
                    if row.get("asset_type") in types:
                        results.append({"symbol": row["symbol"], "description": row.get("name",""), "type": row["asset_type"]})
            except Exception:
                pass

        return results[:12]

    # ─── News ────────────────────────────────────────────────────────

    async def get_news(self, symbol: Optional[str] = None, limit: int = 20) -> List[Dict]:
        # Check DB cache first
        try:
            q = self.db.table("news_cache").select("*").order("published_at", desc=True).limit(limit)
            if symbol:
                q = q.contains("symbols", [symbol])
            result = q.execute()
            if result.data:
                return result.data
        except Exception:
            pass

        # Fetch from Finnhub
        if not self.finnhub_key:
            return []
        import datetime
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                if symbol:
                    r = await client.get(
                        "https://finnhub.io/api/v1/company-news",
                        params={"symbol": symbol, "from": (datetime.date.today() - datetime.timedelta(days=7)).isoformat(),
                                "to": datetime.date.today().isoformat(), "token": self.finnhub_key}
                    )
                else:
                    r = await client.get(
                        "https://finnhub.io/api/v1/news",
                        params={"category": "general", "token": self.finnhub_key}
                    )
                if r.status_code == 200:
                    news = r.json()[:limit]
                    # Cache in DB
                    for n in news:
                        try:
                            self.db.table("news_cache").upsert({
                                "headline":     n.get("headline"),
                                "summary":      n.get("summary"),
                                "source":       n.get("source"),
                                "url":          n.get("url"),
                                "image":        n.get("image"),
                                "symbols":      [symbol] if symbol else [],
                                "published_at": datetime.datetime.fromtimestamp(n.get("datetime",0)).isoformat() if n.get("datetime") else None,
                            }).execute()
                        except Exception:
                            pass
                    return news
        except Exception as e:
            print(f"get_news: {e}")
        return []

    # ─── Cache warm-up ────────────────────────────────────────────────

    async def warm_cache(self):
        """Pre-load common symbols into market_cache on startup."""
        await asyncio.sleep(5)   # Wait for DB connection to settle
        await self.refresh_market_cache()

    async def refresh_market_cache(self):
        """Refresh the market_cache table with latest prices."""
        print("Refreshing market cache…")
        for asset_type, symbols in DEFAULT_SYMBOLS.items():
            try:
                quotes = await self.get_bulk_quotes(symbols, asset_type)
                for symbol, q in quotes.items():
                    price = q.get("c") or q.get("price") or 0
                    if not price:
                        continue
                    self.db.table("market_cache").upsert({
                        "symbol":        symbol,
                        "asset_type":    asset_type,
                        "price":         price,
                        "change_1d":     q.get("d", 0),
                        "change_pct_1d": q.get("dp") or q.get("change_pct_1d", 0),
                        "volume":        q.get("v"),
                        "market_cap":    q.get("mc"),
                        "updated_at":    "now()",
                    }).execute()
                await asyncio.sleep(1)   # Rate limit
            except Exception as e:
                print(f"refresh_market_cache {asset_type}: {e}")
        print("Market cache refresh complete.")
