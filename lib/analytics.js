const crypto = require('crypto');

const KEEP_DAYS = 400;
const DEDUPE_MS = 30 * 1000;
const MAX_VIEWS_PER_VISITOR_PER_DAY = 40;
const STATS_PATH = 'audience/stats.json';
const RANGES = [7, 30, 90];
const SITE_HOSTS = {
  'victoriaverlezza.com': 'website',
  'www.victoriaverlezza.com': 'website',
  'assessment.victoriaverlezza.com': 'assessment',
};
const SITE_META = {
  website: { label: 'Website', host: 'victoriaverlezza.com' },
  assessment: { label: 'Assessment', host: 'assessment.victoriaverlezza.com' },
};

const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternal|whatsapp|telegrambot|slackbot|discord|embedly|quora|pinterest|linkedinbot|vkshare|wget|curl|python-requests|headless|lighthouse|pagespeed|gtmetrix|pingdom|semrush|ahrefs|petalbot|bytespider|gptbot|claudebot|amazonbot/i;

function analyticsReady() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.STATS_ACCESS_TOKEN);
}

function formatNY(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftDay(day, delta) {
  const [year, month, date] = String(day).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta, 17, 0, 0));
  return formatNY(shifted);
}

function rangeDays(count, today = formatNY(new Date())) {
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) days.push(shiftDay(today, -i));
  return days;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function tokenMatches(provided) {
  const expected = process.env.STATS_ACCESS_TOKEN || '';
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

function hostFromHeader(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function originAllowed(host) {
  if (SITE_HOSTS[host]) return true;
  if (process.env.VERCEL_ENV === 'production') return false;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app');
}

function siteForHost(host) {
  if (SITE_HOSTS[host]) return SITE_HOSTS[host];
  if (process.env.VERCEL_ENV === 'production') return '';
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return 'website';
  return '';
}

function isBot(userAgent, purpose) {
  const ua = String(userAgent || '');
  const why = String(purpose || '');
  if (!ua || BOT_UA.test(ua)) return true;
  return /prefetch|preview/i.test(why);
}

function cleanPath(value) {
  const path = String(value || '/').split('?')[0].split('#')[0];
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) return '/';
  const cleaned = path.replace(/[^\w\-./~]/g, '').slice(0, 120);
  return cleaned || '/';
}

function referrerLabel(raw, site) {
  if (!raw) return 'Direct';
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
    const self = site === 'assessment' ? 'assessment.victoriaverlezza.com' : 'victoriaverlezza.com';
    if (!host || host === self) return 'Direct';
    return host.slice(0, 80);
  } catch {
    return 'Direct';
  }
}

function deviceClass(width, userAgent) {
  const pixels = Number(width);
  if (Number.isFinite(pixels) && pixels > 0) {
    if (pixels < 700) return 'Mobile';
    if (pixels < 1100) return 'Tablet';
    return 'Desktop';
  }
  const ua = String(userAgent || '');
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function countryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'Unknown';
}

function visitorHash(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 32);
}

function mergeCounts(hashes) {
  const totals = {};
  hashes.forEach((hash) => {
    Object.entries(hash).forEach(([key, count]) => {
      totals[key] = (totals[key] || 0) + count;
    });
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function topCounts(entries, limit) {
  if (entries.length <= limit) return entries;
  const head = entries.slice(0, limit);
  const rest = entries.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  if (rest > 0) head.push(['Other', rest]);
  return head;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function placeName(code) {
  if (!code || code === 'Unknown') return 'Unknown';
  if (code === 'Other') return 'Other';
  try {
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

function shortDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, date, 17, 0, 0)));
}

function longDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, date, 17, 0, 0)));
}

function normalizeRange(value) {
  const range = Number(value);
  return RANGES.includes(range) ? range : 30;
}

function emptyBucket() {
  return {
    views: 0,
    visitors: {},
    referrers: {},
    countries: {},
    devices: {},
    paths: {},
    recent: {},
    counts: {},
  };
}

function emptyState() {
  return {
    since: '',
    allViews: { website: 0, assessment: 0 },
    allVisitors: { website: {}, assessment: {} },
    days: {},
  };
}

function copyBucket(source) {
  const bucket = emptyBucket();
  if (!source || typeof source !== 'object') return bucket;
  bucket.views = Number(source.views) || 0;
  ['visitors', 'referrers', 'countries', 'devices', 'paths', 'recent', 'counts'].forEach((key) => {
    if (source[key] && typeof source[key] === 'object') bucket[key] = source[key];
  });
  return bucket;
}

function hasBucket(value) {
  return Boolean(value && typeof value === 'object' && ('views' in value || 'visitors' in value || 'referrers' in value));
}

function normalizeDay(bucket) {
  const day = { website: emptyBucket(), assessment: emptyBucket() };
  if (!bucket || typeof bucket !== 'object') return day;
  if (hasBucket(bucket.website) || hasBucket(bucket.assessment)) {
    day.website = copyBucket(bucket.website);
    day.assessment = copyBucket(bucket.assessment);
    return day;
  }
  day.website = copyBucket(bucket);
  return day;
}

function normalizeVisitors(value) {
  const visitors = { website: {}, assessment: {} };
  if (!value || typeof value !== 'object') return visitors;
  if (value.website && typeof value.website === 'object') {
    visitors.website = value.website;
    visitors.assessment = value.assessment && typeof value.assessment === 'object' ? value.assessment : {};
    return visitors;
  }
  visitors.website = value;
  return visitors;
}

function normalizeViews(value) {
  if (value && typeof value === 'object') {
    return {
      website: Number(value.website) || 0,
      assessment: Number(value.assessment) || 0,
    };
  }
  return { website: Number(value) || 0, assessment: 0 };
}

function normalizeStoredState(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const days = {};
  const rawDays = source.days && typeof source.days === 'object' ? source.days : {};
  Object.keys(rawDays).forEach((day) => {
    days[day] = normalizeDay(rawDays[day]);
  });
  return {
    since: typeof source.since === 'string' ? source.since : '',
    allViews: normalizeViews(source.allViews),
    allVisitors: normalizeVisitors(source.allVisitors),
    days,
  };
}

function bump(map, key) {
  const name = String(key || 'Unknown').slice(0, 80);
  map[name] = (Number(map[name]) || 0) + 1;
}

function recordInto(state, event, now) {
  const site = event.site === 'assessment' ? 'assessment' : 'website';
  const normalized = normalizeStoredState(state);
  const day = formatNY(new Date(now));
  const hash = visitorHash(event.visitorId);
  const existing = normalized.days[day] && normalized.days[day][site];
  if (existing) {
    const last = Number(existing.recent && existing.recent[hash]) || 0;
    if (now - last < DEDUPE_MS) return null;
    if ((Number(existing.counts && existing.counts[hash]) || 0) >= MAX_VIEWS_PER_VISITOR_PER_DAY) {
      return null;
    }
  }

  const next = structuredClone(normalized);
  const dayBucket = next.days[day] || { website: emptyBucket(), assessment: emptyBucket() };
  if (!dayBucket.website) dayBucket.website = emptyBucket();
  if (!dayBucket.assessment) dayBucket.assessment = emptyBucket();
  const bucket = dayBucket[site];
  bucket.recent[hash] = now;
  bucket.counts[hash] = (Number(bucket.counts[hash]) || 0) + 1;
  bucket.views += 1;
  bucket.visitors[hash] = 1;
  bump(bucket.referrers, event.referrer);
  bump(bucket.countries, event.country);
  bump(bucket.devices, event.device);
  bump(bucket.paths, event.path);
  Object.keys(bucket.recent).forEach((key) => {
    if (now - Number(bucket.recent[key]) > DEDUPE_MS) delete bucket.recent[key];
  });
  next.days[day] = dayBucket;
  next.allViews[site] += 1;
  next.allVisitors[site][hash] = 1;
  if (!next.since) next.since = day;

  const cutoff = shiftDay(day, -KEEP_DAYS);
  Object.keys(next.days).forEach((key) => {
    if (key < cutoff) delete next.days[key];
  });
  return next;
}

function bucketFor(state, site, day) {
  return (state.days[day] && state.days[day][site]) || null;
}

function periodSnapshot(state, site, days) {
  let views = 0;
  const visitsByPerson = {};
  days.forEach((day) => {
    const bucket = bucketFor(state, site, day);
    if (!bucket) return;
    views += Number(bucket.views) || 0;
    Object.keys(bucket.visitors || {}).forEach((id) => {
      visitsByPerson[id] = (visitsByPerson[id] || 0) + 1;
    });
  });
  const visitors = Object.keys(visitsByPerson).length;
  const returning = Object.values(visitsByPerson).filter((count) => count > 1).length;
  return { views, visitors, returning };
}

function reportSite(state, site, days, today) {
  const series = days.map((day) => {
    const bucket = bucketFor(state, site, day);
    return {
      day,
      views: bucket ? Number(bucket.views) || 0 : 0,
      visitors: bucket && bucket.visitors ? Object.keys(bucket.visitors).length : 0,
      referrers: (bucket && bucket.referrers) || {},
      countries: (bucket && bucket.countries) || {},
      devices: (bucket && bucket.devices) || {},
      paths: (bucket && bucket.paths) || {},
    };
  });
  const current = periodSnapshot(state, site, days);
  const todayRow = series.find((day) => day.day === today) || { visitors: 0, views: 0 };
  return {
    id: site,
    label: SITE_META[site].label,
    host: SITE_META[site].host,
    visitors: current.visitors,
    views: current.views,
    returning: current.returning,
    todayVisitors: todayRow.visitors,
    todayViews: todayRow.views,
    allVisitors: Object.keys((state.allVisitors && state.allVisitors[site]) || {}).length,
    allViews: Number(state.allViews && state.allViews[site]) || 0,
    series: series.map(({ day, views, visitors }) => ({ day, views, visitors })),
    referrers: topCounts(mergeCounts(series.map((day) => day.referrers)), 3),
    countries: topCounts(mergeCounts(series.map((day) => day.countries)), 3),
    devices: mergeCounts(series.map((day) => day.devices)),
    paths: topCounts(mergeCounts(series.map((day) => day.paths)), 3),
  };
}

function reportFromState(state, range, now = new Date()) {
  const normalized = normalizeStoredState(state);
  const daysCount = normalizeRange(range);
  const today = formatNY(now);
  const days = rangeDays(daysCount, today);
  const previousDays = rangeDays(daysCount, shiftDay(today, -daysCount));
  const since = /^\d{4}-\d{2}-\d{2}$/.test(normalized.since) ? normalized.since : '';
  const sites = {
    website: reportSite(normalized, 'website', days, today),
    assessment: reportSite(normalized, 'assessment', days, today),
  };
  Object.keys(sites).forEach((site) => {
    const previous = periodSnapshot(normalized, site, previousDays);
    sites[site].previousVisitors = previous.visitors;
    sites[site].previousViews = previous.views;
  });
  return {
    range: daysCount,
    generatedAt: new Date(now).toISOString(),
    today,
    since,
    sites,
  };
}

function storageError(message) {
  const err = new Error(message);
  err.code = 'NOT_CONFIGURED';
  return err;
}

function isConflict(err) {
  const name = err && err.name;
  const status = err && (err.statusCode || err.status);
  if (name === 'BlobPreconditionFailedError' || name === 'BlobAlreadyExistsError') return true;
  if (status === 409 || status === 412) return true;
  return /precondition|already exists|conditional/i.test(String(err && err.message));
}

async function readStats() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw storageError('Visitor storage is not configured.');
  const { get } = require('@vercel/blob');
  const result = await get(STATS_PATH, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return { state: emptyState(), etag: '' };
  const text = await new Response(result.stream).text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.days) {
    throw new Error('Visitor storage could not be read.');
  }
  return {
    state: normalizeStoredState(parsed),
    etag: result.blob && result.blob.etag ? result.blob.etag : '',
  };
}

function matchEtag(etag) {
  // Reads come back as a weak tag (W/"…"). If-Match only accepts the strong form, so a weak tag never matches and every later visit is dropped.
  return String(etag || '').replace(/^W\//, '');
}

async function writeStats(state, etag) {
  const { put } = require('@vercel/blob');
  const body = JSON.stringify(state);
  const match = matchEtag(etag);
  const options = {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
    allowOverwrite: Boolean(match),
  };
  if (match) options.ifMatch = match;
  await put(STATS_PATH, body, options);
}

async function recordVisit(event) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readStats();
    const next = recordInto(current.state, event, Date.now());
    if (!next) return { counted: false };
    try {
      await writeStats(next, current.etag);
      return { counted: true };
    } catch (err) {
      lastError = err;
      if (!isConflict(err)) throw err;
    }
  }
  throw lastError || new Error('Visitor storage could not be updated.');
}

async function loadReport(range) {
  const { state } = await readStats();
  return reportFromState(state, range, new Date());
}

module.exports = {
  RANGES,
  analyticsReady,
  cleanPath,
  countryCode,
  deviceClass,
  emptyState,
  escapeHtml,
  formatNY,
  hostFromHeader,
  isBot,
  loadReport,
  longDay,
  mergeCounts,
  normalizeRange,
  originAllowed,
  placeName,
  siteForHost,
  recordInto,
  recordVisit,
  referrerLabel,
  reportFromState,
  safeEqual,
  shiftDay,
  shortDay,
  tokenMatches,
  visitorHash,
};
