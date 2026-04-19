-- ═══════════════════════════════════════════════════════════════
-- BrickStocks — Full Database Schema
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Profiles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username       text UNIQUE NOT NULL,
  display_name   text,
  avatar_url     text,
  chips          integer DEFAULT 100,
  portfolio_cash decimal(14,4) DEFAULT 10000,
  tier           text DEFAULT 'rookie' CHECK (tier IN ('rookie','trader','analyst','expert','legend')),
  trophies       integer DEFAULT 0,
  total_trades   integer DEFAULT 0,
  win_trades     integer DEFAULT 0,
  return_pct     decimal(10,4) DEFAULT 0,
  bio            text,
  referral_code  text UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  referred_by    uuid REFERENCES profiles(id),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ── Watchlist ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  symbol     text NOT NULL,
  asset_type text NOT NULL,
  added_at   timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- ── Holdings (personal portfolio) ────────────────────────────────
CREATE TABLE IF NOT EXISTS holdings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  symbol        text NOT NULL,
  asset_type    text NOT NULL,
  quantity      decimal(18,8) NOT NULL DEFAULT 0,
  avg_cost      decimal(14,4) NOT NULL DEFAULT 0,
  current_price decimal(14,4),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- ── Trades (personal trade history) ─────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  symbol      text NOT NULL,
  asset_type  text NOT NULL,
  action      text NOT NULL CHECK (action IN ('buy','sell')),
  quantity    decimal(18,8) NOT NULL,
  price       decimal(14,4) NOT NULL,
  total_value decimal(14,4) NOT NULL,
  order_type  text DEFAULT 'market',
  league_id   uuid,
  executed_at timestamptz DEFAULT now()
);

-- ── Market cache ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_cache (
  symbol        text PRIMARY KEY,
  asset_type    text NOT NULL,
  name          text,
  price         decimal(18,8),
  change_1d     decimal(14,4),
  change_pct_1d decimal(10,4),
  volume        bigint,
  market_cap    bigint,
  pe            decimal(10,2),
  eps           decimal(10,4),
  week_52_high  decimal(14,4),
  week_52_low   decimal(14,4),
  exchange      text,
  description   text,
  icon          text,
  unit          text,
  metadata      jsonb,
  updated_at    timestamptz DEFAULT now()
);

-- ── Agent signals ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_signals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol            text NOT NULL,
  asset_type        text NOT NULL,
  signal_type       text NOT NULL CHECK (signal_type IN ('buy','sell','hold','watch')),
  confidence        decimal(5,2),
  target_price      decimal(14,4),
  stop_loss         decimal(14,4),
  current_price     decimal(14,4),
  reasoning         text,
  technical_score   decimal(5,2),
  sentiment_score   decimal(5,2),
  fundamental_score decimal(5,2),
  created_at        timestamptz DEFAULT now(),
  expires_at        timestamptz
);

-- ── Agent trades (performance tracking) ─────────────────────────
CREATE TABLE IF NOT EXISTS agent_trades (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id  uuid REFERENCES agent_signals ON DELETE SET NULL,
  entry_price decimal(14,4),
  exit_price  decimal(14,4),
  entry_date  timestamptz DEFAULT now(),
  exit_date   timestamptz,
  return_pct  decimal(10,4),
  outcome     text DEFAULT 'pending' CHECK (outcome IN ('pending','win','loss')),
  created_at  timestamptz DEFAULT now()
);

-- ── Agent config (self-learning weights) ────────────────────────
CREATE TABLE IF NOT EXISTS agent_config (
  id      integer PRIMARY KEY DEFAULT 1,
  weights jsonb DEFAULT '{"technical":0.40,"sentiment":0.30,"fundamental":0.30}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO agent_config(id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Leagues ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  starting_capital decimal(14,2) DEFAULT 10000,
  status           text DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed')),
  prize_chips      integer DEFAULT 500,
  prize_2nd        integer DEFAULT 250,
  prize_3rd        integer DEFAULT 100,
  created_at       timestamptz DEFAULT now()
);

-- ── League members ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     uuid NOT NULL REFERENCES leagues ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  starting_cash decimal(14,4) DEFAULT 10000,
  current_cash  decimal(14,4) DEFAULT 10000,
  current_value decimal(14,4) DEFAULT 10000,
  return_pct    decimal(10,4) DEFAULT 0,
  rank          integer,
  joined_at     timestamptz DEFAULT now(),
  UNIQUE(league_id, user_id)
);

-- ── League holdings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_holdings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     uuid NOT NULL REFERENCES leagues ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  symbol        text NOT NULL,
  asset_type    text NOT NULL,
  quantity      decimal(18,8) NOT NULL DEFAULT 0,
  avg_cost      decimal(14,4) NOT NULL DEFAULT 0,
  current_price decimal(14,4),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(league_id, user_id, symbol)
);

-- ── League trades ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_trades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid NOT NULL REFERENCES leagues ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  symbol      text NOT NULL,
  asset_type  text NOT NULL,
  action      text NOT NULL CHECK (action IN ('buy','sell')),
  quantity    decimal(18,8) NOT NULL,
  price       decimal(14,4) NOT NULL,
  total_value decimal(14,4) NOT NULL,
  executed_at timestamptz DEFAULT now()
);

-- ── Challenges ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  description    text,
  icon           text DEFAULT '⚡',
  challenge_type text NOT NULL CHECK (challenge_type IN ('daily','weekly','milestone')),
  category       text,
  target_value   decimal(10,2) DEFAULT 1,
  reward_chips   integer DEFAULT 10,
  reward_xp      integer DEFAULT 0,
  difficulty     text DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','hard','elite')),
  active_from    date,
  active_until   date,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

-- ── User challenge progress ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES challenges ON DELETE CASCADE,
  progress     decimal(10,2) DEFAULT 0,
  completed    boolean DEFAULT false,
  claimed      boolean DEFAULT false,
  completed_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

-- ── Portfolio snapshots (for performance chart) ──────────────────
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  total_value    decimal(14,4) NOT NULL,
  cash           decimal(14,4),
  invested_value decimal(14,4),
  return_pct     decimal(10,4),
  snapshotted_at timestamptz DEFAULT now()
);

-- ── Social follows ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  follower_id  uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

-- ── News cache ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline     text NOT NULL,
  summary      text,
  source       text,
  url          text,
  image        text,
  symbols      text[] DEFAULT '{}',
  sentiment    text,
  sentiment_score decimal(5,2),
  published_at timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_holdings_user     ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_user       ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_executed   ON trades(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_signals_sym ON agent_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_agent_signals_ts  ON agent_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_members_li ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_ui ON league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_league_holdings   ON league_holdings(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_league_trades_li  ON league_trades(league_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_user    ON portfolio_snapshots(user_id, snapshotted_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_challenges   ON user_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user    ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_news_published    ON news_cache(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_trophies ON profiles(trophies DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles USING GIN (username gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist        ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_holdings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_trades    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows          ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "profiles_public_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "leagues_public_read"  ON leagues   FOR SELECT USING (true);
CREATE POLICY "league_members_public_read" ON league_members FOR SELECT USING (true);
CREATE POLICY "market_cache_public"  ON market_cache FOR SELECT USING (true);
CREATE POLICY "agent_signals_public" ON agent_signals FOR SELECT USING (true);
CREATE POLICY "news_public_read"     ON news_cache FOR SELECT USING (true);
CREATE POLICY "challenges_public"    ON challenges FOR SELECT USING (true);

-- User owns their own data
CREATE POLICY "own_profile"    ON profiles   FOR ALL USING (auth.uid() = id);
CREATE POLICY "own_holdings"   ON holdings   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_trades"     ON trades     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_watchlist"  ON watchlist  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_lm"         ON league_members  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_lh"         ON league_holdings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_lt"         ON league_trades   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_challenges" ON user_challenges FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_snapshots"  ON portfolio_snapshots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_follows"    ON follows FOR ALL USING (auth.uid() = follower_id);

-- ═══════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════

-- Add chips to a user
CREATE OR REPLACE FUNCTION add_chips(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles SET chips = chips + p_amount WHERE id = p_user_id;
END;
$$;

-- Update trade stats
CREATE OR REPLACE FUNCTION update_trade_stats(p_user_id uuid, p_action text, p_pnl decimal DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_action = 'buy' THEN
    UPDATE profiles SET total_trades = total_trades + 1 WHERE id = p_user_id;
  ELSIF p_action = 'sell' THEN
    UPDATE profiles SET total_trades = total_trades + 1 WHERE id = p_user_id;
    IF p_pnl IS NOT NULL AND p_pnl > 0 THEN
      UPDATE profiles SET win_trades = win_trades + 1 WHERE id = p_user_id;
    END IF;
  END IF;
END;
$$;

-- Take daily portfolio snapshot
CREATE OR REPLACE FUNCTION snapshot_portfolio(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cash     decimal := 0;
  v_invested decimal := 0;
  v_total    decimal := 0;
  v_ret      decimal := 0;
BEGIN
  SELECT COALESCE(portfolio_cash, 0) INTO v_cash
    FROM profiles WHERE id = p_user_id;

  SELECT COALESCE(SUM(COALESCE(current_price, avg_cost) * quantity), 0) INTO v_invested
    FROM holdings WHERE user_id = p_user_id;

  v_total := v_cash + v_invested;
  v_ret   := CASE WHEN v_total > 0 THEN ((v_total - 10000.0) / 10000.0) * 100 ELSE 0 END;

  INSERT INTO portfolio_snapshots(user_id, total_value, cash, invested_value, return_pct)
    VALUES (p_user_id, v_total, v_cash, v_invested, v_ret);

  UPDATE profiles SET return_pct = v_ret WHERE id = p_user_id;
END;
$$;

-- Finalize league and award prizes
CREATE OR REPLACE FUNCTION finalize_league(p_league_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league  record;
  v_rank    integer := 0;
  m         record;
BEGIN
  SELECT * INTO v_league FROM leagues WHERE id = p_league_id;
  -- Rank members by return_pct descending
  FOR m IN SELECT * FROM league_members WHERE league_id = p_league_id ORDER BY return_pct DESC
  LOOP
    v_rank := v_rank + 1;
    UPDATE league_members SET rank = v_rank WHERE id = m.id;
    -- Award chips
    IF v_rank = 1 THEN
      PERFORM add_chips(m.user_id, v_league.prize_chips);
      UPDATE profiles SET trophies = trophies + 50 WHERE id = m.user_id;
    ELSIF v_rank = 2 THEN
      PERFORM add_chips(m.user_id, v_league.prize_2nd);
      UPDATE profiles SET trophies = trophies + 25 WHERE id = m.user_id;
    ELSIF v_rank = 3 THEN
      PERFORM add_chips(m.user_id, v_league.prize_3rd);
      UPDATE profiles SET trophies = trophies + 10 WHERE id = m.user_id;
    ELSIF v_rank <= 10 THEN
      PERFORM add_chips(m.user_id, 25);
      UPDATE profiles SET trophies = trophies + 5 WHERE id = m.user_id;
    END IF;
  END LOOP;
  -- Mark league completed
  UPDATE leagues SET status = 'completed' WHERE id = p_league_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- SEED: Default challenges
-- ═══════════════════════════════════════════════════════════════

INSERT INTO challenges (title, description, icon, challenge_type, category, target_value, reward_chips, difficulty) VALUES
  ('First Trade',      'Execute your first buy order on any asset.',       '🚀', 'daily',     'trading',     1,  25,  'easy'),
  ('Day Trader',       'Make 3 trades in a single day.',                   '⚡', 'daily',     'trading',     3,  30,  'easy'),
  ('Green Day',        'End the day with positive portfolio return.',       '📈', 'daily',     'performance', 1,  40,  'medium'),
  ('Crypto Curious',   'Make your first crypto trade.',                    '🪙', 'daily',     'trading',     1,  20,  'easy'),
  ('Forex Explorer',   'Execute a forex trade.',                           '💱', 'daily',     'trading',     1,  20,  'easy'),
  ('Commodity Trader', 'Trade gold, oil, or any commodity.',               '🛢️','daily',     'trading',     1,  20,  'easy'),
  ('AI Follower',      'Execute a trade following an AI agent signal.',    '🤖', 'weekly',    'research',    1,  45,  'medium'),
  ('Diversify',        'Hold at least 3 different asset classes.',         '🌍', 'weekly',    'portfolio',   3,  50,  'medium'),
  ('Winning Week',     'Make 5+ profitable trades this week.',             '🏆', 'weekly',    'performance', 5, 100,  'hard'),
  ('Research Reader',  'Visit the Research page 5 times this week.',      '🔬', 'weekly',    'learning',    5,  15,  'easy'),
  ('10% Return',       'Achieve 10% return from starting capital.',        '💰', 'milestone', 'performance',10, 100,  'hard'),
  ('25% Return',       'Achieve 25% return from starting capital.',        '🚀', 'milestone', 'performance',25, 250,  'elite'),
  ('50% Return',       'Double up — achieve 50% return.',                  '🌟', 'milestone', 'performance',50, 500,  'elite'),
  ('100 Trades',       'Execute 100 total trades.',                        '⚡', 'milestone', 'trading',   100, 200,  'hard'),
  ('League Winner',    'Win a BrickStocks league.',                        '👑', 'milestone', 'competition', 1, 1000, 'elite')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- SEED: Create first active league
-- ═══════════════════════════════════════════════════════════════

INSERT INTO leagues (name, description, start_date, end_date, starting_capital, status, prize_chips, prize_2nd, prize_3rd)
VALUES (
  'Spring Sprint 2026',
  'The inaugural BrickStocks League. Everyone starts with $10,000. Best % return wins.',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '14 days',
  10000,
  'active',
  500, 250, 100
) ON CONFLICT DO NOTHING;
