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

// SQL for creating writing_submissions table (works for both SQLite and PostgreSQL)
const createWritingSubmissionsTable = async () => {
  const createTableSQL = db.usePostgres
    ? `
      CREATE TABLE IF NOT EXISTS writing_submissions (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(500) NOT NULL,
        source_ip VARCHAR(100),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    : `
      CREATE TABLE IF NOT EXISTS writing_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        source_ip TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `;

  try {
    await db.query(createTableSQL);
    logger.info('writing_submissions table created or already exists');
  } catch (error) {
    logger.error('Error creating writing_submissions table:', error);
    throw error;
  }
};

// SQL for creating writing_entries table (works for both SQLite and PostgreSQL)
const createWritingEntriesTable = async () => {
  const createTableSQL = db.usePostgres
    ? `
      CREATE TABLE IF NOT EXISTS writing_entries (
        id SERIAL PRIMARY KEY,
        section VARCHAR(32) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    : `
      CREATE TABLE IF NOT EXISTS writing_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `;

  try {
    await db.query(createTableSQL);
    logger.info('writing_entries table created or already exists');
  } catch (error) {
    logger.error('Error creating writing_entries table:', error);
    throw error;
  }
};

// SQL for creating building_blocks table (works for both SQLite and PostgreSQL)
const createBuildingBlocksTable = async () => {
  const createTableSQL = db.usePostgres
    ? `
      CREATE TABLE IF NOT EXISTS building_blocks (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(64) UNIQUE NOT NULL,
        type VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    : `
      CREATE TABLE IF NOT EXISTS building_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_visible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `;

  try {
    await db.query(createTableSQL);
    logger.info('building_blocks table created or already exists');
  } catch (error) {
    logger.error('Error creating building_blocks table:', error);
    throw error;
  }
};

const seedBuildingBlocks = async () => {
  try {
    const countResult = await db.query(
      db.usePostgres
        ? 'SELECT COUNT(*)::int AS count FROM building_blocks'
        : 'SELECT COUNT(*) AS count FROM building_blocks'
    );
    const existingCount = countResult.rows[0] ? Number(countResult.rows[0].count) : 0;
    if (existingCount > 0) {
      logger.info('Building blocks already seeded.');
      return;
    }

    const blocks = [
      {
        slug: 'intro',
        type: 'intro',
        sort_order: 1,
        content: {
          line: "IF YOU'RE HERE TO EDIT A PDF, SCROLL DOWN. LIKE, WAY DOWN."
        }
      },
      {
        slug: 'columns_primary',
        type: 'columns_primary',
        sort_order: 2,
        content: {
          left:
            "I've built mobile, desktop, and web applications. I'm experienced with APIs. I used the Spotify API to show what I'm listening to at any given time right here in the page of this, an Express app with a Node backend, deployed on Render.",
          right:
            "I'm kind of a luddite and I really resent how much of my life depends on software. I don't like screens or computers and I abhor gadgetry and wish we could just turn the internet off. But I build software for fun, and out of frustration."
        }
      },
      {
        slug: 'spotify',
        type: 'spotify',
        sort_order: 3,
        content: {
          title: "This is what I'm listening to right now!"
        }
      },
      {
        slug: 'columns_secondary',
        type: 'columns_secondary',
        sort_order: 4,
        content: {
          left:
            "I hate Adobe. I hate anything that forces me to make an account. I've never wanted to receive an email in my life, why the fuck would I want emails from my fucking PDF editing software? We've accepted a bizarrely cruel world.",
          right:
            "I've built a few custom solutions after being fed up with the options at hand. My idea is that in time, this site will be the one-stop-shop solution for the operations professional I was four-five years ago. Or not! Who cares? Who's reading this?"
        }
      },
      {
        slug: 'visitors',
        type: 'visitors',
        sort_order: 5,
        content: {
          copy:
            'Who is reading this? A lot of you, apparently! In case you are wondering, this is the number of visitors who have been sitting where you are since I started tracking that on {{trackingStartDate}}.',
          contact:
            'If you absolutely have to contact me about any of this, you can get in touch with me [here](/about).'
        }
      },
      {
        slug: 'pdf_intro',
        type: 'pdf_intro',
        sort_order: 6,
        content: {
          title: '**YOU READY TO EDIT A PDF?**',
          cta_label: 'Download the macOS desktop launcher',
          cta_href: '/downloads/pdf-launcher-macos.zip',
          note: 'Set it as your default PDF app and open files straight into the editor.',
          left:
            'Ok, it does what Adobe Acrobat does but it is free and it uses local storage only so everything gets processed in the browser and I never touch your data and the app can be set as system default so you can open a pdf from your desktop and it will literally show up here! In my stupid little site!',
          right:
            "This will get unsustainable for me to run for free eventually, but it's a really lightweight app, and i really fucking hate Adobe, and I'm going to grad school to do something completely unrelated so I'd rather not worry about it too much right now. It'll be free as long as I can keep it free."
        }
      },
      {
        slug: 'pdf_app',
        type: 'pdf_app',
        sort_order: 7,
        content: {}
      }
    ];

    for (const block of blocks) {
      const content = JSON.stringify(block.content || {});
      const insertSQL = db.usePostgres
        ? `INSERT INTO building_blocks (slug, type, content, sort_order, is_visible)
           VALUES ($1, $2, $3, $4, $5)`
        : `INSERT INTO building_blocks (slug, type, content, sort_order, is_visible)
           VALUES (?, ?, ?, ?, ?)`;
      await db.query(insertSQL, [block.slug, block.type, content, block.sort_order, true]);
    }

    logger.info('Seeded building blocks.');
  } catch (error) {
    logger.error('Error seeding building blocks:', error);
    throw error;
  }
};

// SQL for creating analytics_events table (works for both SQLite and PostgreSQL)
const createAnalyticsEventsTable = async () => {
  const createTableSQL = db.usePostgres
    ? `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(32) NOT NULL,
        event_name VARCHAR(100),
        path VARCHAR(500) NOT NULL,
        referrer_host VARCHAR(255),
        source VARCHAR(255),
        utm_source VARCHAR(255),
        utm_medium VARCHAR(255),
        utm_campaign VARCHAR(255),
        visitor_id VARCHAR(128),
        session_id VARCHAR(128),
        device_type VARCHAR(32),
        user_agent TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    : `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        event_name TEXT,
        path TEXT NOT NULL,
        referrer_host TEXT,
        source TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        visitor_id TEXT,
        session_id TEXT,
        device_type TEXT,
        user_agent TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `;

  try {
    await db.query(createTableSQL);
    await db.query('CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_analytics_events_type_path ON analytics_events(event_type, path)');
    logger.info('analytics_events table created or already exists');
  } catch (error) {
    logger.error('Error creating analytics_events table:', error);
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
      { slug: 'reading', title: "What Else Is She Reading?", type: 'page' },
      { slug: 'writing', title: 'Writing', type: 'page' }
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
    await createWritingSubmissionsTable();
    await createWritingEntriesTable();
    await createBuildingBlocksTable();
    await createAnalyticsEventsTable();
    await addLibrarySortOrderColumn();
    await addTypeColumn();
    await seedPages();
    await seedBuildingBlocks();
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
};

module.exports = {
  runMigrations,
};
