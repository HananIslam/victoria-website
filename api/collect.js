const {
  cleanPath,
  countryCode,
  deviceClass,
  hostFromHeader,
  isBot,
  originAllowed,
  recordVisit,
  referrerLabel,
  siteForHost,
} = require('../lib/analytics');

function parsePayload(raw) {
  if (Buffer.isBuffer(raw)) return parsePayload(raw.toString('utf8'));
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 2000) return null;
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(text);
  const visitorId = params.get('v');
  if (!visitorId) return null;
  return {
    v: visitorId,
    p: params.get('p') || '/',
    r: params.get('r') || '',
    w: params.get('w') || 0,
  };
}

async function readBody(req) {
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string' || (req.body && typeof req.body === 'object')) {
    return req.body;
  }
  if (!req || typeof req.on !== 'function') return '';
  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  } catch {
    return '';
  }
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
}

function applyCors(req, res, host) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!origin || !originAllowed(host)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  const originHost = hostFromHeader(req.headers.origin || '');
  const refererHost = hostFromHeader(req.headers.referer || req.headers.referrer || '');
  const host = originHost || refererHost;
  applyCors(req, res, originHost || host);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!originAllowed(host)) return res.status(204).end();

  const site = siteForHost(host);
  if (!site) return res.status(204).end();

  const purpose = req.headers['sec-purpose'] || req.headers.purpose || req.headers['x-purpose'] || '';
  if (isBot(req.headers['user-agent'], purpose)) return res.status(204).end();

  const body = parsePayload(await readBody(req));
  const visitorId = body && typeof body.v === 'string' ? body.v : '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(visitorId)) return res.status(204).end();

  const path = cleanPath(body.p);
  if (
    path.startsWith('/audience') ||
    path.startsWith('/api') ||
    path === '/dashboard' ||
    path.startsWith('/dashboard/')
  ) {
    return res.status(204).end();
  }

  try {
    await recordVisit({
      site,
      visitorId,
      path,
      referrer: referrerLabel(typeof body.r === 'string' ? body.r : '', site),
      country: countryCode(req.headers['x-vercel-ip-country']),
      device: deviceClass(body.w, req.headers['user-agent']),
    });
  } catch (err) {
    console.error('Visit was not recorded', err && err.code ? err.code : 'error');
  }

  return res.status(204).end();
};
