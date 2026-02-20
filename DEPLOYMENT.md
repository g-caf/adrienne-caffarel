# Deployment Guide - Adrienne's Personal Website

## Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create .env file**
   ```bash
   cp .env.example .env
   ```

3. **Configure PostgreSQL database** (local development)
   ```bash
   # Create database
   createdb adrienne_personal_site
   
   # Set DATABASE_URL in .env
   DATABASE_URL=postgresql://username:password@localhost:5432/adrienne_personal_site
   ```

4. **Run migrations**
   ```bash
   npm run migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```
   
   Server will run on `http://localhost:3000`

## Deployment to Render

### Prerequisites
- GitHub account with repository
- Render account (https://render.com)

### Step 1: Push to GitHub
```bash
git remote add origin https://github.com/your-username/adrienne-personal-site.git
git push -u origin main
```

### Step 2: Create PostgreSQL Database on Render

1. Go to https://dashboard.render.com/
2. Click "New +"
3. Select "PostgreSQL"
4. Configure:
   - **Name**: `adrienne-personal-site-db`
   - **Database**: `adrienne_personal_site`
   - **User**: `adrienne_user`
   - **Plan**: Free (or paid tier if preferred)
   - **Region**: Oregon (or your preferred region)
5. Click "Create Database"
6. Note the internal connection URL (you'll need this for the web service)

### Step 3: Create Web Service on Render

1. Go to https://dashboard.render.com/
2. Click "New +"
3. Select "Web Service"
4. Configure:
   - **Name**: `adrienne-personal-site`
   - **Environment**: Node
   - **Build Command**: `npm install && npm run migrate`
   - **Start Command**: `npm start`
   - **Region**: Oregon (same as database)
   - **Plan**: Free or Starter (based on needs)
5. Click "Connect Repository" and select your GitHub repo
6. Under "Environment", add variables:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | (Internal connection string from PostgreSQL service) |
   | `PORT` | `3000` |

7. Click "Create Web Service"
8. Render will automatically deploy when you push to main branch

### Step 4: Add Custom Domain (Optional)

1. In Render dashboard, go to your web service
2. Click "Settings"
3. Under "Custom Domain", add your domain
4. Follow DNS configuration instructions

### Step 5: Monitor Deployment

1. Check deployment status in Render dashboard
2. View logs by clicking "Logs" tab
3. Test site at provided URL

## Environment Variables Reference

**Production (Render)**:
- `NODE_ENV=production`
- `DATABASE_URL=postgresql://...` (auto-set by Render)
- `PORT=3000`

**Local Development**:
- `NODE_ENV=development`
- `DATABASE_URL=postgresql://user:password@localhost:5432/adrienne_personal_site`
- `PORT=3000`
- `LOG_LEVEL=info`

## Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check IP allowlist if using PostgreSQL
- Ensure migrations ran successfully

### Build Failures
- Check build logs in Render dashboard
- Verify all dependencies in package.json
- Ensure Node version is compatible

### Feed Parsing Errors
- Check RSS feed URLs in `src/routes/pages.js`
- Verify feeds are accessible from Render servers
- Check error logs for specific feed failures

## Updating the Site

1. Make changes locally
2. Test with `npm run dev`
3. Commit and push to GitHub
4. Render auto-deploys on push to main branch

## Database Migrations

To create new migrations:

```bash
# Create migration file
npm run migrate -- create-table

# Run all pending migrations
npm run migrate
```

Migration files should be in `data/migrations/` directory.

## Monitoring

Check logs in Render dashboard for:
- Application errors
- Feed parsing issues
- Database connection status

## Rollback

To rollback to a previous version:
1. Go to Render dashboard
2. Find the deployment you want to rollback to
3. Click "Rollback" button
4. Confirm the action

Render will re-deploy the previous version automatically.
