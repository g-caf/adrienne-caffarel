const fs = require('fs');
const path = require('path');
const LibraryItem = require('../models/LibraryItem');
const logger = require('../utils/logger');

const DEFAULT_SYNC_MINUTES = 60;
const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut';
const PDF_MIME_TYPE = 'application/pdf';
const DRIVE_FILE_FIELDS = 'id,name,webViewLink,thumbnailLink,iconLink,owners(displayName),mimeType,modifiedTime,size,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)';
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

function extractDriveTarget(value) {
  const input = (value || '').trim();
  if (!input) return { id: '', resourceKey: '' };
  const rawResourceKey = input.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/);
  const rawResourceKeyValue = rawResourceKey ? rawResourceKey[1] : '';

  let url = null;
  try {
    url = new URL(input);
  } catch (error) {
    url = null;
  }

  if (url) {
    const resourceKey = url.searchParams.get('resourcekey') || '';
    const pathMatch = url.pathname.match(/\/(?:folders|file\/d|document\/d|spreadsheets\/d|presentation\/d|drawings\/d)\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) {
      return { id: pathMatch[1], resourceKey };
    }

    const id = url.searchParams.get('id');
    if (id) {
      return { id, resourceKey };
    }
  }

  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return { id: folderMatch[1], resourceKey: rawResourceKeyValue };

  const fileMatch = input.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d|drawings\/d)\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return { id: fileMatch[1], resourceKey: rawResourceKeyValue };

  const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return { id: idMatch[1], resourceKey: rawResourceKeyValue };

  return { id: input.split(/[?&]resourcekey=/)[0], resourceKey: rawResourceKeyValue };
}

function parseDriveTargets(value) {
  const targetsById = new Map();

  (value || '')
    .split(',')
    .map(extractDriveTarget)
    .filter((target) => target.id)
    .forEach((target) => {
      const existing = targetsById.get(target.id);
      targetsById.set(target.id, {
        id: target.id,
        resourceKey: target.resourceKey || (existing ? existing.resourceKey : '')
      });
    });

  return Array.from(targetsById.values());
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
    mimeType: file.shortcutDetails.targetMimeType || file.mimeType,
    resourceKey: file.shortcutDetails.targetResourceKey || file.resourceKey || null
  };
}

function getConfiguredTargetInput() {
  return [
    process.env.GOOGLE_DRIVE_FOLDER_IDS,
    process.env.GOOGLE_DRIVE_FOLDER_ID,
    process.env.GOOGLE_DRIVE_FOLDER_URL,
    process.env.GOOGLE_DRIVE_LIBRARY_URL,
    process.env.GOOGLE_DRIVE_URL
  ].filter(Boolean).join(',');
}

function getConfiguredTargets() {
  return parseDriveTargets(getConfiguredTargetInput());
}

function getConfig() {
  const targets = getConfiguredTargets();

  return {
    targets,
    folderIds: targets.map((target) => target.id),
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
      fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
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

async function fetchDriveFile({ fileId, apiKey, resourceKey = '' }) {
  const params = new URLSearchParams({
    key: apiKey,
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: 'true'
  });

  if (resourceKey) {
    params.set('resourceKey', resourceKey);
  }

  const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/${encodeURIComponent(fileId)}?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive API error (${response.status}) for file ${fileId}: ${body}`);
  }

  return response.json();
}

async function fetchDriveLibraryFilesRecursive({ rootTarget, apiKey }) {
  const queue = [rootTarget];
  const visited = new Set();
  const libraryFiles = [];

  while (queue.length > 0) {
    const currentFolder = queue.shift();
    const currentFolderId = currentFolder && currentFolder.id;
    if (!currentFolderId || visited.has(currentFolderId)) {
      continue;
    }
    visited.add(currentFolderId);

    const files = await fetchFilesInFolder({ folderId: currentFolderId, apiKey });

    for (const rawFile of files) {
      const file = normalizeShortcut(rawFile);
      if (!file || !file.mimeType) continue;

      if (file.mimeType === FOLDER_MIME_TYPE) {
        queue.push({ id: file.id, resourceKey: file.resourceKey || '' });
        continue;
      }

      if (isLibraryFile(file)) {
        libraryFiles.push(file);
      }
    }
  }

  return libraryFiles;
}

async function fetchDriveLibraryFilesForTarget({ target, apiKey }) {
  let rootFile = null;

  try {
    rootFile = normalizeShortcut(await fetchDriveFile({
      fileId: target.id,
      apiKey,
      resourceKey: target.resourceKey
    }));
  } catch (error) {
    logger.warn(`Unable to read Google Drive target metadata for ${target.id}. Trying it as a folder.`, error.message);
  }

  if (rootFile && rootFile.mimeType && rootFile.mimeType !== FOLDER_MIME_TYPE) {
    return isLibraryFile(rootFile) ? [rootFile] : [];
  }

  return fetchDriveLibraryFilesRecursive({ rootTarget: rootFile || target, apiKey });
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
  const { targets, folderIds, apiKey } = getConfig();

  if (targets.length === 0 || !apiKey) {
    return {
      synced: false,
      reason: 'missing_drive_config',
      message: 'Set GOOGLE_DRIVE_FOLDER_IDS or GOOGLE_DRIVE_LIBRARY_URL and GOOGLE_DRIVE_API_KEY to enable library sync.'
    };
  }

  const overrides = loadMetadataOverrides();
  const driveFilesById = new Map();
  for (const target of targets) {
    const targetFiles = await fetchDriveLibraryFilesForTarget({ target, apiKey });
    for (const file of targetFiles) {
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
        const configuredTargets = getConfiguredTargets();
        lastSyncDetails = {
          driveFileCount: null,
          normalizedItemCount: null,
          rootFolderCount: configuredTargets.length,
          folderIdConfigured: configuredTargets.length > 0,
          apiKeyConfigured: Boolean(process.env.GOOGLE_DRIVE_API_KEY),
          completedAt: new Date()
        };
        logger.warn(result.message);
      }
      return result;
    })
    .catch((error) => {
      lastSyncError = error.message;
      const configuredTargets = getConfiguredTargets();
      lastSyncDetails = {
        driveFileCount: null,
        normalizedItemCount: null,
        rootFolderCount: configuredTargets.length,
        folderIdConfigured: configuredTargets.length > 0,
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
  getLibrarySyncStatus,
  __private: {
    extractDriveTarget,
    parseDriveTargets
  }
};
