const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LibraryItem = require('../models/LibraryItem');
const logger = require('../utils/logger');

const DEFAULT_SYNC_MINUTES = 60;
const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DEFAULT_GOOGLE_DRIVE_FOLDER_ID = '1ppZKpX2eM0_yTVB1ebM3O1V7VTDrp_Ni';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut';
const PDF_MIME_TYPE = 'application/pdf';
const DRIVE_FILE_FIELDS = 'id,name,webViewLink,thumbnailLink,iconLink,owners(displayName),mimeType,modifiedTime,size,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)';
const LIBRARY_MIME_TYPES = new Set([PDF_MIME_TYPE]);
const metadataPath = path.join(__dirname, '../../data/library-metadata.json');

let lastSyncStartedAt = 0;
let lastSyncCompletedAt = null;
let lastSyncError = null;
let lastSyncDetails = null;
let syncInFlight = null;
let serviceAccountToken = null;

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
  ].filter(Boolean).join(',') || DEFAULT_GOOGLE_DRIVE_FOLDER_ID;
}

function getConfiguredTargets() {
  return parseDriveTargets(getConfiguredTargetInput());
}

function normalizePrivateKey(value) {
  return value ? value.replace(/\\n/g, '\n') : value;
}

function getServiceAccountConfig() {
  if (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
      return {
        clientEmail: parsed.client_email,
        privateKey: normalizePrivateKey(parsed.private_key)
      };
    } catch (error) {
      logger.warn('Failed to parse GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.', error.message);
      return null;
    }
  }

  if (process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY) {
    return {
      clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(process.env.GOOGLE_DRIVE_PRIVATE_KEY)
    };
  }

  return null;
}

function getAuthMode({ apiKey, serviceAccount }) {
  if (serviceAccount && serviceAccount.clientEmail && serviceAccount.privateKey) {
    return 'service_account';
  }
  if (apiKey) {
    return 'api_key';
  }
  return 'none';
}

function getConfig() {
  const targets = getConfiguredTargets();
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const serviceAccount = getServiceAccountConfig();
  const authMode = getAuthMode({ apiKey, serviceAccount });

  return {
    targets,
    folderIds: targets.map((target) => target.id),
    apiKey,
    serviceAccount,
    authMode,
    intervalMs: (Number(process.env.LIBRARY_SYNC_INTERVAL_MINUTES) || DEFAULT_SYNC_MINUTES) * 60 * 1000
  };
}

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function getServiceAccountToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (
    serviceAccountToken &&
    serviceAccountToken.clientEmail === serviceAccount.clientEmail &&
    serviceAccountToken.expiresAt > now + 60
  ) {
    return serviceAccountToken.accessToken;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.clientEmail,
    scope: GOOGLE_DRIVE_READONLY_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsignedToken = `${toBase64Url(header)}.${toBase64Url(payload)}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsignedToken)
    .end()
    .sign(serviceAccount.privateKey, 'base64url');
  const assertion = `${unsignedToken}.${signature}`;

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google service account auth error (${response.status}): ${body}`);
  }

  const payloadResponse = await response.json();
  serviceAccountToken = {
    clientEmail: serviceAccount.clientEmail,
    accessToken: payloadResponse.access_token,
    expiresAt: now + Number(payloadResponse.expires_in || 3600)
  };

  return serviceAccountToken.accessToken;
}

async function buildDriveRequestOptions({ apiKey, serviceAccount }) {
  if (serviceAccount && serviceAccount.clientEmail && serviceAccount.privateKey) {
    return {
      query: {},
      headers: {
        Authorization: `Bearer ${await getServiceAccountToken(serviceAccount)}`
      }
    };
  }

  return {
    query: { key: apiKey },
    headers: {}
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

async function fetchFilesInFolder({ folderId, apiKey, serviceAccount }) {
  const files = [];
  let pageToken = null;

  do {
    const requestOptions = await buildDriveRequestOptions({ apiKey, serviceAccount });
    const params = new URLSearchParams({
      ...requestOptions.query,
      q: `'${folderId}' in parents and trashed=false`,
      fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
      orderBy: 'name',
      pageSize: '1000',
      corpora: 'allDrives',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true'
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await fetch(`${GOOGLE_DRIVE_API_BASE}?${params.toString()}`, {
      headers: requestOptions.headers
    });
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

async function fetchDriveFile({ fileId, apiKey, serviceAccount, resourceKey = '' }) {
  const requestOptions = await buildDriveRequestOptions({ apiKey, serviceAccount });
  const params = new URLSearchParams({
    ...requestOptions.query,
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: 'true'
  });

  if (resourceKey) {
    params.set('resourceKey', resourceKey);
  }

  const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/${encodeURIComponent(fileId)}?${params.toString()}`, {
    headers: requestOptions.headers
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive API error (${response.status}) for file ${fileId}: ${body}`);
  }

  return response.json();
}

function recordMimeType(diagnostic, mimeType) {
  if (!diagnostic || !mimeType) return;
  diagnostic.mimeTypes[mimeType] = (diagnostic.mimeTypes[mimeType] || 0) + 1;
}

async function fetchDriveLibraryFilesRecursive({ rootTarget, apiKey, serviceAccount, diagnostic }) {
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

    const files = await fetchFilesInFolder({ folderId: currentFolderId, apiKey, serviceAccount });
    if (diagnostic) {
      diagnostic.folderCount += 1;
      diagnostic.scannedFileCount += files.length;
    }

    for (const rawFile of files) {
      const file = normalizeShortcut(rawFile);
      if (!file || !file.mimeType) continue;
      recordMimeType(diagnostic, file.mimeType);

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

async function fetchDriveLibraryFilesForTarget({ target, apiKey, serviceAccount }) {
  let rootFile = null;
  const diagnostic = {
    id: target.id,
    hasResourceKey: Boolean(target.resourceKey),
    metadataMimeType: null,
    folderCount: 0,
    scannedFileCount: 0,
    supportedFileCount: 0,
    mimeTypes: {},
    metadataError: null
  };

  try {
    rootFile = normalizeShortcut(await fetchDriveFile({
      fileId: target.id,
      apiKey,
      serviceAccount,
      resourceKey: target.resourceKey
    }));
    diagnostic.metadataMimeType = rootFile && rootFile.mimeType ? rootFile.mimeType : null;
  } catch (error) {
    diagnostic.metadataError = error.message;
    logger.warn(`Unable to read Google Drive target metadata for ${target.id}. Trying it as a folder.`, error.message);
  }

  if (rootFile && rootFile.mimeType && rootFile.mimeType !== FOLDER_MIME_TYPE) {
    recordMimeType(diagnostic, rootFile.mimeType);
    const files = isLibraryFile(rootFile) ? [rootFile] : [];
    diagnostic.scannedFileCount = 1;
    diagnostic.supportedFileCount = files.length;
    return { files, diagnostic };
  }

  const files = await fetchDriveLibraryFilesRecursive({
    rootTarget: rootFile || target,
    apiKey,
    serviceAccount,
    diagnostic
  });
  diagnostic.supportedFileCount = files.length;
  return { files, diagnostic };
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
  const { targets, folderIds, apiKey, serviceAccount, authMode } = getConfig();

  if (targets.length === 0 || authMode === 'none') {
    return {
      synced: false,
      reason: 'missing_drive_config',
      message: 'Set GOOGLE_DRIVE_API_KEY to enable library sync.'
    };
  }

  const overrides = loadMetadataOverrides();
  const driveFilesById = new Map();
  const targetDetails = [];
  for (const target of targets) {
    const { files: targetFiles, diagnostic } = await fetchDriveLibraryFilesForTarget({ target, apiKey, serviceAccount });
    targetDetails.push(diagnostic);
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
    authMode,
    apiKeyConfigured: Boolean(apiKey),
    serviceAccountConfigured: Boolean(serviceAccount),
    targetDetails,
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
        const config = getConfig();
        lastSyncDetails = {
          driveFileCount: null,
          normalizedItemCount: null,
          rootFolderCount: configuredTargets.length,
          folderIdConfigured: configuredTargets.length > 0,
          authMode: config.authMode,
          apiKeyConfigured: Boolean(process.env.GOOGLE_DRIVE_API_KEY),
          serviceAccountConfigured: Boolean(config.serviceAccount),
          completedAt: new Date()
        };
        logger.warn(result.message);
      }
      return result;
    })
    .catch((error) => {
      lastSyncError = error.message;
      const configuredTargets = getConfiguredTargets();
      const config = getConfig();
      lastSyncDetails = {
        driveFileCount: null,
        normalizedItemCount: null,
        rootFolderCount: configuredTargets.length,
        folderIdConfigured: configuredTargets.length > 0,
        authMode: config.authMode,
        apiKeyConfigured: Boolean(process.env.GOOGLE_DRIVE_API_KEY),
        serviceAccountConfigured: Boolean(config.serviceAccount),
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
