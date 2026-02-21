# Adrienne's Personal Website

A beautiful, minimal editorial website with animated landing page and RSS aggregator feed, built with Node.js and PostgreSQL.

## Features

- **Animated Landing Page**: Intro sequence with word-flip animation and collapse to sticky header
- **RSS Feed Aggregator**: Real-time feed aggregation from curated sources
- **Editorial Design**: Red text on off-white background with vintage charm and black line accents
- **Responsive Layout**: Tile-based grid layout for feeds
- **Public Site**: No authentication required, fully open and accessible
- **Production Ready**: Deployed on Render with PostgreSQL

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **Frontend**: EJS templates with CSS animations
- **RSS Parsing**: rss-parser library
- **Logging**: Winston for error tracking
- **Deployment**: Render

## Installation

1. **Clone and Install Dependencies**
   ```bash
   git clone <repo-url>
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your database configuration
   ```

3. **Database Setup**
   ```bash
   # Run database migrations
   npm run migrate
   ```

4. **Start the Server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## Environment Variables

```env
NODE_ENV=development
PORT=3000

# PostgreSQL database URL
DATABASE_URL=postgresql://user:password@localhost:5432/adrienne_personal_site

# Logging
LOG_LEVEL=info

# Google Drive library sync
GOOGLE_DRIVE_FOLDER_ID=1ppZKpX2eM0_yTVB1ebM3O1V7VTDrp_Ni
GOOGLE_DRIVE_API_KEY=your_google_api_key_here
LIBRARY_SYNC_INTERVAL_MINUTES=60
```

## Project Structure

```
.
├── src/
│   ├── config/           # Configuration files
│   ├── middleware/       # Express middleware
│   ├── models/           # Database models
│   ├── routes/           # Route handlers
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   └── server.js         # Express app setup
├── views/                # EJS templates
│   ├── partials/         # Shared template components
│   └── home.ejs          # Landing page
├── public/               # Static assets (CSS, JS, images)
├── data/                 # Data files and migrations
└── package.json
```

## Deployment on Render

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your GitHub repository
4. Build command: `npm install && npm run migrate`
5. Start command: `npm start`
6. Add environment variables (Render auto-sets DATABASE_URL from PostgreSQL service)

See `render.yaml` for automated deployment configuration.

## Pages

- **Home** (`/`) - Landing page with RSS feed aggregator
- **Library** (`/library`) - Square-tile PDF library synced from Google Drive
- **Designing** (`/designing`) - Portfolio section (future)
- **Developing** (`/developing`) - Development portfolio section (future)
- **Reading** (`/reading`) - Reading list section (future)
- **Writing** (`/writing`) - Essays and writing section (future)

## RSS Feeds

Currently configured feeds:
- TechCrunch
- Hacker News
- The Verge
- Ars Technica
- Wired
- BBC News
- New York Times
- The Atlantic
- The New Yorker

Edit feed list in `src/routes/pages.js` to customize.

## Development

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run migrate` - Run database migrations

## Library Metadata Overrides

Optional file: `data/library-metadata.json`

Use Drive file IDs as keys to override tile metadata:

```json
{
  "drive_file_id_here": {
    "title": "Clean Display Title",
    "author": "Author Name",
    "cover_image_url": "https://...",
    "sort_order": 1
  }
}
```

## Scripts

- `npm start` - Production server
- `npm run dev` - Development server with hot-reload
- `npm run migrate` - Database migrations

## License

MIT License
