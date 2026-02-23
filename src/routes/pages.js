const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Parser = require('rss-parser');
const LibraryItem = require('../models/LibraryItem');
const WritingSubmission = require('../models/WritingSubmission');
const { ensureLibrarySynced, getLibrarySyncStatus } = require('../services/librarySync');

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

const ADMIN_AUTH_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_AUTH_MAX_ATTEMPTS = 10;
const adminAuthAttempts = new Map();

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

// Home page - main RSS feed aggregator
router.get('/', async (req, res, next) => {
  try {
    const articles = [];

    for (const feedConfig of rssFeeds) {
      const url = typeof feedConfig === 'string' ? feedConfig : feedConfig.url;
      try {
        const feed = await parser.parseURL(url);

        // Extract publication name from feed
        let publicationName = (feedConfig && feedConfig.label) || feed.title || feed.link || 'Unknown';
        if (!(feedConfig && feedConfig.label)) {
          if (publicationName.includes('>')) {
            publicationName = publicationName.split('>')[0].trim();
          }
          if (publicationName.includes('-')) {
            publicationName = publicationName.split('-')[0].trim();
          }
        }

        articles.push(...feed.items.map(item => ({
          ...item,
          feedTitle: publicationName
        })));
      } catch (error) {
        console.error(`Failed to fetch RSS feed: ${url}`, error.message);
      }
    }

    // Sort by publication date
    articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Transform articles
    const transformedArticles = articles.map(item => ({
      title: item.title,
      author: item.creator || item.author,
      publication_name: item.feedTitle || 'Unknown',
      published_date: item.pubDate,
      url: item.link,
      image_url: extractImage(item)
    }));

    res.render('home', {
      title: 'Home',
      articles: transformedArticles
    });
  } catch (error) {
    next(error);
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

    res.render('library', {
      title: 'Library',
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

  res.render('developing', {
    title: 'Designing',
    pageTitle: 'Designing',
    eventProductionMedia
  });
});

router.get('/about', (req, res) => {
  res.render('about', {
    title: 'About',
    pageTitle: 'About'
  });
});

router.get('/developing', (req, res) => {
  res.render('placeholder-page', {
    title: 'Developing',
    pageTitle: 'Developing'
  });
});

router.get('/reading', (req, res) => {
  res.redirect('/library');
});

router.get('/writing', (req, res) => {
  if (!hasWritingAccess(req)) {
    return res.render('writing-gate', {
      title: 'Writing',
      errorMessage: null,
      formData: { first_name: '', last_name: '', email: '' }
    });
  }

  res.render('writing-content', {
    title: 'Writing',
    pageTitle: 'Writing'
  });
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
        title: 'Writing',
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

    const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 days
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
  const cookieParts = [
    'writing_access=',
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieParts.join('; '));
  return res.redirect('/writing');
});

router.get('/admin/writing-submissions', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 250;
    const submissions = await WritingSubmission.findRecent(limit);
    return res.status(200).json({
      total: submissions.length,
      submissions
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/writing-submissions.csv', requireWritingSubmissionsAdmin, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 1000;
    const submissions = await WritingSubmission.findRecent(limit);
    const lines = [
      ['id', 'created_at', 'first_name', 'last_name', 'email', 'source_ip', 'user_agent']
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
          row.email,
          row.source_ip,
          row.user_agent
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
