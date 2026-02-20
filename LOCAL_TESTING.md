# Local Testing Guide

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- PostgreSQL (or SQLite for quick testing)
- Git

## Setup (5 minutes)

### 1. Install Dependencies
```bash
cd /path/to/adrienne-personal-site
npm install
```

This installs:
- express (web framework)
- ejs (templates)
- rss-parser (RSS feeds)
- pg (PostgreSQL driver)
- nodemon (auto-reload)
- Other dependencies

### 2. Configure Environment

Option A: **Use SQLite (quickest for testing)**
```bash
cp .env.example .env
# Leave DATABASE_URL blank - app will use SQLite
```

Option B: **Use PostgreSQL**
```bash
# Create database
createdb adrienne_personal_site

# Update .env
cp .env.example .env
```

Edit `.env`:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://username:password@localhost:5432/adrienne_personal_site
LOG_LEVEL=info
```

### 3. Run Migrations
```bash
npm run migrate
```

You should see:
```
book_posts table created or already exists
Migrations completed successfully
```

### 4. Start Development Server
```bash
npm run dev
```

You should see:
```
Server started on port 3000
```

## Testing the Site (5 minutes)

### 1. Open in Browser
Visit: http://localhost:3000

You should see:
- **Landing page** with "Hi, I'm Adrienne. I've been [blank]"
- Black line accent below text
- Red text (burgundy #8B0000)
- Off-white cream background

### 2. Watch Landing Animation
- Watch words cycle: designing → developing → reading → writing
- Each word appears for ~1.5 seconds
- Animation runs 3 times total (~4.5 seconds per cycle)
- After 3 cycles, page smoothly collapses

### 3. Main Page After Animation
After animation completes:
- **Sticky header** appears at top with "Hi, I'm Adrienne"
- Red text header with navigation links
- Navigation shows: designing | developing | reading | writing
- **"What's happening" section** displays RSS feed grid
- Article cards display in responsive grid (3 columns on desktop)

### 4. Article Cards
Each card shows:
- [ ] Article image (if available)
- [ ] Publication name (red uppercase text)
- [ ] Article title (black serif font, medium size)
- [ ] Author name (gray text, smaller)
- [ ] Published date (gray text)
- [ ] Card has subtle border and shadow
- [ ] Hover effect: red border, shadow increases

### 5. Responsive Testing

**Desktop (1200px+)**
```bash
# Open DevTools: F12
# Keep full width
# Should see 3-column grid
```

**Tablet (768px - 1199px)**
```bash
# DevTools → Toggle device toolbar
# Select iPad or custom 768px width
# Should see 2-column grid
```

**Mobile (< 768px)**
```bash
# DevTools → Toggle device toolbar  
# Select iPhone 12 or custom 375px width
# Should see 1-column stack
# Header should be compact
```

### 6. Browser Console
```bash
# Open DevTools: F12
# Click "Console" tab
# You should see NO errors
# You might see "Server started on port 3000" message
```

## Testing Checklist

Run through these tests:

### Landing Animation
- [ ] Page loads with intro text
- [ ] Black line accent displays
- [ ] Text is red (#8B0000)
- [ ] Background is off-white (#F5F1ED)
- [ ] Words cycle: designing → developing → reading → writing
- [ ] Each word displays for ~1.5 seconds
- [ ] Animation cycles 3 times
- [ ] Animation smoothly collapses
- [ ] No console errors during animation

### Main Page Content
- [ ] Header appears after animation
- [ ] Header text says "Hi, I'm Adrienne"
- [ ] Header text is red
- [ ] Navigation shows 4 links (designing, developing, reading, writing)
- [ ] "What's happening" title displays
- [ ] Article grid displays below title
- [ ] Header stays sticky when scrolling
- [ ] Header changes style on scroll (smaller padding)

### Article Cards
- [ ] Cards display in grid layout
- [ ] Cards show article images (if available)
- [ ] Cards show publication name in red uppercase
- [ ] Cards show article title in serif font
- [ ] Cards show author name in gray
- [ ] Cards show publish date
- [ ] Cards have subtle borders
- [ ] Cards have hover effects (red border, shadow)
- [ ] Cards open links in new tab on click

### Responsive Design
- [ ] Desktop: 3-column grid
- [ ] Tablet: 2-column grid
- [ ] Mobile: 1-column stack
- [ ] Text readable on all sizes
- [ ] Images scale properly
- [ ] No horizontal scrolling

### Performance
- [ ] Page loads in < 3 seconds
- [ ] Animation plays smoothly (60 FPS)
- [ ] No lag when scrolling
- [ ] No memory leaks (DevTools Performance tab)

### Links & Navigation
- [ ] "Hi, I'm Adrienne" links to home
- [ ] "designing" link points to /designing (will 404)
- [ ] "developing" link points to /developing (will 404)
- [ ] "reading" link points to /reading (will 404)
- [ ] "writing" link points to /writing (will 404)
- [ ] Article links open in new tab
- [ ] Article links work (point to real URLs)

### Styling
- [ ] Text is red (#8B0000) where expected
- [ ] Background is off-white (#F5F1ED)
- [ ] Black line accent displays
- [ ] Font is serif (Crimson Text, Lora)
- [ ] Spacing looks balanced
- [ ] No layout shifts or jumps

## Troubleshooting

### Port Already in Use
```bash
# If port 3000 is in use:
PORT=3001 npm run dev

# Or kill process on port 3000:
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432

# Solution: Start PostgreSQL
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql

# Windows
# Search "Services" → Start PostgreSQL
```

### Module Not Found
```bash
npm install
npm run migrate
```

### Port Not Binding
```bash
# Check if Express is listening
# You should see: "Server started on port 3000"

# If not, check src/server.js for errors
npm run dev
```

### RSS Feeds Not Loading
```
# This is normal - check:
# 1. Network tab in DevTools
# 2. Check URLs in src/routes/pages.js
# 3. Feed URLs must be accessible from your network
# 4. Some feeds block automated requests
```

### Animation Not Playing
```
# Check:
# 1. DevTools Console for JS errors
# 2. public/js/animations.js is loaded
# 3. Browser supports CSS animations
# 4. Clear browser cache (Ctrl+Shift+Del)
```

## Manual Testing Workflow

1. **Start server**
   ```bash
   npm run dev
   ```

2. **Open browser**
   - http://localhost:3000

3. **Watch animation**
   - Let it run through all cycles
   - Observe smooth collapse

4. **Check main page**
   - Scroll and verify sticky header
   - Test responsive design
   - Check article cards

5. **Open DevTools**
   - Console tab: no errors
   - Network tab: feeds load
   - Performance tab: smooth animations

6. **Test on mobile**
   - DevTools → Device Emulation
   - Test iPhone, iPad, Android

7. **Stop server**
   ```bash
   Ctrl + C
   ```

## Testing Different Scenarios

### Scenario 1: Fast Connection
- Should load in < 2 seconds
- Articles appear quickly
- Images load smoothly

### Scenario 2: Slow Connection
- Simulate in DevTools → Network → Slow 3G
- Page should still render
- Images lazy-load as user scrolls

### Scenario 3: No Images
- Some RSS feeds don't provide images
- Cards should still display with gradient background
- Layout shouldn't break

### Scenario 4: Long Titles
- Article titles that wrap to multiple lines
- Cards should expand to fit content
- Layout should remain aligned

### Scenario 5: Mobile Device
- Test on actual phone/tablet if possible
- Touch interactions should work
- Text should be readable without zoom

## Debugging Tips

### View Network Requests
```bash
# DevTools → Network tab
# See all RSS feed requests
# Check which feeds load successfully
# Check response sizes
```

### Check Element Inspector
```bash
# DevTools → Inspector tab
# Click element picker (↖️ icon)
# Click on article card
# See CSS classes and styles applied
# Check for layout issues
```

### Monitor Console
```bash
# DevTools → Console tab
# Watch for JavaScript errors
# Check for warnings
# Verify animations firing
```

### Performance Profiling
```bash
# DevTools → Performance tab
# Click Record
# Scroll, hover, interact
# Click Stop
# Analyze frame rate and rendering
```

## Performance Testing

### Check FPS (Frames Per Second)
```bash
# DevTools → Performance
# Should maintain 60 FPS
# No dropped frames during animation
```

### Check Load Time
```bash
# DevTools → Network tab
# Total page load: < 3 seconds
# DOM Ready: < 1 second
# Animation start: immediate
```

### Check Memory
```bash
# DevTools → Memory tab
# Heap size: < 50 MB
# No memory leaks (heap doesn't grow)
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Animation doesn't play | Clear cache, check animations.js loaded |
| Feeds don't load | Check URLs in pages.js, network connectivity |
| Mobile layout breaks | Check viewport meta tag, CSS media queries |
| Header not sticky | Verify sticky positioning in CSS |
| Red text not showing | Check color code #8B0000 in CSS |
| Font looks wrong | Verify @import in style.css loads |
| Links broken | Check href attributes in templates |
| Images not showing | Check lazy loading, image URLs from RSS |

## Getting Help

If something doesn't work:

1. **Check the console**: DevTools → Console tab
2. **Check the logs**: Terminal output from `npm run dev`
3. **Check the network**: DevTools → Network tab
4. **Check the code**: Review relevant files
5. **Read documentation**: See README.md, BUILD_STATUS.md

## Next Steps

Once testing is complete:

1. **Commit changes**
   ```bash
   git add .
   git commit -m "Initial site build complete"
   ```

2. **Push to GitHub**
   ```bash
   git push origin main
   ```

3. **Deploy to Render**
   See DEPLOYMENT.md for instructions

---

**Testing Guide Version**: 1.0  
**Last Updated**: Feb 20, 2026  
**Expected Time**: 5-10 minutes
