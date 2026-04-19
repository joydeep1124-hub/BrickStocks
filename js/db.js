// ─── BrickStocks — Supabase Client ───────────────────────────────────────────
// Single init point — all pages use window._db
// Replace SUPABASE_URL and SUPABASE_KEY with your project values.
const SUPABASE_URL = window.BS_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = window.BS_SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY';

const _db = window._db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── API Base ─────────────────────────────────────────────────────────────────
window.BS_API = window.BS_API_BASE || 'https://brickstocks-api.onrender.com';
