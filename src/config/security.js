const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", 'https://open.spotify.com']
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

function minutes(value) {
  return value * 60 * 1000;
}

function createLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    handler: (req, res) => {
      res.status(429).json({ error: message });
    }
  });
}

const rateLimitConfig = createLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || minutes(15),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 300,
  message: 'Too many requests from this IP, please try again later.'
});

const apiRateLimitConfig = createLimiter({
  windowMs: minutes(15),
  max: 90,
  message: 'Too many API requests from this IP, please try again later.'
});

const analyticsEventRateLimitConfig = createLimiter({
  windowMs: minutes(5),
  max: 120,
  message: 'Too many analytics events from this IP, please try again later.'
});

const writingUnlockRateLimitConfig = createLimiter({
  windowMs: minutes(15),
  max: 8,
  message: 'Too many writing unlock attempts from this IP, please try again later.'
});

const adminWriteRateLimitConfig = createLimiter({
  windowMs: minutes(15),
  max: 60,
  message: 'Too many admin write requests from this IP, please try again later.'
});

const streamRateLimitConfig = createLimiter({
  windowMs: minutes(5),
  max: 12,
  message: 'Too many live visitor streams from this IP, please try again later.'
});

module.exports = {
  helmet: helmetConfig,
  rateLimit: rateLimitConfig,
  apiRateLimit: apiRateLimitConfig,
  analyticsEventRateLimit: analyticsEventRateLimitConfig,
  writingUnlockRateLimit: writingUnlockRateLimitConfig,
  adminWriteRateLimit: adminWriteRateLimitConfig,
  streamRateLimit: streamRateLimitConfig
};
