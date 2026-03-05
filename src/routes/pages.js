const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Parser = require('rss-parser');
const MarkdownIt = require('markdown-it');
const LibraryItem = require('../models/LibraryItem');
const WritingEntry = require('../models/WritingEntry');
const WritingSubmission = require('../models/WritingSubmission');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const { ensureLibrarySynced, getLibrarySyncStatus } = require('../services/librarySync');
const { buildRequestContext } = require('../services/analyticsContext');

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail', { keepArray: true }],
      ['media:group', 'media:group', { keepArray: true }],
      ['content:encoded', 'content:encoded']
    ]
  }
});
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

const ADMIN_AUTH_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_AUTH_MAX_ATTEMPTS = 10;
const adminAuthAttempts = new Map();
const WRITING_PREVIEW_COOKIE = 'writing_preview_started_at';

// Curated RSS feeds for the personal site
const rssFeeds = [
  { url: 'https://techcrunch.com/feed/' },
  { url: 'https://hnrss.org/frontpage' },
  { url: 'https://www.theverge.com/rss/index.xml' },
  { url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { url: 'https://www.wired.com/feed/rss' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { url: 'https://www.theatlantic.com/feed/all/' },
  { url: 'https://www.newyorker.com/feed/everything' },
  {
    url: 'https://news.google.com/rss/search?q=site%3Areuters.com&hl=en-US&gl=US&ceid=US%3Aen',
    label: 'Reuters'
  }
];

const TOPIC_DEFINITIONS = [
  {
    slug: 'iran-news',
    title: 'Iran News',
    description: 'Iran-focused coverage from the live feed mix.',
    keywords: ['iran', 'tehran', 'isfahan', 'ayatollah', 'persian gulf', 'islamic republic', 'irgc']
  },
  {
    slug: 'global-news',
    title: 'Global News',
    description: 'International headlines and geopolitics from the live feed mix.',
    keywords: [
      'global', 'world', 'international', 'geopolit', 'foreign ministry', 'united nations',
      'eu ', 'european union', 'ceasefire', 'sanctions', 'diplomacy', 'refugee'
    ]
  },
  {
    slug: 'us-news',
    title: 'US News',
    description: 'US national news from the live feed mix.',
    keywords: [
      'united states', 'u.s.', 'us ', 'white house', 'congress', 'senate',
      'supreme court', 'governor', 'federal', 'washington'
    ]
  },
  {
    slug: 'us-midterms',
    title: 'US Midterms',
    description: 'US midterm election coverage from the live feed mix.',
    keywords: [
      'midterm', 'midterms', 'house race', 'senate race', 'swing state',
      'campaign trail', 'ballot', 'polling', 'election day', 'primary'
    ]
  },
  {
    slug: 'us-economy',
    title: 'US Economy',
    description: 'US economic coverage from the live feed mix.',
    keywords: [
      'u.s. economy', 'us economy', 'federal reserve', 'fed ', 'inflation', 'jobs report',
      'nonfarm payrolls', 'consumer spending', 'treasury', 'wall street'
    ]
  },
  {
    slug: 'ai',
    title: 'AI',
    description: 'Artificial intelligence coverage from the live feed mix.',
    keywords: [
      'artificial intelligence', 'ai ', 'machine learning', 'llm', 'foundation model',
      'generative ai', 'chatgpt', 'openai', 'anthropic', 'gemini', 'copilot'
    ]
  },
  {
    slug: 'tech-news',
    title: 'Tech News',
    description: 'Technology coverage from the live feed mix.',
    keywords: [
      'startup', 'software', 'hardware', 'chip', 'semiconductor', 'cloud',
      'cybersecurity', 'app', 'developer', 'platform', 'silicon valley', 'tech'
    ]
  },
  {
    slug: 'new-york-city-news',
    title: 'New York City News',
    description: 'New York City coverage from the live feed mix.',
    keywords: [
      'new york city', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island',
      'new york mayor', 'mta', 'subway', 'ny pd', 'new york state'
    ]
  },
  {
    slug: 'global-economy',
    title: 'Global Economy',
    description: 'Global economy coverage from the live feed mix.',
    keywords: [
      'global economy', 'g20', 'imf', 'world bank', 'oecd', 'trade deficit',
      'supply chain', 'commodity', 'emerging market', 'central bank', 'currency'
    ]
  },
  {
    slug: 'infrastructure-news',
    title: 'Infrastructure News',
    description: 'Infrastructure coverage from the live feed mix.',
    keywords: [
      'infrastructure', 'bridge', 'highway', 'rail', 'transit', 'airport',
      'seaport', 'power grid', 'water system', 'construction', 'public works'
    ]
  }
];

const TOPICS_BY_SLUG = new Map(TOPIC_DEFINITIONS.map((topic) => [topic.slug, topic]));

function normalizePublicationName(feedConfig, feed) {
  let publicationName = (feedConfig && feedConfig.label) || feed.title || feed.link || 'Unknown';
  if (!(feedConfig && feedConfig.label)) {
    if (publicationName.includes('>')) {
      publicationName = publicationName.split('>')[0].trim();
    }
    if (publicationName.includes('-')) {
      publicationName = publicationName.split('-')[0].trim();
    }
  }
  return publicationName;
}

function buildTopicSearchText(item, publicationName) {
  return [
    publicationName,
    item.title || '',
    item.contentSnippet || '',
    item.content || '',
    item.description || '',
    item.link || ''
  ].join(' ').toLowerCase();
}

function transformFeedItem(item) {
  const publicationName = item.feedTitle || 'Unknown';
  const classificationText = buildTopicSearchText(item, publicationName);
  return {
    title: item.title,
    author: item.creator || item.author,
    publication_name: publicationName,
    published_date: item.pubDate,
    url: item.link,
    image_url: extractImage(item),
    _classificationText: classificationText
  };
}

function matchesTopic(article, topic) {
  const text = article._classificationText || '';
  return topic.keywords.some((keyword) => text.includes(keyword));
}

async function fetchAggregatedArticles() {
  const articles = [];

  for (const feedConfig of rssFeeds) {
    const url = typeof feedConfig === 'string' ? feedConfig : feedConfig.url;
    try {
      const feed = await parser.parseURL(url);
      const publicationName = normalizePublicationName(feedConfig, feed);
      articles.push(...feed.items.map((item) => ({
        ...item,
        feedTitle: publicationName
      })));
    } catch (error) {
      console.error(`Failed to fetch RSS feed: ${url}`, error.message);
    }
  }

  articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return articles.map(transformFeedItem);
}

// Helper function to extract image from RSS item
function extractImage(item) {
  let imageUrl = null;

  // 1. Enclosure (common in RSS)
  const enclosure = item.enclosure;
  if (enclosure) {
    const enclSources = Array.isArray(enclosure) ? enclosure : [enclosure];
    const match = enclSources.find(src => src && src.url);
    if (match && match.url) {
      imageUrl = match.url;
    }
  }
  // 2. Media content (RSS extensions)
  if (!imageUrl && item['media:content']) {
    const mc = item['media:content'];
    const mediaItems = Array.isArray(mc) ? mc : [mc];
    const img = mediaItems.find(m => (m && m.$ && m.$.url) || (m && m.url));
    if (img) {
      imageUrl = (img.$ && img.$.url) || img.url || null;
    }
  }
  // 3. Media group (NYTimes and others)
  if (!imageUrl && item['media:group']) {
    const mg = item['media:group'];
    const groups = Array.isArray(mg) ? mg : [mg];
    for (const group of groups) {
      const contents = group['media:content'];
      if (contents) {
        const mediaItems = Array.isArray(contents) ? contents : [contents];
        const img = mediaItems.find(m => (m && m.$ && m.$.url) || (m && m.url));
        if (img) {
          imageUrl = (img.$ && img.$.url) || img.url || null;
          break;
        }
      }
    }
  }
  // 4. Media thumbnail
  if (!imageUrl && item['media:thumbnail']) {
    const mt = item['media:thumbnail'];
    const thumbnails = Array.isArray(mt) ? mt : [mt];
    const thumb = thumbnails.find(t => (t && t.$ && t.$.url) || (t && t.url));
    if (thumb) {
      imageUrl = (thumb.$ && thumb.$.url) || thumb.url || null;
    }
  }
  // 5. Content encoded
  if (!imageUrl && item['content:encoded']) {
    const imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"'>]+)["']/i);
    if (imgMatch) {
      imageUrl = imgMatch[1];
    }
  }
  // 6. Extract from content/description
  if (!imageUrl && item.content) {
    const imgMatch = item.content.match(/<img[^>]+src=["']([^"'>]+)["']/i);
    if (imgMatch) {
      imageUrl = imgMatch[1];
    }
  }
  if (!imageUrl && item.description) {
    const imgMatch = item.description.match(/<img[^>]+src=["']([^"'>]+)["']/i);
    if (imgMatch) {
      imageUrl = imgMatch[1];
    }
  }

  return imageUrl;
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((acc, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) return acc;
      const name = cookie.substring(0, separatorIndex).trim();
      const value = decodeURIComponent(cookie.substring(separatorIndex + 1).trim());
      acc[name] = value;
      return acc;
    }, {});
}

function hasWritingAccess(req) {
  const cookies = parseCookies(req);
  return cookies.writing_access === 'granted';
}

function getWritingPreviewDurationMs() {
  const seconds = Number.parseInt(process.env.WRITING_PREVIEW_SECONDS || '120', 10);
  const safeSeconds = Number.isFinite(seconds)
    ? Math.min(Math.max(seconds, 5), 60 * 60 * 24)
    : 120;
  return safeSeconds * 1000;
}

function getWritingPreviewState(req) {
  const cookies = parseCookies(req);
  const raw = cookies[WRITING_PREVIEW_COOKIE];
  const now = Date.now();
  const previewDurationMs = getWritingPreviewDurationMs();

  if (!raw) {
    return { active: true, shouldSetCookie: true, startedAtMs: now };
  }

  const startedAtMs = Number.parseInt(raw, 10);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    return { active: true, shouldSetCookie: true, startedAtMs: now };
  }

  const active = now - startedAtMs < previewDurationMs;
  return { active, shouldSetCookie: false, startedAtMs };
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

function setWritingPreviewCookie(res, startedAtMs) {
  const maxAgeSeconds = 60 * 60 * 24 * 30; // Keep preview-start timestamp for 30 days.
  const cookieParts = [
    `${WRITING_PREVIEW_COOKIE}=${startedAtMs}`,
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

function clearWritingPreviewCookie(res) {
  const cookieParts = [
    `${WRITING_PREVIEW_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure');
  }
  appendSetCookieHeader(res, cookieParts.join('; '));
}

function getSiteUrl(req) {
  const configured = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  return `${protocol}://${req.get('host')}`;
}

function getPageSeo(req, { title, path, description }) {
  const siteUrl = getSiteUrl(req);
  const canonicalUrl = `${siteUrl}${path}`;

  return {
    title,
    canonicalPath: path,
    canonicalUrl,
    pageDescription: description,
    seoJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `Adrienne Caffarel: ${title}`,
      description,
      url: canonicalUrl,
      isPartOf: {
        '@type': 'WebSite',
        name: 'Adrienne Caffarel',
        url: siteUrl
      }
    }
  };
}

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a || '', 'utf8');
  const bBuffer = Buffer.from(b || '', 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function parseAdminAllowlist() {
  return (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',')
    .map((ip) => normalizeIp(ip.trim()))
    .filter(Boolean);
}

function requireWritingSubmissionsAdmin(req, res, next) {
  const expectedUser = process.env.ADMIN_USERNAME || '';
  const expectedPass = process.env.ADMIN_PASSWORD || '';

  // Keep endpoint disabled unless explicit credentials are configured.
  if (!expectedUser || !expectedPass) {
    return res.status(503).json({ error: 'Admin endpoint is not configured.' });
  }

  const allowedIps = parseAdminAllowlist();
  const requestIp = normalizeIp(req.ip) || 'unknown';
  if (allowedIps.length > 0 && !allowedIps.includes(requestIp)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const now = Date.now();
  const authState = adminAuthAttempts.get(requestIp);
  if (authState) {
    const elapsed = now - authState.firstAttemptAt;
    if (elapsed > ADMIN_AUTH_WINDOW_MS) {
      adminAuthAttempts.delete(requestIp);
    } else if (authState.attempts >= ADMIN_AUTH_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
    }
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    registerAdminAuthFailure(requestIp);
    res.setHeader('WWW-Authenticate', 'Basic realm="Writing Admin", charset="UTF-8"');
    return res.status(401).json({ error: 'Authentication required.' });
  }

  let username = '';
  let password = '';
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const splitIndex = decoded.indexOf(':');
    if (splitIndex === -1) {
      throw new Error('Malformed basic auth payload');
    }
    username = decoded.slice(0, splitIndex);
    password = decoded.slice(splitIndex + 1);
  } catch (error) {
    registerAdminAuthFailure(requestIp);
    res.setHeader('WWW-Authenticate', 'Basic realm="Writing Admin", charset="UTF-8"');
    return res.status(401).json({ error: 'Invalid authentication header.' });
  }

  if (!safeEqual(username, expectedUser) || !safeEqual(password, expectedPass)) {
    registerAdminAuthFailure(requestIp);
    res.setHeader('WWW-Authenticate', 'Basic realm="Writing Admin", charset="UTF-8"');
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  adminAuthAttempts.delete(requestIp);
  res.setHeader('Cache-Control', 'no-store');
  return next();
}

function registerAdminAuthFailure(ip) {
  const now = Date.now();
  const state = adminAuthAttempts.get(ip);
  if (!state || now - state.firstAttemptAt > ADMIN_AUTH_WINDOW_MS) {
    adminAuthAttempts.set(ip, { attempts: 1, firstAttemptAt: now });
    return;
  }
  state.attempts += 1;
  adminAuthAttempts.set(ip, state);
}

function escapeCsv(value) {
  const stringValue = value == null ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

const WRITING_SECTIONS = new Set(['orienting', 'thinking']);

function getSectionOrNull(value) {
  const normalized = (value || '').trim().toLowerCase();
  return WRITING_SECTIONS.has(normalized) ? normalized : null;
}

function summarizeBody(body) {
  const plain = (body || '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  return plain.length > 120 ? `${plain.slice(0, 120)}...` : plain;
}

function normalizeAnalyticsDays(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 365);
}

router.get('/robots.txt', (req, res) => {
  const siteUrl = getSiteUrl(req);
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`
  ].join('\n');

  res.type('text/plain');
  return res.status(200).send(body);
});

router.get('/sitemap.xml', (req, res) => {
  const siteUrl = getSiteUrl(req);
  const now = new Date().toISOString();
  const urls = [
    '/',
    '/about',
    '/library',
    '/designing',
    '/developing',
    '/writing',
    ...TOPIC_DEFINITIONS.map((topic) => `/topics/${topic.slug}`)
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((path) =>
      [
        '  <url>',
        `    <loc>${siteUrl}${path}</loc>`,
        `    <lastmod>${now}</lastmod>`,
        `    <changefreq>${path === '/' ? 'hourly' : 'weekly'}</changefreq>`,
        `    <priority>${path === '/' ? '1.0' : '0.8'}</priority>`,
        '  </url>'
      ].join('\n')
    ),
    '</urlset>'
  ].join('\n');

  res.type('application/xml');
  return res.status(200).send(xml);
});

// Home page - main RSS feed aggregator
router.get('/', async (req, res, next) => {
  try {
    const transformedArticles = await fetchAggregatedArticles();

    const seo = getPageSeo(req, {
      title: 'Home',
      path: '/',
      description: 'Adrienne Caffarel is designing, developing, reading, and writing.'
    });
    const siteUrl = getSiteUrl(req);

    seo.seoJsonLd = [
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: 'Adrienne Caffarel',
        url: siteUrl
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Adrienne Caffarel',
        url: siteUrl
      },
      seo.seoJsonLd
    ];

    res.render('home', {
      ...seo,
      articles: transformedArticles
    });
  } catch (error) {
    next(error);
  }
});

router.get('/topics/:slug', async (req, res, next) => {
  try {
    const topic = TOPICS_BY_SLUG.get(req.params.slug);
    if (!topic) {
      return res.status(404).send('Topic not found');
    }

    const aggregatedArticles = await fetchAggregatedArticles();
    const topicArticles = aggregatedArticles.filter((article) => matchesTopic(article, topic));
    const visibleArticles = topicArticles.map(({ _classificationText, ...article }) => article);
    const topicPath = `/topics/${topic.slug}`;

    const seo = getPageSeo(req, {
      title: topic.title,
      path: topicPath,
      description: topic.description
    });

    return res.render('topic-hub', {
      ...seo,
      topicTitle: topic.title,
      articles: visibleArticles
    });
  } catch (error) {
    return next(error);
  }
});

// Library page - Google Drive PDF library
router.get('/library', async (req, res, next) => {
  try {
    const shouldForceSync = req.query.refresh === '1';
    const syncResult = await ensureLibrarySynced({ force: shouldForceSync });
    const items = await LibraryItem.findAll(
      'CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, COALESCE(author, \'\') ASC, title ASC'
    );
    const syncStatus = getLibrarySyncStatus();

    const seo = getPageSeo(req, {
      title: 'Library',
      path: '/library',
      description: 'Adrienne Caffarel: reading library and curated book collection.'
    });

    res.render('library', {
      ...seo,
      items,
      syncResult,
      syncStatus
    });
  } catch (error) {
    next(error);
  }
});

router.get('/designing', (req, res) => {
  const eventProductionMedia = [
    {
      type: 'video',
      src: '/videos/event-production-01.mp4'
    },
    {
      type: 'image',
      src: '/images/developing/event-photo-01.jpg'
    },
    {
      type: 'image',
      src: '/images/developing/event-photo-02.jpg'
    },
    {
      type: 'image',
      src: '/images/developing/event-photo-03.jpg'
    },
    {
      type: 'image',
      src: '/images/developing/event-photo-04.jpg'
    },
    {
      type: 'video',
      src: '/videos/event-production-02.mp4'
    }
  ];

  const seo = getPageSeo(req, {
    title: 'Designing',
    path: '/designing',
    description: 'Adrienne Caffarel: design work and event production portfolio.'
  });

  res.render('developing', {
    ...seo,
    pageTitle: 'Designing',
    eventProductionMedia
  });
});

router.get('/about', (req, res) => {
  const seo = getPageSeo(req, {
    title: 'About',
    path: '/about',
    description: 'About Adrienne Caffarel: background, tools, and education.'
  });

  res.render('about', {
    ...seo,
    pageTitle: 'About'
  });
});

router.get('/developing', (req, res) => {
  const seo = getPageSeo(req, {
    title: 'Developing',
    path: '/developing',
    description: 'Adrienne Caffarel: software development projects and experiments.'
  });

  const developingApps = [
    {
      title: 'Event & Guest Management Platform',
      replaced: 'Tripleseat',
      features: [
        'Custom landing page builder',
        'Custom RSVP form',
        'Event admin dashboard',
        'Invite builder & mailer',
        '.ics calendar attachments'
      ]
    },
    {
      title: 'PDF Editor & Signing Tool',
      replaced: 'Adobe Acrobat',
      features: [
        'Signature panel',
        'PDF merging and splitting',
        'Form field detection'
      ]
    },
    {
      title: 'Reception Check-in App',
      replaced: 'Envoy',
      features: [
        'Tablet based UI for guest check-in',
        'Admin dashboard',
        'Customizable contacts list',
        'Custom notification settings',
        'Slack integration'
      ]
    }
  ];

  res.render('developing-page', {
    ...seo,
    pageTitle: 'Developing',
    developingApps
  });
});

router.get('/reading', (req, res) => {
  res.redirect('/library');
});

router.post('/analytics/event', async (req, res, next) => {
  try {
    const eventName = (req.body.eventName || '').trim().toLowerCase();
    const allowedEvents = new Set(['outbound_click']);
    if (!allowedEvents.has(eventName)) {
      return res.status(400).json({ error: 'Unsupported event.' });
    }

    const requestedPath = (req.body.path || '').trim();
    const context = buildRequestContext(req, requestedPath || req.originalUrl || '/');
    const metadata = {
      targetUrl: (req.body.targetUrl || '').trim().slice(0, 1200),
      targetHost: (req.body.targetHost || '').trim().slice(0, 255)
    };

    await AnalyticsEvent.createEvent({
      ...context,
      eventName,
      metadata
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get('/writing', async (req, res, next) => {
  try {
    const seo = getPageSeo(req, {
      title: 'Writing',
      path: '/writing',
      description: 'Adrienne Caffarel: writing and essays.'
    });

    const hasAccess = hasWritingAccess(req);
    if (!hasAccess) {
      const previewState = getWritingPreviewState(req);
      if (previewState.shouldSetCookie) {
        setWritingPreviewCookie(res, previewState.startedAtMs);
      }
      if (!previewState.active) {
        await AnalyticsEvent.createEvent({
          ...buildRequestContext(req, '/writing'),
          eventName: 'writing_gate_view',
          metadata: { reason: 'preview_expired' }
        });
        return res.render('writing-gate', {
          ...seo,
          errorMessage: null,
          formData: { first_name: '', last_name: '', email: '' }
        });
      }
    }

    const orientingEntry = await WritingEntry.findLatestBySection('orienting');
    const thinkingEntry = await WritingEntry.findLatestBySection('thinking');
    const orientingBody = orientingEntry ? orientingEntry.body : '';
    const thinkingBody = thinkingEntry
      ? thinkingEntry.body
      : 'Private essays archive. New pieces coming soon.';

    return res.render('writing-content', {
      ...seo,
      pageTitle: 'Writing',
      orientingHtml: markdown.render(orientingBody),
      thinkingHtml: markdown.render(thinkingBody)
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 250;
    const submissions = await WritingSubmission.findRecent(limit);
    const entryLimit = req.query.entry_limit ? parseInt(req.query.entry_limit, 10) : 50;
    const orientingEntries = await WritingEntry.findRecentBySection('orienting', entryLimit);
    const thinkingEntries = await WritingEntry.findRecentBySection('thinking', entryLimit);

    const orientingEditId = req.query.orienting_edit ? parseInt(req.query.orienting_edit, 10) : null;
    const thinkingEditId = req.query.thinking_edit ? parseInt(req.query.thinking_edit, 10) : null;

    const orientingEditingEntry = Number.isFinite(orientingEditId)
      ? await WritingEntry.findById(orientingEditId)
      : null;
    const thinkingEditingEntry = Number.isFinite(thinkingEditId)
      ? await WritingEntry.findById(thinkingEditId)
      : null;

    const orientingDraft = orientingEditingEntry && orientingEditingEntry.section === 'orienting'
      ? orientingEditingEntry.body
      : '';
    const thinkingDraft = thinkingEditingEntry && thinkingEditingEntry.section === 'thinking'
      ? thinkingEditingEntry.body
      : '';

    return res.render('admin-dashboard', {
      ...getPageSeo(req, {
        title: 'Admin Dashboard',
        path: '/admin',
        description: 'Manage writing page content and writing gate submissions.'
      }),
      saved: req.query.saved === '1',
      savedSection: getSectionOrNull(req.query.section),
      limit,
      total: submissions.length,
      submissions,
      orientingEntries: orientingEntries.map((entry) => ({
        ...entry,
        summary: summarizeBody(entry.body)
      })),
      thinkingEntries: thinkingEntries.map((entry) => ({
        ...entry,
        summary: summarizeBody(entry.body)
      })),
      orientingDraft,
      thinkingDraft,
      orientingEditingId:
        orientingEditingEntry && orientingEditingEntry.section === 'orienting'
          ? orientingEditingEntry.id
          : null,
      thinkingEditingId:
        thinkingEditingEntry && thinkingEditingEntry.section === 'thinking'
          ? thinkingEditingEntry.id
          : null
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/analytics', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const days = normalizeAnalyticsDays(req.query.days);
    const analytics = await AnalyticsEvent.getDashboard(days);
    const sparklineMax = analytics.daily.reduce((max, row) => Math.max(max, row.views), 0);

    return res.render('admin-analytics', {
      ...getPageSeo(req, {
        title: 'Admin Analytics',
        path: '/admin/analytics',
        description: 'Traffic and conversion analytics dashboard.'
      }),
      analytics,
      dayOptions: [7, 30, 90, 365],
      sparklineMax: sparklineMax || 1
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/admin/writing-content', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const section = getSectionOrNull(req.body.section);
    if (!section) {
      return res.status(400).json({ error: 'Invalid section.' });
    }

    const body = (req.body.content || '').trim();
    if (!body) {
      return res.status(400).json({ error: 'Content is required.' });
    }

    const entryId = req.body.entry_id ? parseInt(req.body.entry_id, 10) : null;
    if (Number.isFinite(entryId)) {
      const existing = await WritingEntry.findById(entryId);
      if (!existing || existing.section !== section) {
        return res.status(404).json({ error: 'Entry not found.' });
      }
      await WritingEntry.update(entryId, { body });
    } else {
      await WritingEntry.create({ section, body });
    }

    return res.redirect(`/admin?saved=1&section=${encodeURIComponent(section)}`);
  } catch (error) {
    return next(error);
  }
});

router.post('/writing/unlock', async (req, res, next) => {
  try {
    const first_name = (req.body.first_name || '').trim();
    const last_name = (req.body.last_name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const honeypot = (req.body.riddle_answer || '').trim();

    if (honeypot) {
      return res.redirect('/writing');
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!first_name || !last_name || !emailPattern.test(email)) {
      return res.status(400).render('writing-gate', {
        ...getPageSeo(req, {
          title: 'Writing',
          path: '/writing',
          description: 'Adrienne Caffarel: writing and essays.'
        }),
        errorMessage: 'Please complete all three riddles with a valid email address.',
        formData: { first_name, last_name, email }
      });
    }

    await WritingSubmission.create({
      first_name,
      last_name,
      email,
      source_ip: req.ip,
      user_agent: req.headers['user-agent'] || null
    });

    await AnalyticsEvent.createEvent({
      ...buildRequestContext(req, '/writing'),
      eventName: 'writing_unlock_success',
      metadata: { email_domain: email.split('@')[1] || '' }
    });

    const maxAgeSeconds = 60 * 60 * 24 * 365; // 365 days
    const cookieParts = [
      `writing_access=granted`,
      `Max-Age=${maxAgeSeconds}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax'
    ];
    if (process.env.NODE_ENV === 'production') {
      cookieParts.push('Secure');
    }
    res.setHeader('Set-Cookie', cookieParts.join('; '));

    return res.redirect('/writing');
  } catch (error) {
    next(error);
  }
});

router.get('/writing/reset', (req, res) => {
  const accessCookieParts = [
    'writing_access=',
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (process.env.NODE_ENV === 'production') {
    accessCookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', [accessCookieParts.join('; ')]);
  clearWritingPreviewCookie(res);
  return res.redirect('/writing');
});

router.get('/admin/writing-submissions', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 250;
    const submissions = await WritingSubmission.findRecent(limit);
    const sanitizedSubmissions = submissions.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email
    }));
    return res.status(200).json({
      total: sanitizedSubmissions.length,
      submissions: sanitizedSubmissions
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/writing-submissions/dashboard', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const destination = limit ? `/admin?limit=${encodeURIComponent(limit)}` : '/admin';
    return res.redirect(destination);
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/writing-submissions.csv', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 1000;
    const submissions = await WritingSubmission.findRecent(limit);
    const lines = [
      ['id', 'created_at', 'first_name', 'last_name', 'email']
        .map(escapeCsv)
        .join(',')
    ];

    for (const row of submissions) {
      lines.push(
        [
          row.id,
          row.created_at,
          row.first_name,
          row.last_name,
          row.email
        ].map(escapeCsv).join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="writing-submissions-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.status(200).send(lines.join('\n'));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
