const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');
const LibraryItem = require('../models/LibraryItem');
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
  res.render('placeholder-page', {
    title: 'Designing',
    pageTitle: 'Designing'
  });
});

router.get('/developing', (req, res) => {
  const eventProductionVideos = [
    {
      title: 'Event Reel 01',
      src: '/videos/event-production-01.mp4'
    },
    {
      title: 'Event Reel 02',
      src: '/videos/event-production-02.mp4'
    }
  ];

  res.render('developing', {
    title: 'Developing',
    pageTitle: 'Developing',
    eventProductionVideos
  });
});

router.get('/reading', (req, res) => {
  res.redirect('/library');
});

router.get('/writing', (req, res) => {
  res.render('placeholder-page', {
    title: 'Writing',
    pageTitle: 'Writing'
  });
});

module.exports = router;
