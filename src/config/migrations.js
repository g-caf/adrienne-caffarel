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

// SQL for creating library_items table (works for both SQLite and PostgreSQL)
const createLibraryItemsTable = async () => {
  const createTableSQL = db.usePostgres
    ? `
      CREATE TABLE IF NOT EXISTS library_items (
        id SERIAL PRIMARY KEY,
        drive_file_id VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(500) NOT NULL,
        author VARCHAR(255),
        cover_image_url VARCHAR(1000),
        web_view_link VARCHAR(1000) NOT NULL,
        mime_type VARCHAR(255),
        modified_time TIMESTAMP,
        file_size BIGINT,
        sort_order INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    : `
      CREATE TABLE IF NOT EXISTS library_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drive_file_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        cover_image_url TEXT,
        web_view_link TEXT NOT NULL,
        mime_type TEXT,
        modified_time TEXT,
        file_size INTEGER,
        sort_order INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `;

  try {
    await db.query(createTableSQL);
    logger.info('library_items table created or already exists');
  } catch (error) {
    logger.error('Error creating library_items table:', error);
    throw error;
  }
};

// Add sort_order column to library_items table
const addLibrarySortOrderColumn = async () => {
  try {
    const checkColumnSQL = db.usePostgres
      ? `SELECT column_name FROM information_schema.columns
         WHERE table_name='library_items' AND column_name='sort_order'`
      : `PRAGMA table_info(library_items)`;

    const result = await db.query(checkColumnSQL);

    let columnExists = false;
    if (db.usePostgres) {
      columnExists = result.rows.length > 0;
    } else {
      columnExists = result.rows.some(col => col.name === 'sort_order');
    }

    if (!columnExists) {
      const addColumnSQL = db.usePostgres
        ? `ALTER TABLE library_items ADD COLUMN sort_order INTEGER`
        : `ALTER TABLE library_items ADD COLUMN sort_order INTEGER`;

      await db.query(addColumnSQL);
      logger.info('Added sort_order column to library_items table');
    } else {
      logger.info('sort_order column already exists in library_items table');
    }
  } catch (error) {
    if (error.code === 'SQLITE_ERROR' && error.message.includes('duplicate column')) {
      logger.info('sort_order column already exists (duplicate column error)');
    } else {
      logger.error('Error adding sort_order column:', error);
      throw error;
    }
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
    await createLibraryItemsTable();
    await addLibrarySortOrderColumn();
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
