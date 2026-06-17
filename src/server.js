require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const pagesRouter = require('./routes/pages');
const { runMigrations } = require('./config/migrations');
const { helmet, rateLimit } = require('./config/security');
const analyticsPageviews = require('./middleware/analyticsPageviews');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const configuredSiteUrl = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
let isReady = false;

app.set('trust proxy', 1);

// Configure EJS template engine
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

// CORS only in development - production serves from same origin
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: true, credentials: true }));
}

app.use(helmet);

// Static assets
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: isReady ? 'ready' : 'starting',
    timestamp: new Date().toISOString()
  });
});

// Compression and parsing middleware
app.use(compression());
app.use(rateLimit);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Shared SEO locals
app.use((req, res, next) => {
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  res.locals.siteUrl = configuredSiteUrl || `${protocol}://${req.get('host')}`;
  next();
});

app.use((req, res, next) => {
  if (isReady) {
    return next();
  }

  return res.status(503).json({ error: 'Service is starting.' });
});

// Automatic server-side analytics for HTML navigations
app.use(analyticsPageviews);

// Routes - public only
app.use('/', pagesRouter);

// 404 handler for pages
app.use((req, res) => {
  res.status(404).send('Page Not Found');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', JSON.stringify(err, null, 2));
  console.error(err.stack);
  res.status(500).send('Server Error');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server listening on port ${PORT}`);
});

server.on('error', (error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Initialize the database after the port is bound so Render can detect the service.
(async () => {
  try {
    await runMigrations();
    isReady = true;
    logger.info('Server initialization completed');
  } catch (error) {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
})();

module.exports = app;
