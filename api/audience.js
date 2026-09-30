const {
  RANGES,
  analyticsReady,
  escapeHtml,
  loadReport,
  normalizeRange,
  placeName,
  shortDay,
  tokenMatches,
} = require('../lib/analytics');

const DEVICE_ORDER = ['Desktop', 'Tablet', 'Mobile'];

function percent(count, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((count / total) * 100)));
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function viewsEach(views, visitors) {
  if (!visitors) return '';
  const each = views / visitors;
  const rounded = each >= 10 ? String(Math.round(each)) : String(Math.round(each * 10) / 10);
  return `${rounded} ${each === 1 ? 'view' : 'views'} each`;
}

function changeLine(site, range) {
  const delta = site.visitors - site.previousVisitors;
  const label = `previous ${range} days`;
  if (!site.visitors && !site.previousVisitors) return `Quiet, same as the ${label}`;
  if (!site.previousVisitors && site.visitors) return `First visits in this stretch`;
  if (delta > 0) return `${delta.toLocaleString('en-US')} more than the ${label}`;
  if (delta < 0) return `${Math.abs(delta).toLocaleString('en-US')} fewer than the ${label}`;
  return `Same number as the ${label}`;
}

function sparkline(site) {
  const series = site.series;
  const peak = Math.max(1, ...series.map((day) => day.visitors));
  const any = series.some((day) => day.visitors);
  if (!any) return '';
  const bars = series
    .map((day) => {
      const height = Math.round((day.visitors / peak) * 100);
      const described = `${shortDay(day.day)}: ${day.visitors} visitors, ${day.views} page views`;
      const style = height === 0 ? '' : ` style="height:${height}%"`;
      return `<li title="${escapeHtml(described)}"><span class="tick${height === 0 ? ' is-zero' : ''}"${style}></span></li>`;
    })
    .join('');
  return `<div class="spark" aria-hidden="true"><ol>${bars}</ol></div>`;
}

function sourceList(site) {
  if (!site.views || !site.referrers.length) return '';
  const items = site.referrers
    .map(([name, count]) => {
      const share = percent(count, site.views);
      return `<li>
        <span>${escapeHtml(name)}</span>
        <span class="count">${count.toLocaleString('en-US')}</span>
        <span class="track"><i style="width:${share}%"></i></span>
      </li>`;
    })
    .join('');
  return `<h3>Came from</h3><ul class="sources">${items}</ul>`;
}

function placeLine(site) {
  if (!site.views || !site.countries.length) return '';
  const places = site.countries
    .slice(0, 2)
    .map(([code, count]) => `${placeName(code)} ${percent(count, site.views)}%`);
  return places.join(' · ');
}

function deviceLine(site) {
  if (!site.views) return '';
  const totals = Object.fromEntries(site.devices);
  const parts = DEVICE_ORDER
    .map((name) => [name, totals[name] || 0])
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name} ${percent(count, site.views)}%`);
  return parts.join(' · ');
}

function pageLine(site) {
  const extra = site.paths.filter(([path]) => path && path !== '/');
  if (!extra.length) return '';
  const text = extra
    .map(([path, count]) => `${path} (${count.toLocaleString('en-US')})`)
    .join(', ');
  return `<p class="mix">Also opened ${escapeHtml(text)}</p>`;
}

function board(site, range) {
  if (!site.visitors && !site.allVisitors) {
    return `<article class="board ${site.id}">
      <header>
        <h2>${escapeHtml(site.label)}</h2>
        <p>${escapeHtml(site.host)}</p>
      </header>
      <p class="figure"><strong>0</strong> <span>visitors</span></p>
      <p class="sub">No visits yet.</p>
    </article>`;
  }
  const each = viewsEach(site.views, site.visitors);
  const detail = [placeLine(site), deviceLine(site)].filter(Boolean).join(' · ');
  const cameBack = site.returning
    ? `<li><span>Came back</span><strong>${site.returning.toLocaleString('en-US')}</strong></li>`
    : '';
  return `<article class="board ${site.id}">
    <header>
      <h2>${escapeHtml(site.label)}</h2>
      <p>${escapeHtml(site.host)}</p>
    </header>
    <p class="figure"><strong>${site.visitors.toLocaleString('en-US')}</strong> <span>${site.visitors === 1 ? 'visitor' : 'visitors'}</span></p>
    <p class="sub">${site.views.toLocaleString('en-US')} ${site.views === 1 ? 'page view' : 'page views'}${each ? ` · ${each}` : ''}</p>
    <ul class="facts">
      <li><span>Today</span><strong>${site.todayVisitors.toLocaleString('en-US')}</strong></li>
      ${cameBack}
      <li><span>All-time</span><strong>${site.allVisitors.toLocaleString('en-US')}</strong></li>
    </ul>
    <p class="delta">${escapeHtml(changeLine(site, range))}</p>
    ${sparkline(site)}
    ${sourceList(site)}
    ${detail ? `<p class="mix">${escapeHtml(detail)}</p>` : ''}
    ${pageLine(site)}
  </article>`;
}

function render(report) {
  const range = report.range;
  const updated = formatWhen(report.generatedAt);
  const ranges = RANGES.map((value) => {
    const current = value === range ? ' aria-current="page"' : '';
    const label = value === 7 ? '7 days' : value === 30 ? '30 days' : '90 days';
    return `<a href="?range=${value}"${current}>${label}</a>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet">
<meta name="referrer" content="no-referrer">
<title>Audience · Dr. Victoria Verlezza</title>
<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Fraunces:opsz,wght@9..144,500;9..144,650&display=swap" rel="stylesheet">
<style>
  :root {
    --paper:#FBF6EE; --paper-2:#F3EBDD; --ink:#1E1B18; --ink-2:#5A5249;
    --line:#DCD2C2; --coral:#E4572E; --sage:#1F5F5B;
    --font-display:"Fraunces", Georgia, serif;
    --font-body:"Atkinson Hyperlegible", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--paper); color: var(--ink); }
  body { font-family: var(--font-body); line-height: 1.45; padding: 1.4rem 1.1rem 2.5rem; }
  main { max-width: 880px; margin: 0 auto; }
  a { color: inherit; }
  .brand {
    display: inline-flex; align-items: center; gap: .4rem;
    font-family: var(--font-display); font-style: italic; font-weight: 500;
    text-decoration: none; font-size: 1.02rem;
  }
  .brand img { width: 1.45rem; height: 1.45rem; object-fit: contain; }
  .brand small { font-weight: 400; opacity: .72; margin-right: .08em; }
  header.top { display: flex; justify-content: space-between; gap: 1rem; align-items: center; }
  .lock { margin: 0; font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--sage); font-weight: 700; }
  .intro { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-end; margin: 1.3rem 0 1rem; }
  h1 {
    font-family: var(--font-display); font-weight: 650; font-size: clamp(2rem, 5vw, 2.7rem);
    line-height: .95; letter-spacing: -.03em; margin: 0;
  }
  .lede { margin: .35rem 0 0; color: var(--ink-2); }
  .ranges { display: flex; flex-wrap: wrap; gap: .4rem; }
  .ranges a {
    text-decoration: none; border: 1.5px solid var(--ink); border-radius: 999px;
    padding: .35rem .8rem; font-weight: 700; font-size: .9rem;
  }
  .ranges a[aria-current="page"] { background: var(--ink); color: var(--paper); }
  .boards { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
  .board {
    background: #fffdf8; border: 1px solid var(--line); border-radius: 16px;
    padding: 1rem 1rem 1.05rem; border-top: 4px solid var(--sage);
  }
  .board.assessment { border-top-color: var(--coral); }
  .board header h2 { margin: 0; font-family: var(--font-display); font-size: 1.35rem; font-weight: 650; }
  .board header p { margin: .1rem 0 0; color: var(--ink-2); font-size: .88rem; }
  .figure { margin: .85rem 0 0; }
  .figure strong {
    font-family: var(--font-display); font-size: 3rem; font-weight: 650;
    letter-spacing: -.04em; line-height: .9;
  }
  .figure span { color: var(--ink-2); font-size: 1rem; }
  .sub, .delta, .mix { margin: .35rem 0 0; color: var(--ink-2); }
  .facts { list-style: none; display: flex; gap: .8rem; margin: .85rem 0 0; padding: 0; }
  .facts li { min-width: 4.5rem; }
  .facts span { display: block; color: var(--ink-2); font-size: .75rem; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; }
  .facts strong { font-family: var(--font-display); font-size: 1.35rem; font-weight: 650; }
  .spark { margin-top: .9rem; }
  .spark ol { list-style: none; display: flex; align-items: flex-end; gap: 3px; height: 46px; margin: 0; padding: 0; }
  .spark li { flex: 1; height: 100%; display: flex; align-items: flex-end; }
  .spark .tick { display: block; width: 100%; height: 0; border-radius: 3px 3px 1px 1px; background: var(--sage); }
  .board.assessment .spark .tick { background: var(--coral); }
  .spark .tick.is-zero { height: 2px; opacity: .35; }
  .board h3 { margin: .95rem 0 .4rem; font-size: .75rem; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-2); }
  .sources { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
  .sources li { display: grid; grid-template-columns: 1fr auto; gap: .15rem .6rem; align-items: center; font-size: .95rem; }
  .sources .count { color: var(--ink-2); }
  .track { grid-column: 1 / -1; height: 5px; background: var(--paper-2); border-radius: 99px; overflow: hidden; }
  .track i { display: block; height: 100%; background: var(--sage); }
  .board.assessment .track i { background: var(--coral); }
  .foot { margin: 1rem 0 0; color: var(--ink-2); font-size: .88rem; max-width: 40rem; }
  @media (max-width: 760px) {
    .intro, .boards { display: grid; grid-template-columns: 1fr; }
    .figure strong { font-size: 2.6rem; }
  }
</style>
</head>
<body>
<main>
  <header class="top">
    <a class="brand" href="https://www.victoriaverlezza.com/" rel="noreferrer"><img src="/photos/logo-mark-light-nav.png" alt="" width="256" height="256"><span><small>Dr.</small> Victoria</span></a>
    <p class="lock">Private</p>
  </header>
  <div class="intro">
    <div>
      <h1>Audience</h1>
      <p class="lede">Last ${range} days${updated ? ` · updated ${escapeHtml(updated)} ET` : ''}</p>
    </div>
    <nav class="ranges" aria-label="Date range">${ranges}</nav>
  </div>
  <section class="boards" aria-label="Sites">
    ${board(report.sites.website, range)}
    ${board(report.sites.assessment, range)}
  </section>
  <p class="foot">Times are US Eastern. Someone who opens both sites counts on each. A refresh within 30 seconds does not count again. Bots, link previews, and the assessment admin are left out.</p>
</main>
</body>
</html>`;
}

function messagePage(title, text) {
  const safeTitle = escapeHtml(title);
  const safeText = escapeHtml(text);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${safeTitle}</title>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF6EE;color:#1E1B18;font-family:Georgia,serif;padding:2rem">
<main style="max-width:28rem"><h1 style="font-weight:500">${safeTitle}</h1><p>${safeText}</p></main>
</body>
</html>`;
}

function sendHtml(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.status(status).send(html);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.status(405).end();
  }

  const token = req.query && typeof req.query.token === 'string' ? req.query.token : '';
  if (!tokenMatches(token)) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(404).send('Not found');
  }

  if (!analyticsReady()) {
    return sendHtml(res, 503, messagePage('Audience', 'Visitor tracking is not connected yet.'));
  }

  try {
    const report = await loadReport(normalizeRange(req.query && req.query.range));
    const html = render(report);
    if (req.method === 'HEAD') {
      sendHtml(res, 200, '');
      return;
    }
    return sendHtml(res, 200, html);
  } catch (err) {
    console.error('Audience report failed', err && err.code ? err.code : 'error');
    return sendHtml(res, 500, messagePage('Audience', 'The visitor summary could not be loaded. Refresh this page in a moment.'));
  }
};
