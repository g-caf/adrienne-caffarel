const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// Determine which database to use based on environment
const isProduction = process.env.NODE_ENV === 'production';
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
const postgresPreferred = hasDatabaseUrl;

let db = null;
let pool = null;
let activeBackend = postgresPreferred ? 'postgres' : 'sqlite';

const initializeSqlite = () => {
  if (db) {
    return db;
  }

  if (isProduction && postgresPreferred) {
    logger.warn('PostgreSQL unavailable. Falling back to SQLite.');
  } else if (isProduction) {
    logger.warn('DATABASE_URL is not set in production. Falling back to SQLite.');
  }

  const dbPath = path.join(__dirname, '../../data/database.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      logger.error('SQLite connection error:', err);
    } else {
      logger.info('Connected to SQLite database');
    }
  });

  activeBackend = 'sqlite';
  return db;
};

const shouldFallbackToSqlite = (error) => {
  if (!postgresPreferred || activeBackend !== 'postgres' || !error) {
    return false;
  }

  const fallbackCodes = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    '57P01',
  ]);

  return fallbackCodes.has(error.code);
};

const fallbackToSqlite = async (error) => {
  if (!shouldFallbackToSqlite(error)) {
    return false;
  }

  logger.error('PostgreSQL unavailable, switching to SQLite.', {
    code: error.code,
    message: error.message,
  });

  activeBackend = 'sqlite';

  if (pool) {
    const currentPool = pool;
    pool = null;
    try {
      await currentPool.end();
    } catch (closeError) {
      logger.warn('Error closing PostgreSQL pool during SQLite fallback:', closeError.message);
    }
  }

  initializeSqlite();
  return true;
};

// SQLite setup for local development
if (!postgresPreferred) {
  initializeSqlite();
}

// PostgreSQL setup for production
if (postgresPreferred) {
  const config = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  pool = new Pool(config);

  pool.on('error', async (err) => {
    logger.error('Database pool error:', err);
    const fellBack = await fallbackToSqlite(err);
    if (!fellBack) {
      process.exit(-1);
    }
  });

  pool.on('connect', () => {
    logger.info('PostgreSQL database connected');
  });
}

// Unified query interface
const query = async (text, params = []) => {
  const start = Date.now();

  try {
    if (activeBackend === 'postgres') {
      try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('Query executed', { query: text, duration, rows: res.rowCount });
        return res;
      } catch (error) {
        const fellBack = await fallbackToSqlite(error);
        if (!fellBack) {
          throw error;
        }
        return await query(text, params);
      }
    } else {
      // SQLite query
      initializeSqlite();
      return new Promise((resolve, reject) => {
        // Convert PostgreSQL $1, $2 style params to SQLite ? style
        const sqliteQuery = text.replace(/\$\d+/g, '?');

        if (text.trim().toUpperCase().startsWith('SELECT')) {
          db.all(sqliteQuery, params, (err, rows) => {
            if (err) {
              logger.error('SQLite query error:', err);
              reject(err);
            } else {
              const duration = Date.now() - start;
              logger.debug('Query executed', { query: text, duration, rows: rows.length });
              resolve({ rows, rowCount: rows.length });
            }
          });
        } else {
          db.run(sqliteQuery, params, function(err) {
            if (err) {
              logger.error('SQLite query error:', err);
              reject(err);
            } else {
              const duration = Date.now() - start;
              logger.debug('Query executed', { query: text, duration });
              resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
            }
          });
        }
      });
    }
  } catch (error) {
    logger.error('Database query error:', { query: text, error: error.message });
    throw error;
  }
};

const getClient = async () => {
  if (activeBackend === 'postgres') {
    try {
      return await pool.connect();
    } catch (error) {
      const fellBack = await fallbackToSqlite(error);
      if (!fellBack) {
        throw error;
      }
    }
  }

  initializeSqlite();
  return {
    query,
    release: () => {},
  };
};

module.exports = {
  query,
  getClient,
  get pool() {
    return pool;
  },
  get db() {
    return db;
  },
  get usePostgres() {
    return activeBackend === 'postgres';
  },
  get activeBackend() {
    return activeBackend;
  },
};
