require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const pagesRouter = require('./routes/pages');
const { runMigrations } = require('./config/migrations');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const configuredSiteUrl = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');

app.set('trust proxy', 1);

// Configure EJS template engine
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

// CORS only in development - production serves from same origin
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: true, credentials: true }));
}

// Static assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// Compression and parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Shared SEO locals
app.use((req, res, next) => {
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  res.locals.siteUrl = configuredSiteUrl || `${protocol}://${req.get('host')}`;
  next();
});

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

// Start server with database initialization
(async () => {
  try {
    // Initialize database first
    await runMigrations();

    // Then start the server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server started on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
})();

module.exports = app;
