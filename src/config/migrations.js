const db = require('./database-sqlite');
const logger = require('../utils/logger');

// SQL for creating book_posts table (works for both SQLite and PostgreSQL)
const createBookPostsTable = async () => {
  const createTableSQL = db.usePostgres
    ? `
      CREATE TABLE IF NOT EXISTS book_posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        subtitle TEXT,
        slug VARCHAR(500) UNIQUE NOT NULL,
        content TEXT,
        image_url VARCHAR(500),
        published_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    : `
      CREATE TABLE IF NOT EXISTS book_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        subtitle TEXT,
        slug TEXT UNIQUE NOT NULL,
        content TEXT,
        image_url TEXT,
        published_date TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `;

  try {
    await db.query(createTableSQL);
    logger.info('book_posts table created or already exists');
  } catch (error) {
    logger.error('Error creating book_posts table:', error);
    throw error;
  }
};

// Add type column to book_posts table
const addTypeColumn = async () => {
  try {
    // Check if column already exists
    const checkColumnSQL = db.usePostgres
      ? `SELECT column_name FROM information_schema.columns
         WHERE table_name='book_posts' AND column_name='type'`
      : `PRAGMA table_info(book_posts)`;

    const result = await db.query(checkColumnSQL);

    let columnExists = false;
    if (db.usePostgres) {
      columnExists = result.rows.length > 0;
    } else {
      columnExists = result.rows.some(col => col.name === 'type');
    }

    if (!columnExists) {
      const addColumnSQL = db.usePostgres
        ? `ALTER TABLE book_posts ADD COLUMN type VARCHAR(50) DEFAULT 'book' NOT NULL`
        : `ALTER TABLE book_posts ADD COLUMN type TEXT DEFAULT 'book' NOT NULL`;

      await db.query(addColumnSQL);
      logger.info('Added type column to book_posts table');
    } else {
      logger.info('type column already exists in book_posts table');
    }
  } catch (error) {
    if (error.code === 'SQLITE_ERROR' && error.message.includes('duplicate column')) {
      logger.info('type column already exists (duplicate column error)');
    } else {
      logger.error('Error adding type column:', error);
      throw error;
    }
  }
};

// Seed initial pages
const seedPages = async () => {
  try {
    const pages = [
      { slug: 'about', title: "Who's Writing This?", type: 'page' },
      { slug: 'contact', title: 'Can I Email Her?', type: 'page' },
      { slug: 'reading', title: "What Else Is She Reading?", type: 'page' }
    ];

    for (const page of pages) {
      // Check if page already exists
      const checkSQL = db.usePostgres
        ? `SELECT id FROM book_posts WHERE slug = $1`
        : `SELECT id FROM book_posts WHERE slug = ?`;

      const result = await db.query(checkSQL, [page.slug]);

      if (result.rows.length === 0) {
        // Insert page
        const insertSQL = db.usePostgres
          ? `INSERT INTO book_posts (title, slug, type, published_date, content)
             VALUES ($1, $2, $3, CURRENT_DATE, $4)`
          : `INSERT INTO book_posts (title, slug, type, published_date, content)
             VALUES (?, ?, ?, date('now'), ?)`;

        await db.query(insertSQL, [page.title, page.slug, page.type, 'Content coming soon...']);
        logger.info(`Seeded page: ${page.title}`);
      } else {
        logger.info(`Page already exists: ${page.title}`);
      }
    }
  } catch (error) {
    logger.error('Error seeding pages:', error);
    throw error;
  }
};

const runMigrations = async () => {
  logger.info('Running database migrations...');
  try {
    await createBookPostsTable();
    await addTypeColumn();
    await seedPages();
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
};

module.exports = {
  runMigrations,
};
