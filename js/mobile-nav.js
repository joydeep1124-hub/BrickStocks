/* ═══════════════════════════════════════════════════════════════════
   BrickStocks — Mobile Navigation
   • Compact scroll-hide top header
   • Bottom tab bar — 5 direct tabs
   • Zero impact on desktop (≥769px)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (!window.matchMedia('(max-width: 768px)').matches) return;

  function icon(d) {
    var paths = Array.isArray(d) ? d : [d];
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true" width="20" height="20">' +
      paths.map(function (p) { return '<path d="' + p + '"/>'; }).join('') +
      '</svg>'
    );
  }

  var TABS = [
    {
      href: '/index.html',
      label: 'Home',
      icon: icon('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10'),
      match: ['/', '/index.html'],
    },
    {
      href: '/trade.html',
      label: 'Trade',
      icon: icon('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'),
      match: ['/trade.html'],
    },
    {
      href: '/portfolio.html',
      label: 'Portfolio',
      icon: icon('M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z'),
      match: ['/portfolio.html'],
    },
    {
      href: '/league.html',
      label: 'League',
      icon: icon('M8 21H5a2 2 0 01-2-2v-2a7 7 0 017-7h4a7 7 0 017 7v2a2 2 0 01-2 2h-3 M12 3a4 4 0 100 8 4 4 0 000-8z'),
      match: ['/league.html', '/leaderboard.html'],
    },
    {
      href: '/agent.html',
      label: 'AI Agent',
      icon: icon([
        'M12 2a2 2 0 012 2v1h4a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h4V4a2 2 0 012-2z',
        'M9 12h6 M9 16h4',
      ]),
      match: ['/agent.html'],
    },
    {
      href: '/profile.html',
      label: 'Profile',
      icon: icon([
        'M16 7a4 4 0 11-8 0 4 4 0 018 0z',
        'M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
      ]),
      match: ['/profile.html'],
    },
  ];

  document.addEventListener('DOMContentLoaded', function () {
    var path = window.location.pathname.replace(/\/$/, '') || '/';

    /* ── Inject bottom tab bar ───────────────────────────────────── */
    var tabsHTML = TABS.map(function (t) {
      var active = t.match.indexOf(path) !== -1 ||
                   t.match.some(function(m){ return path.endsWith(m); });
      return (
        '<a href="' + t.href + '"' +
        ' class="mbn-tab' + (active ? ' active' : '') + '"' +
        ' aria-label="' + t.label + '">' +
        '<div class="mbn-tab-pip">' + t.icon + '</div>' +
        '<span>' + t.label + '</span>' +
        '</a>'
      );
    }).join('');

    var bar = document.createElement('nav');
    bar.className = 'mobile-tab-bar';
    bar.setAttribute('aria-label', 'Main navigation');
    bar.innerHTML = tabsHTML;
    document.body.appendChild(bar);

    /* ── Hide burger + desktop links ─────────────────────────────── */
    var burger = document.querySelector('.nav-burger');
    var links  = document.querySelector('.nav-links');
    if (burger) burger.style.display = 'none';
    if (links)  links.style.display  = 'none';

    /* ── Scroll-hide top nav ─────────────────────────────────────── */
    var nav       = document.querySelector('nav:not(.mobile-tab-bar)');
    var lastY     = 0;
    var ticking   = false;

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y > lastY && y > 80) {
          nav && nav.classList.add('nav-scrolled-away');
        } else {
          nav && nav.classList.remove('nav-scrolled-away');
        }
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  });
})();

/* ── More dropdown (desktop) ─────────────────────────── */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.querySelector('.nav-more-btn');
    const dd  = document.getElementById('nav-more-dd');
    if (!btn || !dd) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      btn.classList.toggle('open');
      dd.classList.toggle('open');
    });

    document.addEventListener('click', function () {
      btn.classList.remove('open');
      dd.classList.remove('open');
    });
  });
})();
