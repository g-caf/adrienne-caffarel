const db = require('../config/database-sqlite');
const logger = require('../utils/logger');

class WritingEntry {
  static async findRecentBySection(section, limit = 50) {
    try {
      const safeLimit = Number.isFinite(Number(limit))
        ? Math.min(Math.max(parseInt(limit, 10), 1), 500)
        : 50;

      const query = db.usePostgres
        ? `SELECT id, section, body, created_at, updated_at
           FROM writing_entries
           WHERE section = $1
           ORDER BY created_at DESC
           LIMIT $2`
        : `SELECT id, section, body, created_at, updated_at
           FROM writing_entries
           WHERE section = ?
           ORDER BY datetime(created_at) DESC
           LIMIT ?`;

      const result = await db.query(query, [section, safeLimit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching writing entries by section:', error);
      throw error;
    }
  }

  static async findLatestBySection(section) {
    try {
      const query = db.usePostgres
        ? `SELECT id, section, body, created_at, updated_at
           FROM writing_entries
           WHERE section = $1
           ORDER BY created_at DESC
           LIMIT 1`
        : `SELECT id, section, body, created_at, updated_at
           FROM writing_entries
           WHERE section = ?
           ORDER BY datetime(created_at) DESC
           LIMIT 1`;

      const result = await db.query(query, [section]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching latest writing entry:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const query = db.usePostgres
        ? `SELECT id, section, body, created_at, updated_at
           FROM writing_entries
           WHERE id = $1`
        : `SELECT id, section, body, created_at, updated_at
           FROM writing_entries
           WHERE id = ?`;
      const result = await db.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching writing entry by id:', error);
      throw error;
    }
  }

  static async create({ section, body }) {
    try {
      const query = db.usePostgres
        ? `INSERT INTO writing_entries (section, body)
           VALUES ($1, $2)
           RETURNING id, section, body, created_at, updated_at`
        : `INSERT INTO writing_entries (section, body)
           VALUES (?, ?)`;

      const result = await db.query(query, [section, body]);

      if (db.usePostgres) {
        return result.rows[0];
      }

      const getResult = await db.query(
        'SELECT id, section, body, created_at, updated_at FROM writing_entries WHERE id = ?',
        [result.lastID]
      );
      return getResult.rows[0] || null;
    } catch (error) {
      logger.error('Error creating writing entry:', error);
      throw error;
    }
  }

  static async update(id, { body }) {
    try {
      const query = db.usePostgres
        ? `UPDATE writing_entries
           SET body = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING id, section, body, created_at, updated_at`
        : `UPDATE writing_entries
           SET body = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`;

      const result = await db.query(query, [body, id]);

      if (db.usePostgres) {
        return result.rows[0] || null;
      }

      const getResult = await db.query(
        'SELECT id, section, body, created_at, updated_at FROM writing_entries WHERE id = ?',
        [id]
      );
      return getResult.rows[0] || null;
    } catch (error) {
      logger.error('Error updating writing entry:', error);
      throw error;
    }
  }
}

module.exports = WritingEntry;
