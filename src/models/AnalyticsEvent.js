const db = require('../config/database-sqlite');
const logger = require('../utils/logger');

function toNumber(value) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : 0;
}

function getSinceClause(paramIndex = 1) {
  if (db.usePostgres) {
    return `created_at >= NOW() - ($${paramIndex}::int * INTERVAL '1 day')`;
  }
  return `datetime(created_at) >= datetime('now', '-' || $${paramIndex} || ' days')`;
}

function getDayExpr() {
  return db.usePostgres
    ? `TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
    : `strftime('%Y-%m-%d', created_at)`;
}

class AnalyticsEvent {
  static async createPageview(payload) {
    try {
      const sql = db.usePostgres
        ? `INSERT INTO analytics_events (
             event_type,
             event_name,
             path,
             referrer_host,
             source,
             utm_source,
             utm_medium,
             utm_campaign,
             visitor_id,
             session_id,
             device_type,
             user_agent,
             metadata
           ) VALUES (
             $1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
           )`
        : `INSERT INTO analytics_events (
             event_type,
             event_name,
             path,
             referrer_host,
             source,
             utm_source,
             utm_medium,
             utm_campaign,
             visitor_id,
             session_id,
             device_type,
             user_agent,
             metadata
           ) VALUES (
             ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           )`;

      await db.query(sql, [
        'pageview',
        payload.path,
        payload.referrerHost || null,
        payload.source || 'direct',
        payload.utm_source || null,
        payload.utm_medium || null,
        payload.utm_campaign || null,
        payload.visitorId || null,
        payload.sessionId || null,
        payload.deviceType || 'unknown',
        payload.userAgent || null,
        payload.metadata ? JSON.stringify(payload.metadata) : null
      ]);
    } catch (error) {
      logger.error('Error creating analytics pageview:', error);
    }
  }

  static async createEvent(payload) {
    try {
      const sql = db.usePostgres
        ? `INSERT INTO analytics_events (
             event_type,
             event_name,
             path,
             referrer_host,
             source,
             utm_source,
             utm_medium,
             utm_campaign,
             visitor_id,
             session_id,
             device_type,
             user_agent,
             metadata
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
           )`
        : `INSERT INTO analytics_events (
             event_type,
             event_name,
             path,
             referrer_host,
             source,
             utm_source,
             utm_medium,
             utm_campaign,
             visitor_id,
             session_id,
             device_type,
             user_agent,
             metadata
           ) VALUES (
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           )`;

      await db.query(sql, [
        'event',
        payload.eventName,
        payload.path,
        payload.referrerHost || null,
        payload.source || 'direct',
        payload.utm_source || null,
        payload.utm_medium || null,
        payload.utm_campaign || null,
        payload.visitorId || null,
        payload.sessionId || null,
        payload.deviceType || 'unknown',
        payload.userAgent || null,
        payload.metadata ? JSON.stringify(payload.metadata) : null
      ]);
    } catch (error) {
      logger.error('Error creating analytics event:', error);
    }
  }

  static async getDashboard(days = 30) {
    const safeDays = Math.min(Math.max(toNumber(days) || 30, 1), 365);
    const sinceClause = getSinceClause(1);

    const summaryResult = await db.query(
      `SELECT
         COUNT(*) AS total_pageviews,
         COUNT(DISTINCT visitor_id) AS unique_visitors,
         COUNT(DISTINCT session_id) AS total_sessions
       FROM analytics_events
       WHERE event_type = 'pageview' AND ${sinceClause}`,
      [safeDays]
    );

    const topPagesResult = await db.query(
      `SELECT
         path,
         COUNT(*) AS views,
         COUNT(DISTINCT visitor_id) AS unique_visitors
       FROM analytics_events
       WHERE event_type = 'pageview'
         AND ${sinceClause}
       GROUP BY path
       ORDER BY views DESC
       LIMIT 12`,
      [safeDays]
    );

    const sourcesResult = await db.query(
      `SELECT
         COALESCE(NULLIF(source, ''), 'direct') AS source,
         COUNT(*) AS visits
       FROM analytics_events
       WHERE event_type = 'pageview'
         AND ${sinceClause}
       GROUP BY source
       ORDER BY visits DESC
       LIMIT 10`,
      [safeDays]
    );

    const referrersResult = await db.query(
      `SELECT
         referrer_host,
         COUNT(*) AS visits
       FROM analytics_events
       WHERE event_type = 'pageview'
         AND ${sinceClause}
         AND COALESCE(referrer_host, '') <> ''
       GROUP BY referrer_host
       ORDER BY visits DESC
       LIMIT 10`,
      [safeDays]
    );

    const devicesResult = await db.query(
      `SELECT
         COALESCE(NULLIF(device_type, ''), 'unknown') AS device,
         COUNT(*) AS visits
       FROM analytics_events
       WHERE event_type = 'pageview'
         AND ${sinceClause}
       GROUP BY device
       ORDER BY visits DESC`,
      [safeDays]
    );

    const dailyResult = await db.query(
      `SELECT
         ${getDayExpr()} AS day,
         COUNT(*) AS views
       FROM analytics_events
       WHERE event_type = 'pageview'
         AND ${sinceClause}
       GROUP BY day
       ORDER BY day ASC`,
      [safeDays]
    );

    const hubViewsResult = await db.query(
      `SELECT
         path,
         COUNT(*) AS views
       FROM analytics_events
       WHERE event_type = 'pageview'
         AND ${sinceClause}
         AND path LIKE '/topics/%'
       GROUP BY path
       ORDER BY views DESC
       LIMIT 20`,
      [safeDays]
    );

    const hubClicksResult = await db.query(
      `SELECT
         path,
         COUNT(*) AS outbound_clicks
       FROM analytics_events
       WHERE event_type = 'event'
         AND event_name = 'outbound_click'
         AND ${sinceClause}
         AND path LIKE '/topics/%'
       GROUP BY path`,
      [safeDays]
    );

    const writingFunnelResult = await db.query(
      `SELECT
         SUM(CASE WHEN event_type = 'pageview' AND path = '/writing' THEN 1 ELSE 0 END) AS writing_views,
         SUM(CASE WHEN event_type = 'event' AND event_name = 'writing_gate_view' THEN 1 ELSE 0 END) AS gate_views,
         SUM(CASE WHEN event_type = 'event' AND event_name = 'writing_unlock_success' THEN 1 ELSE 0 END) AS unlocks
       FROM analytics_events
       WHERE ${sinceClause}`,
      [safeDays]
    );

    const writingSubmissionsResult = await db.query(
      `SELECT COUNT(*) AS submissions
       FROM writing_submissions
       WHERE ${getSinceClause(1)}`,
      [safeDays]
    );

    const summaryRow = summaryResult.rows[0] || {};
    const totalPageviews = toNumber(summaryRow.total_pageviews);
    const totalSessions = toNumber(summaryRow.total_sessions);

    const hubClickMap = new Map(
      (hubClicksResult.rows || []).map((row) => [row.path, toNumber(row.outbound_clicks)])
    );

    const hubs = (hubViewsResult.rows || []).map((row) => {
      const views = toNumber(row.views);
      const outbound = hubClickMap.get(row.path) || 0;
      const ctr = views > 0 ? Math.round((outbound / views) * 1000) / 10 : 0;
      return {
        path: row.path,
        views,
        outbound_clicks: outbound,
        ctr
      };
    });

    const funnel = writingFunnelResult.rows[0] || {};
    const writingViews = toNumber(funnel.writing_views);
    const gateViews = toNumber(funnel.gate_views);
    const unlocks = toNumber(funnel.unlocks);
    const submissions = toNumber((writingSubmissionsResult.rows[0] || {}).submissions);

    return {
      days: safeDays,
      summary: {
        totalPageviews,
        uniqueVisitors: toNumber(summaryRow.unique_visitors),
        totalSessions,
        avgPagesPerSession: totalSessions > 0
          ? Math.round((totalPageviews / totalSessions) * 100) / 100
          : 0
      },
      daily: (dailyResult.rows || []).map((row) => ({
        day: row.day,
        views: toNumber(row.views)
      })),
      topPages: (topPagesResult.rows || []).map((row) => ({
        path: row.path,
        views: toNumber(row.views),
        uniqueVisitors: toNumber(row.unique_visitors)
      })),
      sources: (sourcesResult.rows || []).map((row) => ({
        source: row.source,
        visits: toNumber(row.visits)
      })),
      referrers: (referrersResult.rows || []).map((row) => ({
        referrer_host: row.referrer_host,
        visits: toNumber(row.visits)
      })),
      devices: (devicesResult.rows || []).map((row) => ({
        device: row.device,
        visits: toNumber(row.visits)
      })),
      hubs,
      writingFunnel: {
        writingViews,
        gateViews,
        unlocks,
        submissions,
        gateRate: writingViews > 0 ? Math.round((gateViews / writingViews) * 1000) / 10 : 0,
        unlockRate: gateViews > 0 ? Math.round((unlocks / gateViews) * 1000) / 10 : 0,
        submitRate: unlocks > 0 ? Math.round((submissions / unlocks) * 1000) / 10 : 0
      }
    };
  }
}

module.exports = AnalyticsEvent;
