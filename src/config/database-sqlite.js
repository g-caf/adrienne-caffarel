const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// Determine which database to use based on environment
const isProduction = process.env.NODE_ENV === 'production';
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
const usePostgres = hasDatabaseUrl;

let db = null;
let pool = null;

// SQLite setup for local development
if (!usePostgres) {
  if (isProduction) {
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
}

// PostgreSQL setup for production
if (usePostgres) {
  const config = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  pool = new Pool(config);

  pool.on('error', (err) => {
    logger.error('Database pool error:', err);
    process.exit(-1);
  });

  pool.on('connect', () => {
    logger.info('PostgreSQL database connected');
  });
}

// Unified query interface
const query = async (text, params = []) => {
  const start = Date.now();

  try {
    if (usePostgres) {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Query executed', { query: text, duration, rows: res.rowCount });
      return res;
    } else {
      // SQLite query
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
  if (usePostgres) {
    return await pool.connect();
  } else {
    // For SQLite, return a mock client with query method
    return {
      query,
      release: () => {},
    };
  }
};

module.exports = {
  query,
  getClient,
  pool,
  db,
  usePostgres,
};
