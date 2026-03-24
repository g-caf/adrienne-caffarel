const db = require('../config/database-sqlite');
const logger = require('../utils/logger');

class BuildingBlock {
  static async findAllOrdered() {
    try {
      const query = db.usePostgres
        ? `SELECT id, slug, type, content, sort_order, is_visible, created_at, updated_at
           FROM building_blocks
           ORDER BY sort_order ASC, id ASC`
        : `SELECT id, slug, type, content, sort_order, is_visible, created_at, updated_at
           FROM building_blocks
           ORDER BY sort_order ASC, id ASC`;

      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching building blocks:', error);
      throw error;
    }
  }

  static async findBySlug(slug) {
    try {
      const query = db.usePostgres
        ? `SELECT id, slug, type, content, sort_order, is_visible, created_at, updated_at
           FROM building_blocks
           WHERE slug = $1`
        : `SELECT id, slug, type, content, sort_order, is_visible, created_at, updated_at
           FROM building_blocks
           WHERE slug = ?`;
      const result = await db.query(query, [slug]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching building block by slug:', error);
      throw error;
    }
  }

  static async updateContent(slug, content) {
    try {
      const query = db.usePostgres
        ? `UPDATE building_blocks
           SET content = $1, updated_at = CURRENT_TIMESTAMP
           WHERE slug = $2
           RETURNING id, slug, type, content, sort_order, is_visible, created_at, updated_at`
        : `UPDATE building_blocks
           SET content = ?, updated_at = CURRENT_TIMESTAMP
           WHERE slug = ?`;

      const result = await db.query(query, [content, slug]);
      if (db.usePostgres) {
        return result.rows[0] || null;
      }

      const getResult = await db.query(
        `SELECT id, slug, type, content, sort_order, is_visible, created_at, updated_at
         FROM building_blocks
         WHERE slug = ?`,
        [slug]
      );
      return getResult.rows[0] || null;
    } catch (error) {
      logger.error('Error updating building block content:', error);
      throw error;
    }
  }

  static async updateOrder(slugOrder) {
    try {
      for (let i = 0; i < slugOrder.length; i += 1) {
        const slug = slugOrder[i];
        const sortOrder = i + 1;
        const query = db.usePostgres
          ? `UPDATE building_blocks
             SET sort_order = $1, updated_at = CURRENT_TIMESTAMP
             WHERE slug = $2`
          : `UPDATE building_blocks
             SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
             WHERE slug = ?`;
        await db.query(query, [sortOrder, slug]);
      }
      return true;
    } catch (error) {
      logger.error('Error updating building block order:', error);
      throw error;
    }
  }
}

module.exports = BuildingBlock;
