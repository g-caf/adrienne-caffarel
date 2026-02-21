const db = require('../config/database-sqlite');
const logger = require('../utils/logger');

class LibraryItem {
  static async findAll(orderBy = 'title ASC') {
    try {
      const query = `SELECT * FROM library_items ORDER BY ${orderBy}`;
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching library items:', error);
      throw error;
    }
  }

  static async upsertMany(items) {
    for (const item of items) {
      await this.upsert(item);
    }
  }

  static async upsert({
    drive_file_id,
    title,
    author = null,
    cover_image_url = null,
    web_view_link,
    mime_type = null,
    modified_time = null,
    file_size = null,
    sort_order = null
  }) {
    try {
      const query = db.usePostgres
        ? `
          INSERT INTO library_items (
            drive_file_id, title, author, cover_image_url, web_view_link, mime_type, modified_time, file_size, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (drive_file_id) DO UPDATE SET
            title = EXCLUDED.title,
            author = EXCLUDED.author,
            cover_image_url = EXCLUDED.cover_image_url,
            web_view_link = EXCLUDED.web_view_link,
            mime_type = EXCLUDED.mime_type,
            modified_time = EXCLUDED.modified_time,
            file_size = EXCLUDED.file_size,
            sort_order = EXCLUDED.sort_order,
            updated_at = CURRENT_TIMESTAMP
        `
        : `
          INSERT INTO library_items (
            drive_file_id, title, author, cover_image_url, web_view_link, mime_type, modified_time, file_size, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(drive_file_id) DO UPDATE SET
            title = excluded.title,
            author = excluded.author,
            cover_image_url = excluded.cover_image_url,
            web_view_link = excluded.web_view_link,
            mime_type = excluded.mime_type,
            modified_time = excluded.modified_time,
            file_size = excluded.file_size,
            sort_order = excluded.sort_order,
            updated_at = CURRENT_TIMESTAMP
        `;

      await db.query(query, [
        drive_file_id,
        title,
        author,
        cover_image_url,
        web_view_link,
        mime_type,
        modified_time,
        file_size,
        sort_order
      ]);
    } catch (error) {
      logger.error('Error upserting library item:', error);
      throw error;
    }
  }

  static async deleteMissingDriveIds(driveFileIds) {
    try {
      if (!Array.isArray(driveFileIds) || driveFileIds.length === 0) {
        await db.query('DELETE FROM library_items');
        return;
      }

      if (db.usePostgres) {
        const placeholders = driveFileIds.map((_, idx) => `$${idx + 1}`).join(', ');
        const query = `DELETE FROM library_items WHERE drive_file_id NOT IN (${placeholders})`;
        await db.query(query, driveFileIds);
        return;
      }

      const placeholders = driveFileIds.map(() => '?').join(', ');
      const query = `DELETE FROM library_items WHERE drive_file_id NOT IN (${placeholders})`;
      await db.query(query, driveFileIds);
    } catch (error) {
      logger.error('Error deleting stale library items:', error);
      throw error;
    }
  }
}

module.exports = LibraryItem;
