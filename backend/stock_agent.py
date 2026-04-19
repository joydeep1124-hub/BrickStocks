"""
BrickStocks — stock_agent.py
AI Trading Agent. Generates buy/sell/hold/watch signals using:
  - Technical analysis (RSI, MACD, BB, EMA crossovers)
  - News sentiment scoring
  - Fundamental scoring (PE, revenue growth, margins)
  - Macro context
  - Self-learning: adjusts weights based on closed trade outcomes
"""

import os, time, asyncio
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

try:
    import ta
    TA_AVAILABLE = True
except ImportError:
    TA_AVAILABLE = False

from market_data import MarketDataService

# ── Default weights ──────────────────────────────────────────────────
DEFAULT_WEIGHTS = {
    "technical":   0.40,
    "sentiment":   0.30,
    "fundamental": 0.30,
}

# ── Target universes ──────────────────────────────────────────────────
UNIVERSE = {
    "stock":     ["AAPL","MSFT","NVDA","TSLA","AMZN","META","GOOGL","JPM","V","AMD","NFLX","DIS","BA","UBER","COIN"],
    "crypto":    ["BTC","ETH","SOL","BNB","ADA","AVAX","DOGE","XRP"],
    "forex":     ["EUR/USD","GBP/USD","USD/JPY","AUD/USD"],
    "commodity": ["GOLD","SILVER","OIL","NATGAS","COPPER"],
}


class TechnicalAnalyzer:
    """Compute technical indicators and generate a 0-100 technical score."""

    def score(self, closes: List[float], highs: List[float] = None, lows: List[float] = None, volumes: List[float] = None) -> Dict:
        if len(closes) < 20:
            return {"score": 50, "signals": [], "reasoning": "Insufficient data"}

        c  = pd.Series(closes)
        signals = []
        score   = 50

        # ── RSI ─────────────────────────────────────────────
        delta = c.diff()
        gain  = delta.clip(lower=0)
        loss  = (-delta).clip(lower=0)
        avg_g = gain.rolling(14).mean()
        avg_l = loss.rolling(14).mean()
        rs    = avg_g / avg_l.replace(0, np.nan)
        rsi   = 100 - (100 / (1 + rs))
        last_rsi = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50

        if last_rsi < 30:
            score += 20
            signals.append(f"RSI oversold ({last_rsi:.0f}) — bullish reversal likely")
        elif last_rsi > 70:
            score -= 15
            signals.append(f"RSI overbought ({last_rsi:.0f}) — potential pullback")
        elif 40 < last_rsi < 60:
            signals.append(f"RSI neutral ({last_rsi:.0f})")

        # ── MACD ────────────────────────────────────────────
        ema12 = c.ewm(span=12, adjust=False).mean()
        ema26 = c.ewm(span=26, adjust=False).mean()
        macd  = ema12 - ema26
        signal_line = macd.ewm(span=9, adjust=False).mean()
        histogram   = macd - signal_line

        if histogram.iloc[-1] > 0 and histogram.iloc[-2] <= 0:
            score += 18
            signals.append("MACD bullish crossover just fired")
        elif histogram.iloc[-1] < 0 and histogram.iloc[-2] >= 0:
            score -= 15
            signals.append("MACD bearish crossover — momentum turning negative")
        elif histogram.iloc[-1] > histogram.iloc[-2]:
            score += 8
            signals.append("MACD histogram expanding bullishly")

        # ── EMA trend ───────────────────────────────────────
        ema20  = c.ewm(span=20, adjust=False).mean()
        ema50  = c.ewm(span=50, adjust=False).mean()
        ema200 = c.ewm(span=200, adjust=False).mean()

        if len(closes) >= 50:
            if ema20.iloc[-1] > ema50.iloc[-1]:
                score += 10
                signals.append("EMA20 above EMA50 — short-term uptrend intact")
            else:
                score -= 8
                signals.append("EMA20 below EMA50 — short-term trend bearish")

        if len(closes) >= 200:
            price_vs_200 = (c.iloc[-1] / ema200.iloc[-1] - 1) * 100
            if c.iloc[-1] > ema200.iloc[-1]:
                score += 12
                signals.append(f"Price above 200 EMA (+{price_vs_200:.1f}%) — long-term bull trend")
            else:
                score -= 10
                signals.append(f"Price below 200 EMA ({price_vs_200:.1f}%) — long-term bearish")

        # ── Bollinger Bands ──────────────────────────────────
        if len(closes) >= 20:
            sma20  = c.rolling(20).mean()
            std20  = c.rolling(20).std()
            bb_up  = sma20 + 2 * std20
            bb_low = sma20 - 2 * std20
            last_price = c.iloc[-1]
            bb_pct = (last_price - bb_low.iloc[-1]) / (bb_up.iloc[-1] - bb_low.iloc[-1]) * 100 if (bb_up.iloc[-1] - bb_low.iloc[-1]) != 0 else 50

            if bb_pct < 20:
                score += 12
                signals.append(f"Near lower Bollinger Band (BB%={bb_pct:.0f}) — oversold")
            elif bb_pct > 80:
                score -= 10
                signals.append(f"Near upper Bollinger Band (BB%={bb_pct:.0f}) — extended")

        # ── Volume ──────────────────────────────────────────
        if volumes and len(volumes) >= 20:
            v = pd.Series(volumes)
            avg_vol = v.rolling(20).mean().iloc[-1]
            last_vol = v.iloc[-1]
            if last_vol > avg_vol * 1.5 and c.iloc[-1] > c.iloc[-2]:
                score += 8
                signals.append(f"Above-average volume ({last_vol/avg_vol:.1f}x) on up day — institutional interest")

        score = max(0, min(100, score))
        reasoning = ". ".join(signals[:4]) if signals else "Technical analysis neutral."

        return {"score": score, "signals": signals, "reasoning": reasoning, "rsi": last_rsi}


class SentimentScorer:
    """Score sentiment from news headlines using keyword matching."""

    POSITIVE = ["beats", "surges", "record", "upgrade", "bullish", "growth", "profit", "strong", "buy", "outperform",
                "raised", "accelerating", "breakthrough", "partnership", "launch", "gains", "rally", "upside"]
    NEGATIVE = ["misses", "warns", "cuts", "downgrades", "bearish", "loss", "decline", "weak", "sell", "underperform",
                "lowered", "slowing", "recall", "investigation", "fine", "drops", "falls", "shutdown", "risks"]

    def score(self, headlines: List[str]) -> Dict:
        if not headlines:
            return {"score": 50, "reasoning": "No recent news found."}

        total = 0
        for h in headlines[:10]:
            h_lower = h.lower()
            pos = sum(1 for w in self.POSITIVE if w in h_lower)
            neg = sum(1 for w in self.NEGATIVE if w in h_lower)
            total += (pos - neg)

        # Normalize to 0-100
        normalized = 50 + min(total * 5, 40)
        normalized = max(10, min(90, normalized))

        if total > 3:
            reasoning = f"News sentiment strongly positive ({len(headlines)} recent articles, {total} bullish signals)."
        elif total > 0:
            reasoning = f"News sentiment mildly positive. {len(headlines)} recent articles analyzed."
        elif total < -3:
            reasoning = f"News sentiment strongly negative. {abs(total)} bearish signals across recent coverage."
        elif total < 0:
            reasoning = f"News sentiment slightly negative. Monitor for continuation."
        else:
            reasoning = f"News sentiment neutral. {len(headlines)} articles analyzed."

        return {"score": float(normalized), "reasoning": reasoning}


class FundamentalScorer:
    """Score fundamental quality of stocks (0-100)."""

    def score(self, info: Dict) -> Dict:
        if not info:
            return {"score": 50, "reasoning": "Fundamental data unavailable."}

        score    = 50
        signals  = []

        pe = info.get("pe") or info.get("trailingPE")
        if pe:
            if 10 < pe < 25:
                score += 15
                signals.append(f"Attractive P/E of {pe:.1f}x — reasonable valuation")
            elif pe < 10:
                score += 8
                signals.append(f"Very low P/E ({pe:.1f}x) — potentially undervalued or value trap")
            elif pe > 50:
                score -= 10
                signals.append(f"High P/E ({pe:.1f}x) — priced for perfection")

        # Revenue growth
        rev_growth = info.get("revenueGrowth") or info.get("revenue_growth")
        if rev_growth:
            if rev_growth > 0.20:
                score += 15
                signals.append(f"Strong revenue growth ({rev_growth*100:.0f}% YoY)")
            elif rev_growth > 0.10:
                score += 8
                signals.append(f"Solid revenue growth ({rev_growth*100:.0f}% YoY)")
            elif rev_growth < 0:
                score -= 10
                signals.append(f"Revenue declining ({rev_growth*100:.0f}% YoY)")

        # Gross margin
        gross_margin = info.get("grossMargins") or info.get("gross_margin")
        if gross_margin:
            if gross_margin > 0.50:
                score += 10
                signals.append(f"High gross margins ({gross_margin*100:.0f}%) — strong pricing power")
            elif gross_margin > 0.30:
                score += 5

        # Return on equity
        roe = info.get("returnOnEquity")
        if roe and roe > 0.20:
            score += 8
            signals.append(f"Strong ROE ({roe*100:.0f}%) — efficient capital allocation")

        score = max(0, min(100, score))
        reasoning = ". ".join(signals[:3]) if signals else "Fundamental analysis neutral."

        return {"score": float(score), "reasoning": reasoning}


class TradingAgent:
    """
    The BrickStocks AI Trading Agent.
    Generates signals and learns from past performance.
    """

    def __init__(self, market: MarketDataService, db):
        self.market     = market
        self.db         = db
        self.tech       = TechnicalAnalyzer()
        self.sent       = SentimentScorer()
        self.fund       = FundamentalScorer()
        self.weights    = DEFAULT_WEIGHTS.copy()
        self._load_weights()

    def _load_weights(self):
        """Load learned weights from DB."""
        try:
            result = self.db.table("agent_config").select("weights").single().execute()
            if result.data and result.data.get("weights"):
                stored = result.data["weights"]
                for k in self.weights:
                    if k in stored:
                        self.weights[k] = float(stored[k])
        except Exception:
            pass

    def _save_weights(self):
        """Persist current weights to DB."""
        try:
            self.db.table("agent_config").upsert({"id": 1, "weights": self.weights}).execute()
        except Exception:
            pass

    async def generate_signal(self, symbol: str, asset_type: str) -> Optional[Dict]:
        """Generate a trading signal for a single symbol."""
        try:
            # 1. Get historical data for technicals
            now    = int(time.time())
            from_ts = now - 365 * 86400
            candles = await self.market.get_candles(symbol, "D", from_ts, now, asset_type)
            closes  = candles.get("c", []) if candles else []
            highs   = candles.get("h", []) if candles else []
            lows    = candles.get("l", []) if candles else []
            volumes = candles.get("v", []) if candles else []

            # 2. Technical score
            tech_result  = self.tech.score(closes, highs, lows, volumes)
            tech_score   = tech_result["score"]
            tech_reason  = tech_result["reasoning"]

            # 3. News sentiment
            news = await self.market.get_news(symbol if asset_type == "stock" else None, 10)
            headlines    = [n.get("headline","") for n in news]
            sent_result  = self.sent.score(headlines)
            sent_score   = sent_result["score"]
            sent_reason  = sent_result["reasoning"]

            # 4. Fundamental score (stocks only)
            fund_score  = 50
            fund_reason = ""
            if asset_type in ("stock", "etf") and closes:
                try:
                    import yfinance as yf
                    t    = yf.Ticker(symbol)
                    info = t.info or {}
                    fund_result = self.fund.score(info)
                    fund_score  = fund_result["score"]
                    fund_reason = fund_result["reasoning"]
                except Exception:
                    pass

            # 5. Weighted composite score
            composite = (
                tech_score  * self.weights["technical"]   +
                sent_score  * self.weights["sentiment"]   +
                fund_score  * self.weights["fundamental"]
            )

            # 6. Determine signal type
            if composite >= 72:
                signal_type = "buy"
            elif composite >= 62:
                signal_type = "watch"
            elif composite <= 35:
                signal_type = "sell"
            elif composite <= 45:
                signal_type = "hold"
            else:
                signal_type = "hold"

            # Skip very weak signals
            if 45 < composite < 62 and signal_type == "hold":
                return None

            # 7. Current price for targets
            quote = await self.market.get_quote(symbol, asset_type)
            current_price = quote.get("c") or quote.get("price") if quote else None

            target_price = None
            stop_loss    = None
            if current_price:
                if signal_type == "buy":
                    target_price = current_price * 1.12
                    stop_loss    = current_price * 0.93
                elif signal_type == "sell":
                    target_price = current_price * 0.90
                    stop_loss    = current_price * 1.04

            # 8. Build reasoning narrative
            parts = [p for p in [tech_reason, sent_reason, fund_reason] if p]
            reasoning = " ".join(parts)

            signal = {
                "symbol":           symbol,
                "asset_type":       asset_type,
                "signal_type":      signal_type,
                "confidence":       round(composite, 1),
                "technical_score":  round(tech_score, 1),
                "sentiment_score":  round(sent_score, 1),
                "fundamental_score":round(fund_score, 1),
                "reasoning":        reasoning[:800],
                "current_price":    current_price,
                "target_price":     round(target_price, 4) if target_price else None,
                "stop_loss":        round(stop_loss, 4) if stop_loss else None,
                "expires_at":       (datetime.now() + timedelta(days=3)).isoformat(),
            }

            # 9. Save to DB
            self.db.table("agent_signals").insert(signal).execute()
            return signal

        except Exception as e:
            print(f"generate_signal {symbol}: {e}")
            return None

    async def generate_all_signals(self) -> List[Dict]:
        """Generate signals for the full trading universe."""
        signals = []
        for asset_type, symbols in UNIVERSE.items():
            for symbol in symbols:
                sig = await self.generate_signal(symbol, asset_type)
                if sig:
                    signals.append(sig)
                await asyncio.sleep(0.5)   # Rate limit
        return signals

    async def evaluate_closed_trades(self):
        """
        Check open agent_trades for closed signals, calculate returns,
        and update the self-learning weights.
        """
        try:
            result = self.db.table("agent_trades").select("*, agent_signals(*)").eq("outcome","pending").execute()
            pending = result.data or []
        except Exception:
            return

        wins = 0; losses = 0; total_return = 0
        for trade in pending:
            sig = trade.get("agent_signals") or {}
            symbol     = sig.get("symbol")
            asset_type = sig.get("asset_type","stock")
            entry_price = trade.get("entry_price")
            if not entry_price or not symbol:
                continue

            quote = await self.market.get_quote(symbol, asset_type)
            current = quote.get("c") or quote.get("price") if quote else None
            if not current:
                continue

            target  = sig.get("target_price")
            stop    = sig.get("stop_loss")
            ret_pct = ((current - entry_price) / entry_price) * 100
            if sig.get("signal_type") == "sell":
                ret_pct = -ret_pct

            outcome = "pending"
            if target and current >= target:
                outcome = "win"
                wins += 1
            elif stop and current <= stop:
                outcome = "loss"
                losses += 1

            if outcome != "pending":
                total_return += ret_pct
                self.db.table("agent_trades").update({
                    "outcome": outcome,
                    "exit_price": current,
                    "exit_date": datetime.now().isoformat(),
                    "return_pct": round(ret_pct, 2),
                }).eq("id", trade["id"]).execute()

        # ── Self-learning weight adjustment ────────────────
        if wins + losses >= 5:
            win_rate = wins / (wins + losses)
            # If winning rate < 50%, decrease weight of poorest-performing dimension
            if win_rate < 0.50:
                # Slightly boost fundamental (value factor)
                self.weights["fundamental"] = min(0.50, self.weights["fundamental"] + 0.02)
                self.weights["technical"]   = max(0.25, self.weights["technical"]   - 0.01)
                self.weights["sentiment"]   = max(0.20, self.weights["sentiment"]   - 0.01)
            elif win_rate > 0.70:
                # Technical is working — reinforce
                self.weights["technical"]   = min(0.55, self.weights["technical"]   + 0.02)
                self.weights["fundamental"] = max(0.20, self.weights["fundamental"] - 0.01)
                self.weights["sentiment"]   = max(0.20, self.weights["sentiment"]   - 0.01)

            # Normalize weights to sum to 1.0
            total = sum(self.weights.values())
            self.weights = {k: round(v / total, 4) for k, v in self.weights.items()}
            self._save_weights()
            print(f"Agent weights updated: {self.weights} (win_rate={win_rate:.1%})")
