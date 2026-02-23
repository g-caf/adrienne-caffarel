const db = require('../config/database-sqlite');
const logger = require('../utils/logger');

class WritingSubmission {
  static async create({ first_name, last_name, email, source_ip = null, user_agent = null }) {
    try {
      const query = db.usePostgres
        ? `INSERT INTO writing_submissions (first_name, last_name, email, source_ip, user_agent)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`
        : `INSERT INTO writing_submissions (first_name, last_name, email, source_ip, user_agent)
           VALUES (?, ?, ?, ?, ?)`;

      const result = await db.query(query, [first_name, last_name, email, source_ip, user_agent]);

      if (db.usePostgres) {
        return result.rows[0];
      }

      const getResult = await db.query('SELECT * FROM writing_submissions WHERE id = ?', [result.lastID]);
      return getResult.rows[0];
    } catch (error) {
      logger.error('Error creating writing submission:', error);
      throw error;
    }
  }

  static async findRecent(limit = 250) {
    try {
      const safeLimit = Number.isFinite(Number(limit))
        ? Math.min(Math.max(parseInt(limit, 10), 1), 1000)
        : 250;

      const query = db.usePostgres
        ? `SELECT id, first_name, last_name, email, source_ip, user_agent, created_at
           FROM writing_submissions
           ORDER BY created_at DESC
           LIMIT $1`
        : `SELECT id, first_name, last_name, email, source_ip, user_agent, created_at
           FROM writing_submissions
           ORDER BY datetime(created_at) DESC
           LIMIT ?`;

      const result = await db.query(query, [safeLimit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching writing submissions:', error);
      throw error;
    }
  }
}

module.exports = WritingSubmission;
