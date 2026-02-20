# Project Overview - Adrienne's Personal Website

## Vision
A beautiful, minimal editorial website with animated landing page and RSS aggregator feed. Red text on off-white background with vintage charm and black line accents.

## User Journey

### 1. Landing Page (First Visit)
```
┌─────────────────────────────────┐
│                                 │
│   Hi, I'm Adrienne.             │
│   I've been designing           │
│                                 │
│   ────────────                  │
│                                 │
└─────────────────────────────────┘
```

Words cycle: designing → developing → reading → writing

### 2. Animation Completes → Main Site
```
┌──────────────────────────────────┐
│ Hi, I'm Adrienne                 │
│ designing  developing  reading    │
│            writing               │
├──────────────────────────────────┤
│ What's happening                 │
│                                  │
│ ┌──────────┐ ┌──────────┐        │
│ │Article 1 │ │Article 2 │ ...    │
│ │[image]   │ │[image]   │        │
│ │Title     │ │Title     │        │
│ └──────────┘ └──────────┘        │
│                                  │
└──────────────────────────────────┘
```

### 3. Sticky Header on Scroll
Same header stays at top when user scrolls feed.

## Technical Architecture

```
User Browser
    ↓
┌─────────────────┐
│ Landing Page    │ ← Animation (JS)
│ home.ejs        │   - Word flip
│ animations.js   │   - Collapse effect
└─────────────────┘
    ↓ (after animation)
┌─────────────────┐
│ Header + Feed   │
│ header.ejs      │
│ articles-grid   │
└─────────────────┘
    ↓
┌─────────────────┐      ┌────────────────┐
│ Express Server  │ ←→ │ PostgreSQL DB   │
│ (Node.js)       │      │ (RSS articles)  │
│ src/routes/     │      └────────────────┘
│   pages.js      │
└─────────────────┘
    ↓
┌─────────────────┐
│ RSS Feeds       │
│ (External URLs) │
└─────────────────┘
```

## Design System

### Colors
- **Primary Red**: #8B0000 (Burgundy) - Headlines, links, accents
- **Off-White**: #F5F1ED (Cream) - Background, body
- **Black**: #1a1a1a - Text, line accents
- **Gray**: #6B6B6B - Secondary text

### Typography
- **Display Font**: Crimson Text (serif)
  - Landing intro: 3.5rem
  - Section titles: 2.5rem
  - Header: 1.8rem
  
- **Body Font**: Lora (serif)
  - Article titles: 1.3rem
  - Body text: 1rem
  - Metadata: 0.85rem

### Spacing
- Grid gap: 20px
- Card padding: 20px
- Section padding: 40px
- Header padding: 15px

### Components

#### Landing Page Intro
```html
<div class="landing-container">
  <p class="intro-text">
    Hi, I'm Adrienne.<br>
    I've been <span class="word-flip"></span>
  </p>
  <div class="accent-line"></div>
</div>
```

#### Navigation Header
```html
<header class="site-header">
  <h1 class="site-title">Hi, I'm Adrienne</h1>
  <nav class="header-nav">
    <a href="/designing">designing</a>
    <a href="/developing">developing</a>
    <a href="/reading">reading</a>
    <a href="/writing">writing</a>
  </nav>
</header>
```

#### Article Card
```html
<article class="article-card">
  <a href="{{ article.url }}" class="article-link">
    <div class="article-image">
      <img src="{{ image }}" alt="{{ title }}">
    </div>
    <div class="article-content">
      <div class="article-meta">
        <span class="publication-name">Publication</span>
      </div>
      <h3 class="article-title">Article Title</h3>
      <p class="article-author">By Author Name</p>
      <div class="article-footer">
        <span class="publish-date">Date</span>
      </div>
    </div>
  </a>
</article>
```

## Data Flow

### 1. Page Load
```
GET / → Express server
      → Fetch all RSS feeds in parallel
      → Parse articles + extract images
      → Sort by publish date
      → Render home.ejs template
      → Return HTML + CSS + JS
```

### 2. Landing Animation
```
DOMContentLoaded event fires
      → cycles words (designing/developing/reading/writing)
      → every 1.5 seconds for 3 cycles
      → then collapses animation
      → shows main page content
```

### 3. Feed Display
```
Articles grid renders
      → Images load lazily
      → User hovers card → red border, shadow
      → User clicks → opens URL in new tab
      → User scrolls → header stays at top
```

## Current Routes

### Public Routes
- `GET /` - Landing page + RSS feed aggregator

### Placeholder Routes (Phase 2)
- `GET /designing` - 404 (not yet created)
- `GET /developing` - 404 (not yet created)
- `GET /reading` - 404 (not yet created)
- `GET /writing` - 404 (not yet created)

### No Admin/API Routes
- Removed for public-only site
- No authentication needed
- No user accounts

## RSS Feed Configuration

### Current Feeds (9 total)
1. TechCrunch
2. Hacker News
3. The Verge
4. Ars Technica
5. Wired
6. BBC News
7. New York Times
8. The Atlantic
9. The New Yorker

### Feed Management
Edit array in `src/routes/pages.js`:
```javascript
const rssFeeds = [
  'https://techcrunch.com/feed/',
  'https://hnrss.org/frontpage',
  // Add or remove URLs here
];
```

## Performance Considerations

### Optimizations
- Lazy load images in article grid
- Compress CSS (minify for production)
- Parallel RSS feed fetching
- Caching headers for static assets

### Potential Improvements (Phase 2)
- Cache RSS articles in database
- Background job for feed refresh every 30 min
- Image optimization/resizing
- CDN for static assets
- Minify JS + CSS
- Service worker for offline support

## Responsive Breakpoints

### Desktop (1200px+)
- 3-column grid
- Full header with navigation
- Sidebar optional

### Tablet (768px - 1199px)
- 2-column grid
- Full header
- Touch-friendly spacing

### Mobile (< 768px)
- 1-column stack
- Compact header
- Adjusted font sizes
- Touch-optimized spacing

## Deployment Strategy

### Local
```bash
npm run dev
# Runs on http://localhost:3000
```

### Production (Render)
```
Push to GitHub main branch
      → Render webhook triggers
      → npm install && npm run migrate
      → npm start
      → Live at yourdomain.com
```

## File Checklist

### Templates
- ✓ views/home.ejs
- ✓ views/partials/head.ejs
- ✓ views/partials/header.ejs
- ✓ views/partials/footer.ejs
- ✓ views/partials/articles-grid.ejs

### Styling
- ✓ public/css/style.css (400+ lines)

### JavaScript
- ✓ public/js/animations.js

### Backend
- ✓ src/server.js
- ✓ src/routes/pages.js
- ✓ src/config/migrations.js
- ✓ src/models/BookPost.js (legacy, unused)

### Configuration
- ✓ package.json
- ✓ render.yaml
- ✓ .env.example

### Documentation
- ✓ README.md
- ✓ DEPLOYMENT.md
- ✓ BUILD_STATUS.md
- ✓ SETUP_COMPLETE.md
- ✓ PROJECT_OVERVIEW.md (this file)

## Testing Strategy

### Unit Tests (Future)
- Article parsing from RSS
- Date formatting
- Image extraction

### Integration Tests (Future)
- RSS feed fetching
- Template rendering
- Database queries

### Manual Tests (Do Now)
- [ ] Landing animation works
- [ ] Animation cycles 3x then collapses
- [ ] Header appears with sticky behavior
- [ ] Articles load and display
- [ ] Images render correctly
- [ ] Mobile layout responsive
- [ ] No console errors
- [ ] Links open in new tab

## Success Metrics

### Performance
- Landing page loads < 2 seconds
- Animation smooth @ 60 FPS
- RSS feeds load < 5 seconds
- Mobile responsive @ all breakpoints

### User Experience
- Clear, minimal design
- Smooth animations
- Readable text (red on cream)
- Easy navigation
- Mobile-friendly

### Technical
- No JS errors
- Database healthy
- Logs clean
- Render metrics normal

## Glossary

| Term | Definition |
|------|-----------|
| RSS | Real Simple Syndication - feed format |
| EJS | JavaScript template engine |
| Express | Node.js web framework |
| PostgreSQL | Relational database |
| Render | Cloud deployment platform |
| DOM | Document Object Model (page structure) |
| Keyframe | CSS animation step |
| Serif | Font with decorative lines (Lora, Crimson Text) |

## Resources

- Express.js: https://expressjs.com/
- EJS: https://ejs.co/
- PostgreSQL: https://www.postgresql.org/
- Render: https://render.com/
- CSS: https://developer.mozilla.org/en-US/docs/Web/CSS

---

**Created**: Feb 20, 2026  
**Status**: Production Ready  
**Next Phase**: Build designing/developing/reading/writing portfolio pages
