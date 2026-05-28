const fs = require('fs');
const path = require('path');
const LibraryItem = require('../models/LibraryItem');
const logger = require('../utils/logger');

const DEFAULT_SYNC_MINUTES = 60;
const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut';
const PDF_MIME_TYPE = 'application/pdf';
const LIBRARY_MIME_TYPES = new Set([
  PDF_MIME_TYPE,
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing'
]);
const metadataPath = path.join(__dirname, '../../data/library-metadata.json');

let lastSyncStartedAt = 0;
let lastSyncCompletedAt = null;
let lastSyncError = null;
let lastSyncDetails = null;
let syncInFlight = null;

function stripPdfExtension(name) {
  return name ? name.replace(/\.pdf$/i, '').trim() : name;
}

function extractDriveFolderId(value) {
  const input = (value || '').trim();
  if (!input) return '';

  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  return input;
}

function parseFolderIds(value) {
  return Array.from(new Set(
    (value || '')
      .split(',')
      .map(extractDriveFolderId)
      .filter(Boolean)
  ));
}

function isLibraryFile(file) {
  return file && LIBRARY_MIME_TYPES.has(file.mimeType);
}

function normalizeShortcut(file) {
  if (!file || file.mimeType !== SHORTCUT_MIME_TYPE || !file.shortcutDetails) {
    return file;
  }

  return {
    ...file,
    id: file.shortcutDetails.targetId || file.id,
    mimeType: file.shortcutDetails.targetMimeType || file.mimeType
  };
}

function getConfig() {
  const folderIds = parseFolderIds(
    process.env.GOOGLE_DRIVE_FOLDER_IDS || process.env.GOOGLE_DRIVE_FOLDER_ID
  );

  return {
    folderIds,
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

async function fetchFilesInFolder({ folderId, apiKey }) {
  const files = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      key: apiKey,
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,webViewLink,thumbnailLink,iconLink,owners(displayName),mimeType,modifiedTime,size,shortcutDetails(targetId,targetMimeType))',
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

async function fetchDriveLibraryFilesRecursive({ rootFolderId, apiKey }) {
  const queue = [rootFolderId];
  const visited = new Set();
  const libraryFiles = [];

  while (queue.length > 0) {
    const currentFolderId = queue.shift();
    if (!currentFolderId || visited.has(currentFolderId)) {
      continue;
    }
    visited.add(currentFolderId);

    const files = await fetchFilesInFolder({ folderId: currentFolderId, apiKey });

    for (const rawFile of files) {
      const file = normalizeShortcut(rawFile);
      if (!file || !file.mimeType) continue;

      if (file.mimeType === FOLDER_MIME_TYPE) {
        queue.push(file.id);
        continue;
      }

      if (isLibraryFile(file)) {
        libraryFiles.push(file);
      }
    }
  }

  return libraryFiles;
}

function normalizeDriveFile(file, overrides) {
  const fileOverride = overrides[file.id] || {};
  const ownerName = file.owners && file.owners[0] ? file.owners[0].displayName : null;

  return {
    drive_file_id: file.id,
    title: fileOverride.title || stripPdfExtension(file.name) || 'Untitled',
    author: fileOverride.author || ownerName || null,
    cover_image_url: fileOverride.cover_image_url || file.thumbnailLink || file.iconLink || null,
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
  const { folderIds, apiKey } = getConfig();

  if (folderIds.length === 0 || !apiKey) {
    return {
      synced: false,
      reason: 'missing_drive_config',
      message: 'Set GOOGLE_DRIVE_FOLDER_IDS and GOOGLE_DRIVE_API_KEY to enable library sync.'
    };
  }

  const overrides = loadMetadataOverrides();
  const driveFilesById = new Map();
  for (const folderId of folderIds) {
    const folderFiles = await fetchDriveLibraryFilesRecursive({ rootFolderId: folderId, apiKey });
    for (const file of folderFiles) {
      if (file && file.id) {
        driveFilesById.set(file.id, file);
      }
    }
  }
  const driveFiles = Array.from(driveFilesById.values());
  const normalizedItems = sortLibraryItems(
    driveFiles.map((file) => normalizeDriveFile(file, overrides))
  );

  lastSyncDetails = {
    driveFileCount: driveFiles.length,
    normalizedItemCount: normalizedItems.length,
    rootFolderCount: folderIds.length,
    folderIdConfigured: folderIds.length > 0,
    apiKeyConfigured: Boolean(apiKey),
    completedAt: new Date()
  };

  if (normalizedItems.length === 0) {
    return {
      synced: true,
      count: 0,
      warning: 'Google Drive returned zero supported library files. Existing library rows were left unchanged.'
    };
  }

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
        if (result.warning) {
          logger.warn(result.warning);
        }
      } else if (result.reason === 'missing_drive_config') {
        lastSyncDetails = {
          driveFileCount: null,
          normalizedItemCount: null,
          rootFolderCount: parseFolderIds(
            process.env.GOOGLE_DRIVE_FOLDER_IDS || process.env.GOOGLE_DRIVE_FOLDER_ID
          ).length,
          folderIdConfigured: parseFolderIds(
            process.env.GOOGLE_DRIVE_FOLDER_IDS || process.env.GOOGLE_DRIVE_FOLDER_ID
          ).length > 0,
          apiKeyConfigured: Boolean(process.env.GOOGLE_DRIVE_API_KEY),
          completedAt: new Date()
        };
        logger.warn(result.message);
      }
      return result;
    })
    .catch((error) => {
      lastSyncError = error.message;
      lastSyncDetails = {
        driveFileCount: null,
        normalizedItemCount: null,
        rootFolderCount: parseFolderIds(
          process.env.GOOGLE_DRIVE_FOLDER_IDS || process.env.GOOGLE_DRIVE_FOLDER_ID
        ).length,
        folderIdConfigured: parseFolderIds(
          process.env.GOOGLE_DRIVE_FOLDER_IDS || process.env.GOOGLE_DRIVE_FOLDER_ID
        ).length > 0,
        apiKeyConfigured: Boolean(process.env.GOOGLE_DRIVE_API_KEY),
        completedAt: new Date()
      };
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
    lastSyncError,
    lastSyncDetails
  };
}

module.exports = {
  ensureLibrarySynced,
  getLibrarySyncStatus
};
