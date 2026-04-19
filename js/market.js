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
    // Try backend first
    try {
      const r = await fetch(`${API()}/market/quote?symbol=${encodeURIComponent(symbol)}&type=${assetType}`,
        { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(r.statusText);
      const d = await r.json();
      if (d?.price || d?.c) return d;
    } catch (e) {
      console.warn('getQuote backend failed, trying Yahoo Finance...');
    }

    // Try Yahoo Finance
    try {
      const ySymbol = assetType === 'forex' ? symbol.replace('/', '') + '=X' :
                      assetType === 'crypto' ? symbol + '-USD' : symbol;
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!r.ok) throw new Error('Yahoo error');
      const json = await r.json();
      const res = json?.chart?.result?.[0];
      if (res) {
        const q = res.indicators.quote[0];
        const meta = res.meta;
        const price = meta.regularMarketPrice || q.close?.slice(-1)[0];
        const prev  = meta.previousClose || q.close?.slice(-2)[0];
        const diff  = price - prev;
        const pct   = (diff / prev) * 100;
        return {
          symbol, price, c: price, pc: prev, d: diff, dp: pct,
          h: meta.regularMarketDayHigh, l: meta.regularMarketDayLow,
          o: meta.regularMarketOpen, v: meta.regularMarketVolume,
          _source: 'yahoo'
        };
      }
    } catch (e) {
      console.warn('Yahoo Finance quote also failed');
    }
    return null;
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

    // Try backend first
    try {
      const r = await fetch(
        `${API()}/market/candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${fromTs}&to=${toTs}&type=${assetType}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) throw new Error(r.statusText);
      const data = await r.json();
      if (data?.t?.length) return data;
    } catch (e) {
      console.warn('getCandles backend failed, trying Yahoo Finance...');
    }

    // Try Yahoo Finance directly (works on weekends too)
    try {
      const yInterval = resolution === 'D' ? '1d' : resolution === '60' ? '1h' : '5m';
      const days = Math.floor((toTs - fromTs) / 86400);
      const yRange = days <= 1 ? '1d' : days <= 5 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 365 ? '1y' : '5y';
      const ySymbol = assetType === 'forex' ? symbol.replace('/', '') + '=X' :
                      assetType === 'crypto' ? symbol + '-USD' : symbol;
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${yInterval}&range=${yRange}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!r.ok) throw new Error('Yahoo error');
      const json = await r.json();
      const result = json?.chart?.result?.[0];
      if (result?.timestamp?.length) {
        const q = result.indicators.quote[0];
        return {
          t: result.timestamp,
          o: q.open, h: q.high, l: q.low, c: q.close, v: q.volume,
          s: 'ok'
        };
      }
    } catch (e) {
      console.warn('Yahoo Finance also failed, using generated demo data');
    }

    // Final fallback: generate realistic price walk from last known price
    return _generateDemoCandles(symbol, fromTs, toTs, resolution);
  }

  function _generateDemoCandles(symbol, fromTs, toTs, resolution) {
    const PRICES = {
      AAPL:189, NVDA:875, MSFT:415, TSLA:248, GOOGL:168, AMZN:182, META:491, JPM:198,
      BTC:67430, ETH:3512, SOL:172, BNB:592, XRP:0.58,
      TSM:168, SSNLF:51, BABA:84, TM:198, SONY:88, ASML:842, SHOP:74,
      GOLD:2384, OIL:82, SILVER:28, SPY:519, QQQ:441,
    };
    const basePrice = PRICES[symbol] || 100;
    const volatility = basePrice > 1000 ? 0.015 : basePrice > 100 ? 0.018 : basePrice > 1 ? 0.022 : 0.03;
    const stepSec = resolution === 'D' ? 86400 : resolution === '60' ? 3600 : 300;
    const t = [], o = [], h = [], l = [], c = [], v = [];

    let price = basePrice * (0.85 + Math.random() * 0.1);
    let ts = fromTs;

    // Seeded drift so same symbol always looks similar
    let seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

    while (ts <= toTs) {
      const drift = (rand() - 0.48) * volatility;
      const range = price * volatility * 0.5;
      const open = price;
      const close = price * (1 + drift);
      const high  = Math.max(open, close) + rand() * range;
      const low   = Math.min(open, close) - rand() * range;
      t.push(ts); o.push(+open.toFixed(4)); h.push(+high.toFixed(4));
      l.push(+low.toFixed(4)); c.push(+close.toFixed(4));
      v.push(Math.floor(rand() * 1000000));
      price = close;
      ts += stepSec;
    }
    return { t, o, h, l, c, v, s: 'ok', _demo: true };
  }

  const LOCAL_SYMBOLS = [
    {symbol:'AAPL',  name:'Apple Inc.',              type:'stock',     description:'Apple Inc.'},
    {symbol:'NVDA',  name:'NVIDIA Corp.',             type:'stock',     description:'NVIDIA Corp.'},
    {symbol:'MSFT',  name:'Microsoft Corp.',          type:'stock',     description:'Microsoft Corp.'},
    {symbol:'GOOGL', name:'Alphabet Inc.',            type:'stock',     description:'Alphabet Inc. (Google)'},
    {symbol:'AMZN',  name:'Amazon.com Inc.',          type:'stock',     description:'Amazon.com Inc.'},
    {symbol:'META',  name:'Meta Platforms',           type:'stock',     description:'Meta Platforms Inc.'},
    {symbol:'TSLA',  name:'Tesla Inc.',               type:'stock',     description:'Tesla Inc.'},
    {symbol:'JPM',   name:'JPMorgan Chase',           type:'stock',     description:'JPMorgan Chase & Co.'},
    {symbol:'V',     name:'Visa Inc.',                type:'stock',     description:'Visa Inc.'},
    {symbol:'NFLX',  name:'Netflix Inc.',             type:'stock',     description:'Netflix Inc.'},
    {symbol:'AMD',   name:'Advanced Micro Devices',   type:'stock',     description:'AMD'},
    {symbol:'COIN',  name:'Coinbase Global',          type:'stock',     description:'Coinbase Global Inc.'},
    {symbol:'INTC',  name:'Intel Corp.',              type:'stock',     description:'Intel Corp.'},
    {symbol:'DIS',   name:'The Walt Disney Co.',      type:'stock',     description:'Walt Disney Co.'},
    {symbol:'PYPL',  name:'PayPal Holdings',          type:'stock',     description:'PayPal Holdings Inc.'},
    {symbol:'BAC',   name:'Bank of America',          type:'stock',     description:'Bank of America Corp.'},
    {symbol:'XOM',   name:'Exxon Mobil Corp.',        type:'stock',     description:'Exxon Mobil Corp.'},
    {symbol:'WMT',   name:'Walmart Inc.',             type:'stock',     description:'Walmart Inc.'},
    {symbol:'TSM',   name:'Taiwan Semiconductor',     type:'stock',     description:'Taiwan Semiconductor Mfg.'},
    {symbol:'SSNLF', name:'Samsung Electronics',      type:'stock',     description:'Samsung Electronics (OTC)'},
    {symbol:'BABA',  name:'Alibaba Group',            type:'stock',     description:'Alibaba Group Holding'},
    {symbol:'BIDU',  name:'Baidu Inc.',               type:'stock',     description:'Baidu Inc.'},
    {symbol:'TM',    name:'Toyota Motor Corp.',       type:'stock',     description:'Toyota Motor Corp.'},
    {symbol:'SONY',  name:'Sony Group Corp.',         type:'stock',     description:'Sony Group Corp.'},
    {symbol:'ASML',  name:'ASML Holding NV',          type:'stock',     description:'ASML Holding NV'},
    {symbol:'SE',    name:'Sea Limited',              type:'stock',     description:'Sea Limited'},
    {symbol:'TCEHY', name:'Tencent Holdings',         type:'stock',     description:'Tencent Holdings (OTC)'},
    {symbol:'NVO',   name:'Novo Nordisk',             type:'stock',     description:'Novo Nordisk A/S'},
    {symbol:'SAP',   name:'SAP SE',                   type:'stock',     description:'SAP SE'},
    {symbol:'SHOP',  name:'Shopify Inc.',             type:'stock',     description:'Shopify Inc.'},
    {symbol:'SPY',   name:'S&P 500 ETF',              type:'etf',       description:'SPDR S&P 500 ETF'},
    {symbol:'QQQ',   name:'Nasdaq 100 ETF',           type:'etf',       description:'Invesco QQQ Trust'},
    {symbol:'VTI',   name:'Vanguard Total Market',    type:'etf',       description:'Vanguard Total Stock Market ETF'},
    {symbol:'GLD',   name:'Gold ETF',                 type:'etf',       description:'SPDR Gold Shares'},
    {symbol:'BTC',   name:'Bitcoin',                  type:'crypto',    description:'Bitcoin'},
    {symbol:'ETH',   name:'Ethereum',                 type:'crypto',    description:'Ethereum'},
    {symbol:'SOL',   name:'Solana',                   type:'crypto',    description:'Solana'},
    {symbol:'BNB',   name:'BNB',                      type:'crypto',    description:'BNB'},
    {symbol:'XRP',   name:'XRP',                      type:'crypto',    description:'XRP'},
    {symbol:'DOGE',  name:'Dogecoin',                 type:'crypto',    description:'Dogecoin'},
    {symbol:'ADA',   name:'Cardano',                  type:'crypto',    description:'Cardano'},
    {symbol:'AVAX',  name:'Avalanche',                type:'crypto',    description:'Avalanche'},
    {symbol:'LINK',  name:'Chainlink',                type:'crypto',    description:'Chainlink'},
    {symbol:'EURUSD',name:'Euro / US Dollar',         type:'forex',     description:'EUR/USD'},
    {symbol:'GBPUSD',name:'British Pound / USD',      type:'forex',     description:'GBP/USD'},
    {symbol:'USDJPY',name:'US Dollar / Japanese Yen', type:'forex',     description:'USD/JPY'},
    {symbol:'AUDUSD',name:'Australian Dollar / USD',  type:'forex',     description:'AUD/USD'},
    {symbol:'USDKRW',name:'US Dollar / Korean Won',   type:'forex',     description:'USD/KRW'},
    {symbol:'GOLD',  name:'Gold Spot',                type:'commodity', description:'Gold Spot Price'},
    {symbol:'OIL',   name:'Crude Oil WTI',            type:'commodity', description:'WTI Crude Oil'},
    {symbol:'SILVER',name:'Silver Spot',              type:'commodity', description:'Silver Spot Price'},
    {symbol:'COPPER',name:'Copper',                   type:'commodity', description:'Copper'},
  ];

  async function searchSymbols(query, types = ['stock', 'etf', 'crypto']) {
    const q = query.toUpperCase();

    // Local search always works instantly
    const localResults = LOCAL_SYMBOLS.filter(s =>
      (types.includes('all') || types.includes(s.type)) &&
      (s.symbol.includes(q) || s.name.toUpperCase().includes(q) || s.description.toUpperCase().includes(q))
    ).slice(0, 8);

    if (localResults.length >= 3) return localResults;

    // Try backend for broader results
    try {
      const r = await fetch(`${API()}/market/search?q=${encodeURIComponent(query)}&types=${types.join(',')}`,
        { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(r.statusText);
      const backendResults = await r.json();
      if (backendResults?.length) return backendResults;
    } catch (e) {
      console.warn('searchSymbols backend failed, using local results');
    }
    return localResults;
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
