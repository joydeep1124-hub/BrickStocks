/* ═══════════════════════════════════════════════════════
   BrickStocks — market.js
   Market data utilities. Uses Finnhub (free tier) +
   CoinGecko for crypto. All calls cached via Supabase.
   ═══════════════════════════════════════════════════════ */

window.BSMarket = (function () {

  const API = () => window.BS_API || 'https://brickstocks-api.onrender.com';

  /* ─── Formatters ─────────────────────────────────────── */
  function fmtPrice(n, digits = 2) {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (Math.abs(n) >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function fmtChange(pct) {
    if (pct == null || isNaN(pct)) return '0.00%';
    const sign = pct >= 0 ? '+' : '';
    return sign + pct.toFixed(2) + '%';
  }

  function fmtVol(n) {
    if (!n) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  function fmtMktCap(n) {
    if (!n) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6)  return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + n.toLocaleString();
  }

  function chgClass(pct) {
    if (!pct) return 'chg-flat';
    return pct > 0 ? 'chg-up' : 'chg-dn';
  }

  function chgBadgeClass(pct) {
    if (!pct) return 'chg-badge-up';
    return pct > 0 ? 'chg-badge-up' : 'chg-badge-dn';
  }

  /* ─── API calls to backend ───────────────────────────── */
  async function getQuote(symbol, assetType = 'stock') {
    try {
      const r = await fetch(`${API()}/market/quote?symbol=${encodeURIComponent(symbol)}&type=${assetType}`);
      if (!r.ok) throw new Error(r.statusText);
      return await r.json();
    } catch (e) {
      console.error('getQuote error:', e);
      return null;
    }
  }

  async function getBulkQuotes(symbols, assetType = 'stock') {
    try {
      const r = await fetch(`${API()}/market/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, type: assetType })
      });
      if (!r.ok) throw new Error(r.statusText);
      return await r.json();
    } catch (e) {
      console.error('getBulkQuotes error:', e);
      return {};
    }
  }

  async function getCandles(symbol, resolution = 'D', from = null, to = null, assetType = 'stock') {
    const now = Math.floor(Date.now() / 1000);
    const fromTs = from || now - 90 * 86400;
    const toTs   = to   || now;
    try {
      const r = await fetch(
        `${API()}/market/candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${fromTs}&to=${toTs}&type=${assetType}`
      );
      if (!r.ok) throw new Error(r.statusText);
      return await r.json();
    } catch (e) {
      console.error('getCandles error:', e);
      return null;
    }
  }

  async function searchSymbols(query, types = ['stock', 'etf', 'crypto']) {
    try {
      const r = await fetch(`${API()}/market/search?q=${encodeURIComponent(query)}&types=${types.join(',')}`);
      if (!r.ok) throw new Error(r.statusText);
      return await r.json();
    } catch (e) {
      console.error('searchSymbols error:', e);
      return [];
    }
  }

  async function getNews(symbol = null, limit = 20) {
    const sym = symbol ? `&symbol=${encodeURIComponent(symbol)}` : '';
    try {
      const r = await fetch(`${API()}/market/news?limit=${limit}${sym}`);
      if (!r.ok) throw new Error(r.statusText);
      return await r.json();
    } catch (e) {
      console.error('getNews error:', e);
      return [];
    }
  }

  async function getAgentSignals(limit = 20, assetType = null) {
    const db  = window._db;
    let q = db.from('agent_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (assetType) q = q.eq('asset_type', assetType);
    const { data } = await q;
    return data || [];
  }

  async function getMarketCache(symbols) {
    const db = window._db;
    const { data } = await db.from('market_cache')
      .select('*')
      .in('symbol', symbols);
    return data || [];
  }

  /* ─── Cached market overview from DB ─────────────────── */
  async function getMarketOverview() {
    const db = window._db;
    const { data } = await db.from('market_cache')
      .select('*')
      .order('market_cap', { ascending: false })
      .limit(60);
    return data || [];
  }

  async function getTrending() {
    const db = window._db;
    const { data } = await db.from('market_cache')
      .select('*')
      .order('change_pct_1d', { ascending: false })
      .limit(10);
    return data || [];
  }

  /* ─── Portfolio helpers ──────────────────────────────── */
  async function getPortfolio(userId) {
    const db = window._db;
    const [{ data: holdings }, { data: profile }] = await Promise.all([
      db.from('holdings').select('*').eq('user_id', userId),
      db.from('profiles').select('portfolio_cash, chips').eq('id', userId).single()
    ]);
    return { holdings: holdings || [], cash: profile?.portfolio_cash || 0, chips: profile?.chips || 0 };
  }

  async function getLeaguePortfolio(userId, leagueId) {
    const db = window._db;
    const [{ data: holdings }, { data: member }] = await Promise.all([
      db.from('league_holdings').select('*').eq('user_id', userId).eq('league_id', leagueId),
      db.from('league_members').select('*').eq('user_id', userId).eq('league_id', leagueId).single()
    ]);
    return { holdings: holdings || [], cash: member?.current_cash || 0, member };
  }

  /* ─── Trade execution ────────────────────────────────── */
  async function executeTrade({ userId, symbol, assetType, action, quantity, price, leagueId = null }) {
    const db = window._db;
    const totalValue = quantity * price;

    if (leagueId) {
      return await executeLeagueTrade({ db, userId, symbol, assetType, action, quantity, price, totalValue, leagueId });
    }

    const { data: profile } = await db.from('profiles').select('portfolio_cash').eq('id', userId).single();
    if (!profile) return { ok: false, error: 'Profile not found' };

    if (action === 'buy') {
      if (profile.portfolio_cash < totalValue) return { ok: false, error: 'Insufficient funds' };
      await db.from('profiles').update({ portfolio_cash: profile.portfolio_cash - totalValue }).eq('id', userId);
      const { data: existing } = await db.from('holdings')
        .select('*').eq('user_id', userId).eq('symbol', symbol).maybeSingle();
      if (existing) {
        const newQty  = existing.quantity + quantity;
        const newCost = (existing.avg_cost * existing.quantity + price * quantity) / newQty;
        await db.from('holdings').update({ quantity: newQty, avg_cost: newCost, current_price: price })
          .eq('id', existing.id);
      } else {
        await db.from('holdings').insert({ user_id: userId, symbol, asset_type: assetType, quantity, avg_cost: price, current_price: price });
      }
    } else {
      const { data: existing } = await db.from('holdings')
        .select('*').eq('user_id', userId).eq('symbol', symbol).maybeSingle();
      if (!existing || existing.quantity < quantity) return { ok: false, error: 'Not enough shares to sell' };
      await db.from('profiles').update({ portfolio_cash: profile.portfolio_cash + totalValue }).eq('id', userId);
      const newQty = existing.quantity - quantity;
      if (newQty < 0.000001) {
        await db.from('holdings').delete().eq('id', existing.id);
      } else {
        await db.from('holdings').update({ quantity: newQty, current_price: price }).eq('id', existing.id);
      }
    }

    await db.from('trades').insert({
      user_id: userId, symbol, asset_type: assetType,
      action, quantity, price, total_value: totalValue
    });

    await db.rpc('update_trade_stats', { p_user_id: userId, p_action: action, p_pnl: action === 'sell' ? 0 : null });

    return { ok: true };
  }

  async function executeLeagueTrade({ db, userId, symbol, assetType, action, quantity, price, totalValue, leagueId }) {
    const { data: member } = await db.from('league_members')
      .select('*').eq('user_id', userId).eq('league_id', leagueId).single();
    if (!member) return { ok: false, error: 'Not in league' };

    if (action === 'buy') {
      if (member.current_cash < totalValue) return { ok: false, error: 'Insufficient league funds' };
      await db.from('league_members').update({ current_cash: member.current_cash - totalValue }).eq('id', member.id);
      const { data: existing } = await db.from('league_holdings')
        .select('*').eq('user_id', userId).eq('league_id', leagueId).eq('symbol', symbol).maybeSingle();
      if (existing) {
        const newQty  = existing.quantity + quantity;
        const newCost = (existing.avg_cost * existing.quantity + price * quantity) / newQty;
        await db.from('league_holdings').update({ quantity: newQty, avg_cost: newCost, current_price: price }).eq('id', existing.id);
      } else {
        await db.from('league_holdings').insert({ league_id: leagueId, user_id: userId, symbol, asset_type: assetType, quantity, avg_cost: price, current_price: price });
      }
    } else {
      const { data: existing } = await db.from('league_holdings')
        .select('*').eq('user_id', userId).eq('league_id', leagueId).eq('symbol', symbol).maybeSingle();
      if (!existing || existing.quantity < quantity) return { ok: false, error: 'Not enough shares' };
      await db.from('league_members').update({ current_cash: member.current_cash + totalValue }).eq('id', member.id);
      const newQty = existing.quantity - quantity;
      if (newQty < 0.000001) {
        await db.from('league_holdings').delete().eq('id', existing.id);
      } else {
        await db.from('league_holdings').update({ quantity: newQty, current_price: price }).eq('id', existing.id);
      }
    }

    await db.from('league_trades').insert({
      league_id: leagueId, user_id: userId, symbol, asset_type: assetType,
      action, quantity, price, total_value: totalValue
    });

    return { ok: true };
  }

  /* ─── Chart data builder ─────────────────────────────── */
  function buildChartData(candles) {
    if (!candles || !candles.t) return [];
    return candles.t.map((ts, i) => ({
      time:  ts,
      open:  candles.o[i],
      high:  candles.h[i],
      low:   candles.l[i],
      close: candles.c[i],
      volume: candles.v?.[i] || 0
    })).filter(d => d.open && d.close);
  }

  /* ─── Asset type label ───────────────────────────────── */
  function assetLabel(type) {
    const map = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto', forex: 'Forex', commodity: 'Commodity' };
    return map[type] || type;
  }

  function assetIcon(type) {
    const map = { stock: '📈', etf: '🧺', crypto: '🪙', forex: '💱', commodity: '🛢️' };
    return map[type] || '📊';
  }

  /* ─── Public API ─────────────────────────────────────── */
  return {
    fmtPrice, fmtChange, fmtVol, fmtMktCap,
    chgClass, chgBadgeClass,
    getQuote, getBulkQuotes, getCandles, searchSymbols,
    getNews, getAgentSignals, getMarketCache,
    getMarketOverview, getTrending,
    getPortfolio, getLeaguePortfolio,
    executeTrade,
    buildChartData,
    assetLabel, assetIcon,
  };
})();
