/* Shared behaviour for every page: footer year, mobile nav, visit beacon. */
(function () {
  var y = document.getElementById('y');
  if (y) y.textContent = new Date().getFullYear();

  var nt = document.querySelector('.nav-toggle');
  var nl = document.getElementById('nav-links');
  var scrim = document.querySelector('.nav-scrim');

  function setNavOpen(open) {
    if (!nt || !nl) return;
    nt.setAttribute('aria-expanded', String(open));
    nt.textContent = open ? 'Close' : 'Menu';
    nl.classList.toggle('is-open', open);
    document.body.classList.toggle('is-nav-open', open);
    if (scrim) {
      if (open) scrim.removeAttribute('hidden');
      else scrim.setAttribute('hidden', '');
    }
  }
  function closeNav() { setNavOpen(false); }

  if (nt && nl) {
    nt.addEventListener('click', function () {
      setNavOpen(nt.getAttribute('aria-expanded') !== 'true');
    });
    nl.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
    if (scrim) scrim.addEventListener('click', closeNav);
    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width:961px)').matches) closeNav();
    });
  }

  /* Pause decorative spin when off-screen so it doesn't keep a compositor busy. */
  var stampSvg = document.querySelector('.stamp svg');
  if (stampSvg && 'IntersectionObserver' in window) {
    var stampIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        stampSvg.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
      });
    }, { rootMargin: '80px' });
    stampIo.observe(stampSvg.closest('.stamp') || stampSvg);
  }
})();

/* Private audience counter (first-party, no cookies). */
(function () {
  try {
    var key = 'vv_visitor';
    var id = '';
    try { id = localStorage.getItem(key) || ''; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36))
        .replace(/[^A-Za-z0-9_-]/g, '')
        .slice(0, 40);
      try { localStorage.setItem(key, id); } catch (e) {}
    }
    var body = JSON.stringify({
      v: id,
      p: location.pathname || '/',
      r: document.referrer || '',
      w: window.innerWidth || 0
    });
    var blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/collect', blob);
    else fetch('/api/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
  } catch (e) {}
})();
