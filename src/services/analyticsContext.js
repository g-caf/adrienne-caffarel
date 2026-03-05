const crypto = require('crypto');

const SESSION_WINDOW_MS = 30 * 60 * 1000;
const VISITOR_COOKIE = 'analytics_vid';
const SESSION_COOKIE = 'analytics_sid';
const OPTOUT_COOKIE = 'analytics_opt_out';

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

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((acc, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) return acc;
      const name = cookie.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
      acc[name] = value;
      return acc;
    }, {});
}

function appendSetCookieHeader(res, cookieValue) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookieValue]);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieValue]);
    return;
  }
  res.setHeader('Set-Cookie', [existing, cookieValue]);
}

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function setCookie(res, name, value, maxAgeSeconds) {
  if (!res || res.headersSent) return;
  const cookieParts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSeconds}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure');
  }
  appendSetCookieHeader(res, cookieParts.join('; '));
}

function getTrackingIdentity(req, res) {
  const cookies = parseCookies(req);

  const existingVisitor = (cookies[VISITOR_COOKIE] || '').trim();
  const existingSession = (cookies[SESSION_COOKIE] || '').trim();
  const nowBucket = Math.floor(Date.now() / SESSION_WINDOW_MS);

  const visitorId = existingVisitor || randomToken();
  const sessionId = existingSession || hashToken(`${visitorId}|${nowBucket}|${randomToken()}`);

  if (!existingVisitor) {
    setCookie(res, VISITOR_COOKIE, visitorId, 60 * 60 * 24 * 365);
  }
  // Rolling 30-minute session window.
  setCookie(res, SESSION_COOKIE, sessionId, 60 * 30);

  return { visitorId, sessionId };
}

function isAnalyticsOptedOut(req) {
  const cookies = parseCookies(req);
  return cookies[OPTOUT_COOKIE] === '1';
}

function buildRequestContext(req, res, rawPath) {
  const path = getPathname(rawPath || req.originalUrl || req.url || '/');
  const userAgent = (req.get('user-agent') || '').slice(0, 800);
  const ip = normalizeIp(req.ip || '');
  const identity = getTrackingIdentity(req, res);
  const referrerHost = getReferrerHost(req);
  const utm = getUtmParams(req);

  return {
    path,
    visitorId: identity.visitorId,
    sessionId: identity.sessionId,
    deviceType: getDeviceType(userAgent),
    referrerHost,
    source: getSource(req, referrerHost, utm.utm_source),
    userAgent,
    metadata: {
      ip_hash: hashToken(ip || 'unknown')
    },
    ...utm
  };
}

module.exports = {
  buildRequestContext,
  getPathname,
  isAnalyticsOptedOut,
  setCookie,
  OPTOUT_COOKIE
};
