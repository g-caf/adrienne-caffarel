const fs = require('fs');
const path = require('path');
const LibraryItem = require('../models/LibraryItem');
const logger = require('../utils/logger');

const DEFAULT_SYNC_MINUTES = 60;
const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const metadataPath = path.join(__dirname, '../../data/library-metadata.json');

let lastSyncStartedAt = 0;
let lastSyncCompletedAt = null;
let lastSyncError = null;
let syncInFlight = null;

function stripPdfExtension(name) {
  return name ? name.replace(/\.pdf$/i, '').trim() : name;
}

function getConfig() {
  return {
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    apiKey: process.env.GOOGLE_DRIVE_API_KEY,
    intervalMs: (Number(process.env.LIBRARY_SYNC_INTERVAL_MINUTES) || DEFAULT_SYNC_MINUTES) * 60 * 1000
  };
}

function loadMetadataOverrides() {
  try {
    if (!fs.existsSync(metadataPath)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    logger.warn('Failed to parse library metadata overrides. Continuing without overrides.', error.message);
    return {};
  }
}

async function fetchDriveFiles({ folderId, apiKey }) {
  const files = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      key: apiKey,
      q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: 'nextPageToken,files(id,name,webViewLink,thumbnailLink,owners(displayName),mimeType,modifiedTime,size)',
      orderBy: 'name',
      pageSize: '1000',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true'
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE}?${params.toString()}`);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Drive API error (${response.status}): ${body}`);
    }

    const payload = await response.json();
    if (Array.isArray(payload.files)) {
      files.push(...payload.files);
    }
    pageToken = payload.nextPageToken || null;
  } while (pageToken);

  return files;
}

function normalizeDriveFile(file, overrides) {
  const fileOverride = overrides[file.id] || {};
  const ownerName = file.owners && file.owners[0] ? file.owners[0].displayName : null;

  return {
    drive_file_id: file.id,
    title: fileOverride.title || stripPdfExtension(file.name) || 'Untitled',
    author: fileOverride.author || ownerName || null,
    cover_image_url: fileOverride.cover_image_url || file.thumbnailLink || null,
    web_view_link: fileOverride.web_view_link || file.webViewLink,
    mime_type: file.mimeType || null,
    modified_time: file.modifiedTime || null,
    file_size: file.size ? Number(file.size) : null,
    sort_order: Number.isFinite(fileOverride.sort_order) ? fileOverride.sort_order : null
  };
}

function sortLibraryItems(items) {
  return items.sort((a, b) => {
    if (a.sort_order !== null && b.sort_order !== null) {
      return a.sort_order - b.sort_order;
    }
    if (a.sort_order !== null) return -1;
    if (b.sort_order !== null) return 1;
    return a.title.localeCompare(b.title);
  });
}

async function syncLibraryFromDrive() {
  const { folderId, apiKey } = getConfig();

  if (!folderId || !apiKey) {
    return {
      synced: false,
      reason: 'missing_drive_config',
      message: 'Set GOOGLE_DRIVE_FOLDER_ID and GOOGLE_DRIVE_API_KEY to enable library sync.'
    };
  }

  const overrides = loadMetadataOverrides();
  const driveFiles = await fetchDriveFiles({ folderId, apiKey });
  const normalizedItems = sortLibraryItems(
    driveFiles.map((file) => normalizeDriveFile(file, overrides))
  );

  await LibraryItem.upsertMany(normalizedItems);
  await LibraryItem.deleteMissingDriveIds(normalizedItems.map((item) => item.drive_file_id));

  return {
    synced: true,
    count: normalizedItems.length
  };
}

async function ensureLibrarySynced({ force = false } = {}) {
  const { intervalMs } = getConfig();
  const now = Date.now();
  const shouldSkip = !force && lastSyncStartedAt && now - lastSyncStartedAt < intervalMs;

  if (shouldSkip) {
    return {
      synced: false,
      skipped: true,
      lastSyncCompletedAt,
      lastSyncError
    };
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  lastSyncStartedAt = now;
  syncInFlight = syncLibraryFromDrive()
    .then((result) => {
      if (result.synced) {
        lastSyncCompletedAt = new Date();
        lastSyncError = null;
        logger.info(`Library sync completed. Synced ${result.count} items.`);
      } else if (result.reason === 'missing_drive_config') {
        logger.warn(result.message);
      }
      return result;
    })
    .catch((error) => {
      lastSyncError = error.message;
      logger.error('Library sync failed:', error.message);
      return {
        synced: false,
        error: true,
        message: error.message
      };
    })
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
}

function getLibrarySyncStatus() {
  return {
    lastSyncCompletedAt,
    lastSyncError
  };
}

module.exports = {
  ensureLibrarySynced,
  getLibrarySyncStatus
};
