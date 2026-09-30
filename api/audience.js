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

function flagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const points = [...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65);
  return String.fromCodePoint(...points);
}

function showDay(index, count) {
  if (count <= 7) return true;
  const step = count <= 30 ? 5 : 15;
  return index % step === 0 || index === count - 1;
}

function totals(site) {
  const views = `${site.views.toLocaleString('en-US')} ${site.views === 1 ? 'page view' : 'page views'}`;
  return `<article class="total ${site.id}">
    <h2>${escapeHtml(site.label)}</h2>
    <p class="num">${site.visitors.toLocaleString('en-US')}</p>
    <p class="meta">${views} · today ${site.todayVisitors.toLocaleString('en-US')} · all-time ${site.allVisitors.toLocaleString('en-US')}</p>
  </article>`;
}

function dailyChart(report) {
  const website = report.sites.website.series;
  const assessment = report.sites.assessment.series;
  const any = website.some((day) => day.visitors) || assessment.some((day) => day.visitors);
  if (!any) return '<p class="empty">No visits in this period.</p>';
  const peak = Math.max(1, ...website.map((day) => day.visitors), ...assessment.map((day) => day.visitors));
  const columns = website
    .map((day, index) => {
      const other = assessment[index];
      const websiteHeight = Math.round((day.visitors / peak) * 100);
      const assessmentHeight = Math.round((other.visitors / peak) * 100);
      const dayLabel = showDay(index, website.length) ? escapeHtml(shortDay(day.day)) : '';
      const tip = `${shortDay(day.day)} — website ${day.visitors}, assessment ${other.visitors}`;
      return `<li title="${escapeHtml(tip)}">
        <span class="cols">
          <i class="website${websiteHeight ? '' : ' is-zero'}" style="height:${websiteHeight}%"></i>
          <i class="assessment${assessmentHeight ? '' : ' is-zero'}" style="height:${assessmentHeight}%"></i>
        </span>
        <span class="day">${dayLabel}</span>
      </li>`;
    })
    .join('');
  return `<p class="legend"><span><i class="website"></i>Website</span><span><i class="assessment"></i>Assessment</span></p>
    <div class="chart-scroll"><ol class="chart chart-${website.length}">${columns}</ol></div>`;
}

function barRows(entries, total, labelFor, tone) {
  return `<ul class="bars ${tone}">${entries
    .map(([key, count]) => {
      const share = Math.max(percent(count, total), count ? 4 : 0);
      return `<li>
        <span class="name">${labelFor(key)}</span>
        <span class="track"><i style="width:${share}%"></i></span>
        <span class="n">${count.toLocaleString('en-US')}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

function countryName(code) {
  const flag = flagEmoji(code);
  const name = escapeHtml(placeName(code));
  return flag ? `<span class="flag" aria-hidden="true">${flag}</span>${name}` : name;
}

function sectionFor(report, title, pick) {
  const blocks = ['website', 'assessment']
    .map((id) => {
      const site = report.sites[id];
      const entries = pick(site).filter(([, count]) => count > 0);
      if (!site.views || !entries.length) return '';
      return `<div class="block"><h3>${escapeHtml(site.label)}</h3>${barRows(entries, site.views, (key) => escapeHtml(key), site.id)}</div>`;
    })
    .filter(Boolean);
  if (!blocks.length) return '';
  return `<section class="panel"><h2>${title}</h2><div class="blocks blocks-${blocks.length}">${blocks.join('')}</div></section>`;
}

function countries(report) {
  const blocks = ['website', 'assessment']
    .map((id) => {
      const site = report.sites[id];
      if (!site.views || !site.countries.length) return '';
      return `<div class="block"><h3>${escapeHtml(site.label)}</h3>${barRows(site.countries, site.views, countryName, site.id)}</div>`;
    })
    .filter(Boolean);
  if (!blocks.length) return '';
  return `<section class="panel"><h2>Countries</h2><div class="blocks blocks-${blocks.length}">${blocks.join('')}</div></section>`;
}

function devices(site) {
  const totalsByName = Object.fromEntries(site.devices);
  return DEVICE_ORDER.map((name) => [name, totalsByName[name] || 0]).filter(([, count]) => count > 0);
}

function render(report) {
  const range = report.range;
  const ranges = RANGES.map((value) => {
    const current = value === range ? ' aria-current="page"' : '';
    const label = value === 7 ? '7 days' : value === 30 ? '30 days' : '90 days';
    return `<a href="?range=${value}"${current}>${label}</a>`;
  }).join('');
  const sources = sectionFor(report, 'Came from', (site) => site.referrers);
  const deviceSection = sectionFor(report, 'Devices', devices);

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
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Fraunces:opsz,wght@9..144,560;9..144,650&display=swap" rel="stylesheet">
<style>
  :root {
    --paper:#FBF6EE; --paper-2:#F3EBDD; --ink:#1E1B18; --ink-2:#5A5249;
    --line:#DCD2C2; --coral:#E4572E; --sage:#1F5F5B;
    --font-display:"Fraunces", Georgia, serif;
    --font-body:"Atkinson Hyperlegible", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--font-body); line-height: 1.4; padding: 1.25rem 1rem 2.5rem; }
  main { max-width: 860px; margin: 0 auto; }
  a { color: inherit; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .brand { display: inline-flex; align-items: center; gap: .4rem; font-family: var(--font-display); font-style: italic; text-decoration: none; font-size: 1.05rem; }
  .brand img { width: 1.4rem; height: 1.4rem; }
  .brand small { opacity: .7; margin-right: .08em; }
  h1 { font-family: var(--font-display); font-weight: 650; font-size: 2.4rem; letter-spacing: -.03em; margin: 1.1rem 0 .8rem; }
  .ranges { display: flex; gap: .4rem; margin: 0 0 1rem; }
  .ranges a { text-decoration: none; border: 1.5px solid var(--ink); border-radius: 999px; padding: .32rem .75rem; font-weight: 700; }
  .ranges a[aria-current="page"] { background: var(--ink); color: var(--paper); }
  .totals { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
  .total { background: #fffdf8; border: 1px solid var(--line); border-radius: 16px; padding: .9rem 1rem 1rem; }
  .total h2 { margin: 0; font-size: .95rem; font-weight: 700; }
  .total.website h2 { color: var(--sage); }
  .total.assessment h2 { color: var(--coral); }
  .num { font-family: var(--font-display); font-size: 3.4rem; line-height: .9; font-weight: 650; margin: .25rem 0 .3rem; letter-spacing: -.04em; }
  .meta, .who, .empty { color: var(--ink-2); margin: 0; }
  .panel { margin-top: .85rem; background: #fffdf8; border: 1px solid var(--line); border-radius: 16px; padding: 1rem; }
  .panel h2 { margin: 0 0 .8rem; font-size: 1rem; }
  .block h3 { margin: 0 0 .55rem; font-size: .82rem; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
  .legend { display: flex; gap: 1rem; margin: 0 0 .6rem; font-size: .92rem; }
  .legend i { display: inline-block; width: .7rem; height: .7rem; border-radius: 2px; margin-right: .35rem; vertical-align: -1px; }
  .legend .website, .bars.website .track i { background: var(--sage); }
  .legend .assessment, .bars.assessment .track i { background: var(--coral); }
  .chart-scroll { overflow-x: auto; }
  .chart { list-style: none; display: flex; align-items: flex-end; gap: 6px; height: 210px; margin: 0; padding: 0 0 1.35rem; }
  .chart-90 { min-width: 720px; }
  .chart li { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; position: relative; min-width: 0; }
  .cols { display: flex; align-items: flex-end; justify-content: center; gap: 3px; height: 100%; }
  .cols i { display: block; width: 42%; max-width: 18px; border-radius: 5px 5px 2px 2px; }
  .cols i.website { background: var(--sage); }
  .cols i.assessment { background: var(--coral); }
  .cols i.is-zero { height: 2px !important; opacity: .3; }
  .day { position: absolute; left: 50%; bottom: -1.2rem; transform: translateX(-50%); font-size: .72rem; color: var(--ink-2); white-space: nowrap; }
  .blocks { display: grid; gap: 1rem; }
  .blocks-2 { grid-template-columns: 1fr 1fr; }
  .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: .55rem; }
  .bars li { display: grid; grid-template-columns: minmax(7rem, 1fr) 1.4fr auto; gap: .45rem .6rem; align-items: center; }
  .name { display: flex; align-items: center; gap: .4rem; min-width: 0; }
  .flag { font-size: 1.15rem; line-height: 1; }
  .track { height: 10px; background: var(--paper-2); border-radius: 99px; overflow: hidden; }
  .track i { display: block; height: 100%; border-radius: inherit; }
  .n { color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .who { margin-top: .35rem; font-size: .82rem; }
  @media (max-width: 700px) {
    .totals, .blocks-2, .bars li { grid-template-columns: 1fr; }
    .num { font-size: 2.8rem; }
    .track { grid-column: 1; }
  }
</style>
</head>
<body>
<main>
  <header class="top">
    <a class="brand" href="https://www.victoriaverlezza.com/" rel="noreferrer"><img src="/photos/logo-mark-light-nav.png" alt="" width="256" height="256"><span><small>Dr.</small> Victoria</span></a>
  </header>
  <h1>Audience</h1>
  <nav class="ranges" aria-label="Date range">${ranges}</nav>
  <section class="totals" aria-label="Visitors">
    ${totals(report.sites.website)}
    ${totals(report.sites.assessment)}
  </section>
  <section class="panel">
    <h2>Visitors per day</h2>
    ${dailyChart(report)}
  </section>
  ${countries(report)}
  ${sources}
  ${deviceSection}
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
