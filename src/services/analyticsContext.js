const crypto = require('crypto');

const SESSION_WINDOW_MS = 30 * 60 * 1000;

function normalizeIp(ip) {
  if (!ip) return '';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function getPathname(rawPath) {
  if (!rawPath) return '/';
  const path = String(rawPath).split('?')[0].trim();
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function getReferrerHost(req) {
  const header = (req.get('referer') || req.get('referrer') || '').trim();
  if (!header) return '';
  try {
    return new URL(header).hostname.toLowerCase();
  } catch (_error) {
    return '';
  }
}

function getUtmParams(req) {
  return {
    utm_source: (req.query.utm_source || '').trim().slice(0, 120),
    utm_medium: (req.query.utm_medium || '').trim().slice(0, 120),
    utm_campaign: (req.query.utm_campaign || '').trim().slice(0, 180)
  };
}

function getDeviceType(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/ipad|tablet|kindle|playbook/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function hashToken(value) {
  const salt = process.env.ANALYTICS_SALT || 'adrienne-site-analytics';
  return crypto
    .createHash('sha256')
    .update(`${salt}|${value}`)
    .digest('hex')
    .slice(0, 24);
}

function getSource(req, referrerHost, utmSource) {
  if (utmSource) return utmSource.toLowerCase();
  if (!referrerHost) return 'direct';

  const host = (req.get('host') || '').toLowerCase();
  if (host && referrerHost === host) return 'internal';
  return referrerHost;
}

function buildRequestContext(req, rawPath) {
  const path = getPathname(rawPath || req.originalUrl || req.url || '/');
  const userAgent = (req.get('user-agent') || '').slice(0, 800);
  const ip = normalizeIp(req.ip || '');
  const visitorSeed = `${ip}|${userAgent}`;
  const visitorId = hashToken(visitorSeed || 'anonymous');
  const sessionBucket = Math.floor(Date.now() / SESSION_WINDOW_MS);
  const sessionId = hashToken(`${visitorId}|${sessionBucket}`);
  const referrerHost = getReferrerHost(req);
  const utm = getUtmParams(req);

  return {
    path,
    visitorId,
    sessionId,
    deviceType: getDeviceType(userAgent),
    referrerHost,
    source: getSource(req, referrerHost, utm.utm_source),
    userAgent,
    ...utm
  };
}

module.exports = {
  buildRequestContext,
  getPathname
};
