const AnalyticsEvent = require('../models/AnalyticsEvent');
const { buildRequestContext, getPathname, isAnalyticsOptedOut } = require('../services/analyticsContext');

function looksLikeHtmlNavigation(req) {
  const accept = (req.get('accept') || '').toLowerCase();
  return accept.includes('text/html') || accept.includes('*/*');
}

function shouldTrackPath(pathname) {
  if (!pathname || pathname === '/favicon.ico') return false;
  if (pathname.startsWith('/admin')) return false;
  if (pathname.startsWith('/analytics/')) return false;

  // Ignore obvious asset-like paths in case middleware order changes.
  if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|xml|txt|map|woff2?)$/i.test(pathname)) {
    return false;
  }

  return true;
}

function analyticsPageviews(req, res, next) {
  const pathname = getPathname(req.originalUrl || req.url || '/');

  res.on('finish', () => {
    if (req.method !== 'GET') return;
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    if (!looksLikeHtmlNavigation(req)) return;
    if (!shouldTrackPath(pathname)) return;
    if (isAnalyticsOptedOut(req)) return;

    const context = buildRequestContext(req, res, pathname);
    AnalyticsEvent.createPageview(context);
  });

  next();
}

module.exports = analyticsPageviews;
