/* ═══════════════════════════════════════════════════════
   BrickStocks — auth.js
   Shared auth module. Include after supabase CDN + db.js.
   Exposes: window.BSAuth
   ═══════════════════════════════════════════════════════ */
(function () {
  function getDb() {
    return window._db || (window._db = supabase.createClient(
      window.BS_SUPABASE_URL || 'YOUR_SUPABASE_URL',
      window.BS_SUPABASE_KEY || 'YOUR_SUPABASE_ANON_KEY'
    ));
  }

  /* ── Inject CSS ────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
  .auth-overlay {
    position:fixed;inset:0;z-index:2000;
    background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);
    align-items:center;justify-content:center;
    opacity:0;pointer-events:none;transition:opacity 0.2s;display:none;
  }
  .auth-overlay.visible{display:flex;}
  .auth-overlay.open{opacity:1;pointer-events:all;}
  .auth-card{
    background:#13181f;border:1px solid rgba(255,255,255,0.11);
    border-radius:20px;padding:32px;width:100%;max-width:420px;margin:16px;
    position:relative;transform:translateY(8px);transition:transform 0.2s;
  }
  .auth-overlay.open .auth-card{transform:translateY(0);}
  .auth-brand{
    font-family:'Syne',sans-serif;font-weight:800;font-size:22px;
    text-align:center;margin-bottom:4px;color:#e6edf3;
    display:flex;align-items:center;justify-content:center;gap:10px;
  }
  .auth-brand-icon{
    width:38px;height:38px;border-radius:10px;
    background:linear-gradient(135deg,#22d3ee,#0891b2);
    display:flex;align-items:center;justify-content:center;font-size:20px;
  }
  .auth-brand span{color:#22d3ee;}
  .auth-tagline{text-align:center;font-size:13px;color:#5a6475;margin-bottom:24px;}
  .auth-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:24px;}
  .auth-tab{
    flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;
    color:#5a6475;cursor:pointer;border-bottom:2px solid transparent;
    transition:all 0.15s;background:none;border-left:none;border-right:none;border-top:none;
    font-family:'DM Sans',sans-serif;
  }
  .auth-tab.active{color:#22d3ee;border-bottom-color:#22d3ee;}
  .auth-field{margin-bottom:16px;}
  .auth-label{font-size:12px;font-weight:600;color:#8b949e;margin-bottom:6px;display:block;}
  .auth-input{
    width:100%;padding:10px 14px;background:#1a2030;
    border:1px solid rgba(255,255,255,0.07);border-radius:9px;
    color:#e6edf3;font-size:14px;font-family:'DM Sans',sans-serif;
    outline:none;transition:border-color 0.15s;
  }
  .auth-input:focus{border-color:rgba(34,211,238,0.4);}
  .auth-input::placeholder{color:#3d4450;}
  .auth-submit{
    width:100%;padding:12px;background:#22d3ee;color:#07090d;
    border:none;border-radius:9px;font-size:14px;font-weight:800;
    font-family:'Syne',sans-serif;cursor:pointer;transition:all 0.15s;
    margin-top:4px;letter-spacing:0.3px;
  }
  .auth-submit:hover{background:#06b6d4;}
  .auth-submit:disabled{opacity:0.4;cursor:not-allowed;}
  .auth-msg{
    font-size:12px;padding:10px 12px;border-radius:7px;
    margin-bottom:16px;display:none;
  }
  .auth-msg.show{display:block;}
  .auth-msg.err{color:#ef4444;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);}
  .auth-msg.ok{color:#22c55e;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);}
  .auth-close{
    position:absolute;top:14px;right:14px;width:28px;height:28px;
    border-radius:50%;background:rgba(255,255,255,0.05);border:none;
    color:#5a6475;cursor:pointer;font-size:15px;
    display:flex;align-items:center;justify-content:center;transition:all 0.15s;
  }
  .auth-close:hover{background:rgba(255,255,255,0.1);color:#e6edf3;}
  .auth-switch{text-align:center;font-size:12px;color:#3d4450;margin-top:16px;}
  .auth-switch a{color:#22d3ee;cursor:pointer;text-decoration:none;}
  .auth-forgot{display:block;text-align:right;font-size:11px;color:#5a6475;margin-top:-8px;margin-bottom:12px;cursor:pointer;}
  .auth-forgot:hover{color:#8b949e;}
  .auth-username-hint{font-size:11px;color:#3d4450;margin-top:4px;}
  .auth-username-check{font-size:11px;margin-top:4px;height:14px;}
  .auth-username-check.ok{color:#22c55e;}
  .auth-username-check.err{color:#ef4444;}
  /* Nav */
  #nav-auth-area{display:flex;align-items:center;gap:8px;margin-left:auto;}
  .nav-user{display:flex;align-items:center;gap:8px;}
  .nav-avatar{
    width:32px;height:32px;border-radius:50%;
    background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.3);
    display:flex;align-items:center;justify-content:center;
    font-family:'Syne',sans-serif;font-size:11px;font-weight:700;
    color:#22d3ee;flex-shrink:0;cursor:pointer;
  }
  .nav-username{font-size:12px;font-weight:600;color:#e6edf3;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .nav-signin-btn{
    font-size:13px;font-weight:800;color:#07090d;background:#22d3ee;
    border:none;padding:7px 18px;border-radius:8px;cursor:pointer;
    transition:all 0.15s;font-family:'DM Sans',sans-serif;white-space:nowrap;
  }
  .nav-signin-btn:hover{background:#06b6d4;}
  .nav-chips{
    font-family:'DM Mono',monospace;font-size:12px;font-weight:600;
    color:#22d3ee;background:rgba(34,211,238,0.1);
    border:1px solid rgba(34,211,238,0.2);
    padding:4px 10px;border-radius:20px;white-space:nowrap;
    text-decoration:none;display:flex;align-items:center;gap:4px;
  }
  .nav-settings-wrap{position:relative;}
  .nav-settings-btn{
    width:32px;height:32px;border-radius:8px;
    background:none;border:1px solid rgba(255,255,255,0.07);
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:all 0.15s;color:#5a6475;flex-shrink:0;
  }
  .nav-settings-btn:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);color:#e6edf3;}
  .nav-settings-btn svg{width:15px;height:15px;fill:currentColor;}
  .nav-settings-dropdown{
    position:absolute;top:calc(100% + 8px);right:0;
    background:#13181f;border:1px solid rgba(255,255,255,0.11);
    border-radius:14px;min-width:200px;padding:8px;z-index:300;
    box-shadow:0 8px 40px rgba(0,0,0,0.6);display:none;
  }
  .nav-settings-dropdown.open{display:block;}
  .nav-dd-item{
    display:flex;align-items:center;gap:10px;
    padding:9px 12px;border-radius:8px;cursor:pointer;
    font-size:13px;font-weight:500;color:#8b949e;
    transition:all 0.12s;text-decoration:none;border:none;
    background:none;width:100%;text-align:left;
  }
  .nav-dd-item:hover{background:rgba(255,255,255,0.05);color:#e6edf3;}
  .nav-dd-item.danger:hover{background:rgba(239,68,68,0.1);color:#ef4444;}
  .nav-dd-item .dd-icon{font-size:15px;width:18px;text-align:center;}
  .nav-dd-divider{height:1px;background:rgba(255,255,255,0.06);margin:4px 0;}
  `;
  document.head.appendChild(style);

  /* ── DOM: overlay ──────────────────────────────────────── */
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card">
      <button class="auth-close" id="auth-close-btn">✕</button>
      <div class="auth-brand">
        <div class="auth-brand-icon">📈</div>
        <span>Brick<span>Stocks</span></span>
      </div>
      <p class="auth-tagline">Trade smart. Compete harder.</p>
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="signin">Sign In</button>
        <button class="auth-tab" data-tab="signup">Create Account</button>
      </div>
      <div id="auth-msg" class="auth-msg"></div>

      <!-- Sign-in form -->
      <div id="auth-signin-form">
        <div class="auth-field">
          <label class="auth-label">Email</label>
          <input class="auth-input" id="auth-email-in" type="email" placeholder="you@email.com" autocomplete="email">
        </div>
        <div class="auth-field">
          <label class="auth-label">Password</label>
          <input class="auth-input" id="auth-pass-in" type="password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <a class="auth-forgot" id="auth-forgot-link">Forgot password?</a>
        <button class="auth-submit" id="auth-signin-btn">Sign In</button>
        <p class="auth-switch">No account? <a id="auth-to-signup">Create one →</a></p>
      </div>

      <!-- Sign-up form -->
      <div id="auth-signup-form" style="display:none">
        <div class="auth-field">
          <label class="auth-label">Email</label>
          <input class="auth-input" id="auth-email-up" type="email" placeholder="you@email.com" autocomplete="email">
        </div>
        <div class="auth-field">
          <label class="auth-label">Username</label>
          <input class="auth-input" id="auth-username-up" type="text" placeholder="tradername" autocomplete="username" maxlength="20">
          <div class="auth-username-check" id="auth-username-check"></div>
          <div class="auth-username-hint">Letters, numbers, underscores only. 3–20 chars.</div>
        </div>
        <div class="auth-field">
          <label class="auth-label">Password</label>
          <input class="auth-input" id="auth-pass-up" type="password" placeholder="At least 6 characters" autocomplete="new-password">
        </div>
        <button class="auth-submit" id="auth-signup-btn">Create Account</button>
        <p class="auth-switch">Have an account? <a id="auth-to-signin">Sign in →</a></p>
      </div>

      <!-- Username setup (post-OAuth) -->
      <div id="auth-username-step" style="display:none" class="auth-username-step">
        <div class="auth-field">
          <label class="auth-label">Choose your trading name</label>
          <input class="auth-input" id="auth-username-setup" type="text" placeholder="tradername" maxlength="20">
          <div class="auth-username-check" id="auth-username-setup-check"></div>
          <div class="auth-username-hint">This is how you'll appear on leaderboards.</div>
        </div>
        <button class="auth-submit" id="auth-username-submit-btn">Start Trading</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  /* ── Toast helper ──────────────────────────────────────── */
  function toast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    const icons = { success: '✅', error: '❌', info: '📊', warning: '⚠️' };
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type] || '📊'}</span><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ── State ─────────────────────────────────────────────── */
  let currentUser = null;
  let currentProfile = null;
  let _usernameDebounce = null;

  /* ── Overlay helpers ───────────────────────────────────── */
  function showOverlay() {
    overlay.classList.add('visible');
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  function hideOverlay() {
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.classList.remove('visible'), { once: true });
  }

  function showMsg(msg, type = 'err') {
    const el = document.getElementById('auth-msg');
    el.textContent = msg;
    el.className = `auth-msg show ${type}`;
  }

  function clearMsg() {
    const el = document.getElementById('auth-msg');
    if (el) { el.className = 'auth-msg'; el.textContent = ''; }
  }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('auth-signin-form').style.display = tab === 'signin' ? '' : 'none';
    document.getElementById('auth-signup-form').style.display = tab === 'signup' ? '' : 'none';
    clearMsg();
  }

  /* ── Username validation ───────────────────────────────── */
  function validateUsername(val) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(val);
  }

  async function checkUsernameAvailable(username, checkEl) {
    if (!validateUsername(username)) {
      checkEl.textContent = 'Letters, numbers, underscores only (3–20 chars)';
      checkEl.className = 'auth-username-check err';
      return false;
    }
    checkEl.textContent = 'Checking…';
    checkEl.className = 'auth-username-check';
    const { data } = await getDb().from('profiles').select('id').eq('username', username).maybeSingle();
    if (data) {
      checkEl.textContent = 'Username taken';
      checkEl.className = 'auth-username-check err';
      return false;
    }
    checkEl.textContent = '✓ Available';
    checkEl.className = 'auth-username-check ok';
    return true;
  }

  /* ── Sign In ───────────────────────────────────────────── */
  async function signIn() {
    clearMsg();
    const email = document.getElementById('auth-email-in').value.trim();
    const pass  = document.getElementById('auth-pass-in').value;
    if (!email || !pass) return showMsg('Fill in all fields.');
    const btn = document.getElementById('auth-signin-btn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    const { error } = await getDb().auth.signInWithPassword({ email, password: pass });
    btn.disabled = false; btn.textContent = 'Sign In';
    if (error) return showMsg(error.message);
    hideOverlay();
    toast('Welcome back!', 'success');
  }

  /* ── Sign Up ───────────────────────────────────────────── */
  async function signUp() {
    clearMsg();
    const email    = document.getElementById('auth-email-up').value.trim();
    const username = document.getElementById('auth-username-up').value.trim().toLowerCase();
    const pass     = document.getElementById('auth-pass-up').value;
    if (!email || !username || !pass) return showMsg('Fill in all fields.');
    if (pass.length < 6) return showMsg('Password must be at least 6 characters.');
    const checkEl = document.getElementById('auth-username-check');
    const ok = await checkUsernameAvailable(username, checkEl);
    if (!ok) return;
    const btn = document.getElementById('auth-signup-btn');
    btn.disabled = true; btn.textContent = 'Creating account…';
    const { data, error } = await getDb().auth.signUp({ email, password: pass,
      options: { data: { username } }
    });
    btn.disabled = false; btn.textContent = 'Create Account';
    if (error) return showMsg(error.message);
    if (data.user) {
      await getDb().from('profiles').upsert({
        id: data.user.id, username,
        display_name: username,
        chips: 100, portfolio_cash: 10000,
        tier: 'rookie', trophies: 0
      });
    }
    showMsg('Check your email to confirm, then sign in!', 'ok');
    setTimeout(() => switchTab('signin'), 2500);
  }

  /* ── Forgot password ───────────────────────────────────── */
  async function forgotPassword() {
    const email = document.getElementById('auth-email-in').value.trim();
    if (!email) return showMsg('Enter your email first.');
    await getDb().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/profile.html?reset=1'
    });
    showMsg('Reset link sent — check your inbox.', 'ok');
  }

  /* ── Profile fetch & nav render ───────────────────────── */
  async function fetchProfile(userId) {
    const { data } = await getDb().from('profiles').select('*').eq('id', userId).maybeSingle();
    currentProfile = data;
    return data;
  }

  function renderNavUser(profile) {
    const area = document.getElementById('nav-auth-area');
    if (!area) return;
    const initials = (profile.display_name || profile.username || '?').slice(0, 2).toUpperCase();
    area.innerHTML = `
      <a href="/portfolio.html" class="nav-chips">
        🪙 ${(profile.chips || 0).toLocaleString()} Chips
      </a>
      <span class="nav-tier ${profile.tier || 'rookie'}">${profile.tier || 'Rookie'}</span>
      <div class="nav-settings-wrap">
        <button class="nav-settings-btn" id="nav-settings-btn" title="Account">
          <svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </button>
        <div class="nav-settings-dropdown" id="nav-settings-dd">
          <div style="padding:8px 12px 6px;">
            <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:#e6edf3;">${profile.display_name || profile.username}</div>
            <div style="font-family:'DM Mono',monospace;font-size:10px;color:#5a6475;">@${profile.username}</div>
          </div>
          <div class="nav-dd-divider"></div>
          <a class="nav-dd-item" href="/profile.html"><span class="dd-icon">👤</span> Profile</a>
          <a class="nav-dd-item" href="/portfolio.html"><span class="dd-icon">📊</span> Portfolio</a>
          <a class="nav-dd-item" href="/store.html"><span class="dd-icon">🛒</span> Buy Chips</a>
          <div class="nav-dd-divider"></div>
          <button class="nav-dd-item danger" id="nav-signout-btn"><span class="dd-icon">🚪</span> Sign Out</button>
        </div>
      </div>`;

    document.getElementById('nav-settings-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('nav-settings-dd')?.classList.toggle('open');
    });
    document.addEventListener('click', () => document.getElementById('nav-settings-dd')?.classList.remove('open'));
    document.getElementById('nav-signout-btn')?.addEventListener('click', signOut);
  }

  function renderNavGuest() {
    const area = document.getElementById('nav-auth-area');
    if (!area) return;
    area.innerHTML = `<button class="nav-signin-btn" id="nav-signin-btn">Sign In</button>`;
    document.getElementById('nav-signin-btn')?.addEventListener('click', showOverlay);
  }

  /* ── Sign Out ──────────────────────────────────────────── */
  async function signOut() {
    await getDb().auth.signOut();
    currentUser = null; currentProfile = null;
    renderNavGuest();
    toast('Signed out.', 'info');
  }

  /* ── Init ──────────────────────────────────────────────── */
  async function init() {
    const { data: { session } } = await getDb().auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      const profile = await fetchProfile(session.user.id);
      if (profile) {
        renderNavUser(profile);
        if (window.BSAuth?.onReady) window.BSAuth.onReady(session.user, profile);
      } else {
        document.getElementById('auth-signin-form').style.display = 'none';
        document.getElementById('auth-signup-form').style.display = 'none';
        document.getElementById('auth-username-step').style.display = '';
        showOverlay();
      }
    } else {
      renderNavGuest();
    }

    getDb().auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        currentUser = session.user;
        const profile = await fetchProfile(session.user.id);
        if (profile) {
          renderNavUser(profile);
          if (window.BSAuth?.onReady) window.BSAuth.onReady(session.user, profile);
        }
      } else if (event === 'SIGNED_OUT') {
        currentUser = null; currentProfile = null;
        renderNavGuest();
      }
    });
  }

  /* ── Event listeners ───────────────────────────────────── */
  document.getElementById('auth-close-btn')?.addEventListener('click', hideOverlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) hideOverlay(); });

  document.querySelectorAll('.auth-tab').forEach(t =>
    t.addEventListener('click', () => switchTab(t.dataset.tab))
  );

  document.getElementById('auth-to-signup')?.addEventListener('click', () => switchTab('signup'));
  document.getElementById('auth-to-signin')?.addEventListener('click', () => switchTab('signin'));
  document.getElementById('auth-signin-btn')?.addEventListener('click', signIn);
  document.getElementById('auth-signup-btn')?.addEventListener('click', signUp);
  document.getElementById('auth-forgot-link')?.addEventListener('click', forgotPassword);

  document.getElementById('auth-email-in')?.addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  document.getElementById('auth-pass-in')?.addEventListener('keydown',  e => { if (e.key === 'Enter') signIn(); });

  const usernameUpInput = document.getElementById('auth-username-up');
  usernameUpInput?.addEventListener('input', () => {
    clearTimeout(_usernameDebounce);
    const val = usernameUpInput.value.trim().toLowerCase();
    const checkEl = document.getElementById('auth-username-check');
    if (val.length < 3) { checkEl.textContent = ''; return; }
    _usernameDebounce = setTimeout(() => checkUsernameAvailable(val, checkEl), 500);
  });

  /* Username setup submit */
  document.getElementById('auth-username-submit-btn')?.addEventListener('click', async () => {
    if (!currentUser) return;
    const username = document.getElementById('auth-username-setup').value.trim().toLowerCase();
    const checkEl  = document.getElementById('auth-username-setup-check');
    const ok = await checkUsernameAvailable(username, checkEl);
    if (!ok) return;
    const btn = document.getElementById('auth-username-submit-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    await getDb().from('profiles').upsert({
      id: currentUser.id, username, display_name: username,
      chips: 100, portfolio_cash: 10000, tier: 'rookie', trophies: 0
    });
    const profile = await fetchProfile(currentUser.id);
    renderNavUser(profile);
    hideOverlay();
    toast('Welcome to BrickStocks! Your $10,000 is ready. 🚀', 'success');
    btn.disabled = false; btn.textContent = 'Start Trading';
  });

  /* Show sign-in button immediately — init() will replace it if logged in */
  renderNavGuest();

  /* Run */
  init().catch(() => renderNavGuest());

  /* ── Public API ────────────────────────────────────────── */
  window.BSAuth = {
    open: showOverlay,
    close: hideOverlay,
    getUser: () => currentUser,
    getProfile: () => currentProfile,
    refreshProfile: async () => {
      if (!currentUser) return null;
      return await fetchProfile(currentUser.id);
    },
    toast,
    onReady: null,
  };
})();
