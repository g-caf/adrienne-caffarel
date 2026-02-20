// scripts/migrate.js
require('dotenv').config();
const { runMigrations } = require('../src/config/migrations');
const db = require('../src/config/database-sqlite'); // to get the pool
const logger = require('../src/utils/logger');

const main = async () => {
  try {
    await runMigrations();
    logger.info('Migrations script completed successfully.');

    // For PostgreSQL, the pool will keep the process alive. We need to close it.
    if (db.pool) {
      await db.pool.end();
      logger.info('Database pool closed.');
    }
    
    // For SQLite, the process should exit automatically.
    // But to be safe, we can exit explicitly.
    process.exit(0);

  } catch (error) {
    logger.error('Migration script failed:', error);
    process.exit(1);
  }
};

main();