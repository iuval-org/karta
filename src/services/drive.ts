/**
 * Drive API Service
 *
 * Servicio tipado para interactuar con Google Drive API v3.
 * - Carga dinámica de gapi client (CDN)
 * - Operaciones: listChildren, getFile, searchFiles, getThumbnailUrl, getFolderPath
 * - Cache en memoria con expiración de 5 minutos
 * - Manejo de errores: rate limit (429 → retry backoff), token expired
 * - Paginación automática (100+ items)
 *
 * No importa nada de React — es un servicio puro.
 */

import type { DriveItem } from '../types/drive';
import { useAuthStore } from '../stores/authStore';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: DriveItem;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const fileCache = new Map<string, CacheEntry>();

function getCached(fileId: string): DriveItem | undefined {
  const entry = fileCache.get(fileId);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    fileCache.delete(fileId);
    return undefined;
  }
  return entry.data;
}

function setCache(fileId: string, item: DriveItem): void {
  fileCache.set(fileId, { data: item, timestamp: Date.now() });
}

function setCacheBatch(items: DriveItem[]): void {
  const now = Date.now();
  for (const item of items) {
    fileCache.set(item.id, { data: item, timestamp: now });
  }
}

// ---------------------------------------------------------------------------
// Estado de carga de gapi
// ---------------------------------------------------------------------------

let gapiLoaded = false;
let driveApiLoaded = false;
let loadPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function mapToDriveItem(file: GapiDriveFile): DriveItem {
  const mimeType = file.mimeType ?? 'application/octet-stream';
  const item: DriveItem = {
    id: file.id ?? '',
    name: file.name ?? '',
    mimeType,
    thumbnailLink: file.thumbnailLink,
    iconLink: file.iconLink,
    webViewLink: file.webViewLink ?? '',
    modifiedTime: file.modifiedTime ?? '',
    size: file.size,
    fileExtension: file.fileExtension,
    isFolder: mimeType === 'application/vnd.google-apps.folder',
  };
  // Extract parentId from Drive API's parents array.
  // Drive API returns parents as string[] (parent resource IDs).
  if (file.parents && file.parents.length > 0) {
    item.parentId = file.parents[0];
  }
  return item;
}

function isGapiError(err: unknown): err is GapiError {
  if (err && typeof err === 'object') {
    const e = err as GapiError;
    return (
      typeof e.status === 'number' ||
      typeof e.message === 'string'
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Exponential backoff
// ---------------------------------------------------------------------------

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      // Permission errors (403) — no retry, throw immediately
      if (isGapiError(err) && err.status === 403) {
        throw new Error('No tenés permisos para esta operación.');
      }

      // Rate limit (429) — retry con backoff
      if (isGapiError(err) && err.status === 429) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000;
          await delay(backoff);
          continue;
        }
        throw new Error(
          'Límite de solicitudes excedido. Intenta de nuevo en unos segundos.',
        );
      }

      // Token expired (401) — refrescar y reintentar
      if (
        isGapiError(err) &&
        (err.status === 401 ||
          err.result?.error?.message?.includes('Token expired'))
      ) {
        if (attempt < maxRetries) {
          // Clear stale token first to avoid returning cached expired token
          useAuthStore.getState().clearAccessToken();
          // Refresh token via re-authentication popup
          const token = await useAuthStore.getState().refreshAccessToken();
          if (token) {
            window.gapi.client?.setToken({ access_token: token });
            continue; // Retry with fresh token
          }
          // Could not refresh — stop retrying to avoid infinite loop
        }
        throw new Error(
          'Sesión expirada. Inicia sesión nuevamente.',
        );
      }

      // Errores de red u otros — no reintentar
      throw err;
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Carga de gapi client
// ---------------------------------------------------------------------------

/**
 * Carga el script de gapi y el cliente de Drive API v3.
 * Se llama automáticamente antes de cada operación.
 */
export async function loadDriveApi(): Promise<void> {
  if (gapiLoaded && driveApiLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );

    const onLoad = (): void => {
      window.gapi.load('client', {
        callback: async () => {
          try {
            await window.gapi.client!.load('drive', 'v3');

            // Setear token
            const token = await useAuthStore.getState().getAccessToken();
            if (token) {
              window.gapi.client!.setToken({ access_token: token });
            }

            gapiLoaded = true;
            driveApiLoaded = true;
            resolve();
          } catch (err) {
            reject(err);
          }
        },
      });
    };

    if (existing && gapiLoaded) {
      onLoad();
      return;
    }

    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.onload = onLoad;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('No se pudo cargar Google API client.'));
    };
  });

  return loadPromise;
}

/**
 * Asegura que gapi client esté cargado y tenga token vigente.
 * Se puede llamar antes de cada request para refrescar el token si expiró.
 */
async function ensureApiReady(): Promise<void> {
  await loadDriveApi();

  // Refrescar token si es necesario
  const token = await useAuthStore.getState().getAccessToken();
  if (token) {
    window.gapi.client?.setToken({ access_token: token });
  }
}

// ---------------------------------------------------------------------------
// Operaciones de Drive
// ---------------------------------------------------------------------------

/**
 * Lista los hijos de una carpeta de Drive.
 * - Paginación automática (recorre todas las páginas)
 * - Cachea cada item individualmente
 * - Orden: carpetas primero, luego alfabético
 */
/**
 * Recursively lists ALL items in a folder tree (all descendants).
 * Used when loading the root canvas so all items become root-level nodes
 * and their saved positions can be restored.
 */
export async function listAllChildren(folderId: string): Promise<DriveItem[]> {
  const visited = new Set<string>();
  const allItems: DriveItem[] = [];

  async function walk(currentId: string): Promise<void> {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const items = await listChildren(currentId);
    for (const item of items) {
      allItems.push(item);
      if (item.isFolder) {
        await walk(item.id);
      }
    }
  }

  await walk(folderId);
  return allItems;
}

export async function listChildren(folderId: string): Promise<DriveItem[]> {
  await ensureApiReady();

  const allItems: DriveItem[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        'files(id,name,mimeType,thumbnailLink,iconLink,webViewLink,modifiedTime,size,fileExtension,parents),nextPageToken',
      orderBy: 'folder,name_natural',
      pageSize: '100',
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await withRetry(async () => {
      const client = window.gapi.client;
      if (!client?.drive) {
        throw new Error('Drive API no está cargada.');
      }
      return client.drive.files.list(params);
    });

    const files = response.result.files ?? [];
    const items = files.map(mapToDriveItem);
    allItems.push(...items);
    setCacheBatch(items);
    pageToken = response.result.nextPageToken;
  } while (pageToken);

  return allItems;
}

/**
 * Obtiene el detalle de un archivo individual.
 * - Revisa cache primero
 * - Si falla con permiso denegado, lanza error claro
 */
export async function getFile(fileId: string): Promise<DriveItem> {
  const cached = getCached(fileId);
  if (cached) return cached;

  await ensureApiReady();

  const response = await withRetry(async () => {
    const client = window.gapi.client;
    if (!client?.drive) {
      throw new Error('Drive API no está cargada.');
    }
    return client.drive.files.get({
      fileId,
      fields:
        'id,name,mimeType,thumbnailLink,iconLink,webViewLink,modifiedTime,size,fileExtension',
    });
  });

  const item = mapToDriveItem(response.result);
  setCache(fileId, item);
  return item;
}

/**
 * Busca archivos por nombre (full-text search en nombre).
 * - query: texto a buscar (case-insensitive)
 * - Excluye archivos en la papelera
 */
export async function searchFiles(query: string): Promise<DriveItem[]> {
  if (!query.trim()) return [];

  await ensureApiReady();

  const allItems: DriveItem[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      fields:
        'files(id,name,mimeType,thumbnailLink,iconLink,webViewLink,modifiedTime,size,fileExtension),nextPageToken',
      pageSize: '100',
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await withRetry(async () => {
      const client = window.gapi.client;
      if (!client?.drive) {
        throw new Error('Drive API no está cargada.');
      }
      return client.drive.files.list(params);
    });

    const files = response.result.files ?? [];
    allItems.push(...files.map(mapToDriveItem));
    pageToken = response.result.nextPageToken;
  } while (pageToken);

  return allItems;
}

// ---------------------------------------------------------------------------
// Create item
// ---------------------------------------------------------------------------

/**
 * MIME types para items de Google Workspace que se pueden crear.
 */
export const CREATE_MIME_TYPES = {
  folder: 'application/vnd.google-apps.folder',
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
} as const;

/**
 * Crea un nuevo item en Google Drive (carpeta, documento, planilla o presentación).
 * En mock mode, simula la creación agregando a MOCK_ITEMS.
 *
 * - POST /drive/v3/files
 * - Body: { name, mimeType, parents: [parentFolderId] }
 * - Fields: id, name, mimeType, webViewLink, modifiedTime, iconLink
 */
export async function createItem(
  name: string,
  mimeType: string,
  parentFolderId: string,
): Promise<DriveItem> {
  await ensureApiReady();

  const body: Record<string, unknown> = {
    name,
    mimeType,
  };

  // Only include parents if we have a specific folder (not root)
  if (parentFolderId && parentFolderId !== 'root') {
    body.parents = [parentFolderId];
  }

  const response = await withRetry(async () => {
    const client = window.gapi.client;
    if (!client) {
      throw new Error('Drive API no está cargada.');
    }
    return client.request({
      path: '/drive/v3/files',
      method: 'POST',
      params: { fields: 'id,name,mimeType,webViewLink,modifiedTime,iconLink' },
      body,
    });
  });

  console.log('[CREATE] Drive API response:', response);
  console.log('[CREATE] response.result:', response.result);

  const item = mapToDriveItem(response.result);
  console.log('[CREATE] mapped item:', item);
  setCache(item.id, item);
  return item;
}

/**
 * Obtiene la URL del thumbnail preferido para un fileId.
 * Retorna null si no hay thumbnail disponible.
 */
export async function getThumbnailUrl(fileId: string): Promise<string | null> {
  try {
    const file = await getFile(fileId);
    return file.thumbnailLink ?? file.iconLink ?? null;
  } catch {
    return null;
  }
}

/**
 * Recorre los parents de una carpeta hasta llegar a root.
 * Útil para construir breadcrumbs de navegación.
 *
 * Retorna un array desde la carpeta dada hacia arriba:
 * [{ id: 'root', name: 'Mi Unidad' }, { id: 'parent', name: '...' }, { id: folderId, name: '...' }]
 *
 * NOTA: No puede funcionar sin credenciales reales de Drive.
 */
export async function getFolderPath(
  folderId: string,
): Promise<{ id: string; name: string }[]> {
  await ensureApiReady();

  const path: { id: string; name: string }[] = [];
  let currentId: string | null = folderId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const response = await withRetry(async () => {
      const client = window.gapi.client;
      if (!client?.drive) {
        throw new Error('Drive API no está cargada.');
      }
      return client.drive.files.get({
        fileId: currentId!,
        fields: 'id,name,parents',
      });
    });

    const file = response.result;
    path.unshift({ id: file.id ?? currentId, name: file.name ?? '' });
    currentId = file.parents?.[0] ?? null;

    // Safety: evitar ciclos infinitos (max 20 niveles)
    if (path.length > 20) break;
  }

  return path;
}

// ---------------------------------------------------------------------------
// Move item (drag & drop)
// ---------------------------------------------------------------------------

/**
 * Mueve un archivo (o carpeta) de una carpeta padre a otra en Google Drive
 * usando addParents / removeParents.
 *
 * En mock mode (USE_MOCK), simula el movimiento actualizando MOCK_ITEMS.
 */
export async function moveItem(
  fileId: string,
  newParentId: string,
  oldParentId: string,
): Promise<void> {
  await ensureApiReady();

  await withRetry(async () => {
    const client = window.gapi.client;
    if (!client?.drive) {
      throw new Error('Drive API no está cargada.');
    }

    try {
      await client.drive.files.update(
        {
          fileId,
          addParents: newParentId,
          removeParents: oldParentId,
          fields: 'id,parents',
        },
        {},
      );
    } catch (err: unknown) {
      if (isGapiError(err)) {
        switch (err.status) {
          case 403:
            throw new Error(
              'No tenés permisos para mover este archivo.',
            );
          case 404:
            throw new Error(
              'El archivo o la carpeta destino no existe.',
            );
          case 409:
            throw new Error(
              'Ya existe un archivo con ese nombre en la carpeta destino.',
            );
          case 429:
            throw new Error(
              'Límite de solicitudes excedido. Intenta de nuevo en unos segundos.',
            );
        }
      }
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// Trash item (mover a papelera)
// ---------------------------------------------------------------------------

/**
 * Mueve un archivo o carpeta a la papelera de Google Drive.
 * - PATCH /drive/v3/files/{fileId} con body: { trashed: true }
 * - Maneja 403 (permiso denegado), 404 (no encontrado), 429 (rate limit)
 * - En mock mode, remueve el item de MOCK_ITEMS
 */
export async function trashItem(fileId: string): Promise<void> {
  await ensureApiReady();

  await withRetry(async () => {
    const client = window.gapi.client;
    if (!client?.drive) {
      throw new Error('Drive API no está cargada.');
    }

    try {
      await client.drive.files.update(
        {
          fileId,
        },
        {
          trashed: true,
        },
      );
    } catch (err: unknown) {
      if (isGapiError(err)) {
        switch (err.status) {
          case 403:
            throw new Error(
              'No tenés permisos para eliminar este archivo.',
            );
          case 404:
            throw new Error(
              'El archivo no existe.',
            );
          case 429:
            throw new Error(
              'Límite de solicitudes excedido. Intenta de nuevo en unos segundos.',
            );
        }
      }
      throw err;
    }
  });
}

/**
 * Mueve múltiples archivos a la papelera de Google Drive.
 * Usa Promise.allSettled para que items individuales no bloqueen el batch.
 *
 * Retorna:
 *   { success: string[], failed: string[] }
 */
export async function trashItems(
  fileIds: string[],
): Promise<{ success: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    fileIds.map((fileId) => trashItem(fileId)),
  );

  const success: string[] = [];
  const failed: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      success.push(fileIds[index]);
    } else {
      failed.push(fileIds[index]);
    }
  });

  return { success, failed };
}

// ---------------------------------------------------------------------------
// Rename item
// ---------------------------------------------------------------------------

/**
 * Renombra un archivo o carpeta en Google Drive.
 * - PATCH /drive/v3/files/{fileId}
 * - Body: { name: newName }
 * - Fields: id, name
 * - Maneja 403, 404, 400 (nombre inválido)
 * - En mock mode, actualiza el nombre en MOCK_ITEMS
 */
export async function renameItem(
  fileId: string,
  newName: string,
): Promise<void> {
  await ensureApiReady();

  await withRetry(async () => {
    const client = window.gapi.client;
    if (!client?.drive) {
      throw new Error('Drive API no está cargada.');
    }

    try {
      await client.drive.files.update(
        {
          fileId,
          fields: 'id,name',
        },
        {
          name: newName,
        },
      );
    } catch (err: unknown) {
      if (isGapiError(err)) {
        switch (err.status) {
          case 400:
            throw new Error('Nombre inválido. Revisá los caracteres permitidos.');
          case 403:
            throw new Error('No tenés permisos para renombrar este archivo.');
          case 404:
            throw new Error('El archivo no existe.');
          case 429:
            throw new Error(
              'Límite de solicitudes excedido. Intenta de nuevo en unos segundos.',
            );
        }
      }
      throw err;
    }
  });
}

/**
 * Renombra múltiples archivos en lote.
 * Usa Promise.allSettled para que items individuales no bloqueen el batch.
 *
 * Retorna:
 *   { success: string[], failed: string[] }
 */
export async function renameItems(
  items: { fileId: string; newName: string }[],
): Promise<{ success: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    items.map(({ fileId, newName }) => renameItem(fileId, newName)),
  );

  const success: string[] = [];
  const failed: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      success.push(items[index].fileId);
    } else {
      failed.push(items[index].fileId);
    }
  });

  return { success, failed };
}

// ---------------------------------------------------------------------------
// Drive Changes API
// ---------------------------------------------------------------------------

/**
 * Obtiene el startPageToken inicial para el Changes API.
 * Este token representa el estado actual de Drive y sirve como punto de
 * partida para detectar cambios posteriores.
 *
 * GET https://www.googleapis.com/drive/v3/changes/startPageToken
 */
export async function getStartPageToken(): Promise<string> {
  await ensureApiReady();

  const response = await withRetry(async () => {
    const client = window.gapi.client;
    if (!client?.drive) {
      throw new Error('Drive API no está cargada.');
    }
    return client.drive.changes.getStartPageToken({});
  });

  const token = (response.result as unknown as GapiDriveStartPageToken).startPageToken;
  if (!token) {
    throw new Error('No se pudo obtener el token de cambios de Drive.');
  }
  return token;
}

/**
 * Lista los cambios desde un pageToken.
 *
 * GET https://www.googleapis.com/drive/v3/changes?pageToken={token}
 *
 * Incluye archivos trashed (trashed=true) para detectar eliminaciones.
 * Maneja paginación automática si hay 100+ cambios.
 *
 * Retorna:
 *   - changes: array de cambios individuales
 *   - nextStartPageToken: nuevo token para la próxima sync (si hay)
 */
export async function getChanges(
  pageToken: string,
): Promise<{ changes: GapiDriveChange[]; nextStartPageToken?: string }> {
  await ensureApiReady();

  const allChanges: GapiDriveChange[] = [];
  let currentToken: string | undefined = pageToken;
  let newStartPageToken: string | undefined;

  while (currentToken) {
    const response = await withRetry(async () => {
      const client = window.gapi.client;
      if (!client?.drive) {
        throw new Error('Drive API no está cargada.');
      }
      return client.drive.changes.list({
        pageToken: currentToken!,
        spaces: 'drive',
        pageSize: '100',
        includeRemoved: 'true',
        includeItemsFromAllDrives: 'false',
        supportsAllDrives: 'false',
        fields: 'changes(kind,type,fileId,removed,time,file(id,name,mimeType,parents,trashed,modifiedTime,thumbnailLink,iconLink,webViewLink,size,fileExtension)),nextPageToken,newStartPageToken',
      });
    });

    const data = response.result as unknown as GapiDriveChangeList;
    if (data.changes) {
      allChanges.push(...data.changes);
    }

    newStartPageToken = data.newStartPageToken;
    currentToken = data.nextPageToken;
  }

  return {
    changes: allChanges,
    nextStartPageToken: newStartPageToken,
  };
}
