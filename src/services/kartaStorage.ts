/**
 * Karta Storage — Persistencia del canvas en Google Drive.
 *
 * Guarda TODO el estado del canvas (nodos + edges) en una carpeta
 * ._karta/state.json dentro de cada carpeta de Drive.
 *
 * Cada carpeta tiene su propio ._karta/state.json con solo los
 * elementos que están visibles dentro de esa carpeta.
 *
 * Drive API v3 — usa el mismo gapi client que drive.ts.
 */
import { useAuthStore } from '../stores/authStore';
import type { KartaState } from '../utils/canvasSerializer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOT_KARTA_FOLDER_NAME = '._karta';
const STATE_FILE_NAME = 'state.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Obtiene una instancia autenticada de gapi.client.
 * Lanza error si no hay token.
 */
function getClient() {
  const token = useAuthStore.getState().oAuthAccessToken;
  if (!token) throw new Error('No hay token de Google Drive');
  return (window as unknown as { gapi: { client: { request: (req: { path: string; method?: string; params?: Record<string, string>; body?: unknown }) => Promise<{ result: unknown }> } } }).gapi.client;
}

/**
 * Determina si debemos usar mock (modo desarrollo offline).
 */
function getUseMock(): boolean {
  return !useAuthStore.getState().oAuthAccessToken;
}

// ---------------------------------------------------------------------------
// Mock helpers para desarrollo offline
// ---------------------------------------------------------------------------

interface MockStorage {
  [folderPath: string]: KartaState | null;
}

const mockStore: MockStorage = {};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Busca o crea la carpeta ._karta dentro de la carpeta dada.
 *
 * @param parentFolderId — ID de la carpeta de Drive donde crear ._karta ('root' para raíz)
 * @returns El ID de la carpeta ._karta
 */
export async function findOrCreateDotKarta(
  parentFolderId: string,
): Promise<string> {
  if (getUseMock()) {
    const mockKey = `dotkarta:${parentFolderId}`;
    if (!mockStore[mockKey]) {
      mockStore[mockKey] = null; // exists but empty
    }
    return mockKey;
  }

  const client = getClient();

  // 1. Buscar si ya existe ._karta
  const query = `name='${DOT_KARTA_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and '${
    parentFolderId === 'root' ? 'root' : parentFolderId
  }' in parents and trashed=false`;

  const searchResult = await client.request({
    path: '/drive/v3/files',
    method: 'GET',
    params: {
      q: query,
      fields: 'files(id,name)',
      pageSize: '1',
    },
  });

  const files = (searchResult.result as { files?: { id: string }[] }).files;
  if (files && files.length > 0) {
    return files[0].id;
  }

  // 2. No existe → crear
  const createResult = await client.request({
    path: '/drive/v3/files',
    method: 'POST',
    body: {
      name: DOT_KARTA_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId === 'root' ? 'root' : parentFolderId],
    },
  });

  return (createResult.result as { id: string }).id;
}

/**
 * Lee el state.json de una carpeta ._karta.
 *
 * @param folderId — ID de la carpeta de Drive que contiene ._karta (NO el ID de ._karta)
 * @returns El estado guardado, o null si no existe
 */
export async function readCanvasState(
  folderId: string,
): Promise<KartaState | null> {
  if (getUseMock()) {
    const mockKey = `state:${folderId}`;
    return mockStore[mockKey] ?? null;
  }

  const client = getClient();

  try {
    // 1. Encontrar ._karta
    const dotKartaId = await findOrCreateDotKarta(folderId);

    // 2. Buscar state.json dentro de ._karta
    const query = `name='${STATE_FILE_NAME}' and '${dotKartaId}' in parents and trashed=false`;

    const searchResult = await client.request({
      path: '/drive/v3/files',
      method: 'GET',
      params: {
        q: query,
        fields: 'files(id,name)',
        pageSize: '1',
      },
    });

    const files = (searchResult.result as { files?: { id: string }[] }).files;
    if (!files || files.length === 0) {
      return null; // Primera vez — no hay state todavía
    }

    const stateFileId = files[0].id;

    // 3. Descargar contenido
    const contentResult = await client.request({
      path: `/drive/v3/files/${stateFileId}`,
      method: 'GET',
      params: {
        alt: 'media',
      },
    });

    return contentResult.result as KartaState;
  } catch (err) {
    console.warn('[kartaStorage] Error reading state:', err);
    return null;
  }
}

/**
 * Escribe (o sobreescribe) el state.json de una carpeta.
 * Usa uploadType=media para archivos pequeños (state.json < 1MB).
 *
 * @param folderId — ID de la carpeta de Drive
 * @param state — Estado completo del canvas a guardar
 */
export async function writeCanvasState(
  folderId: string,
  state: KartaState,
): Promise<void> {
  if (getUseMock()) {
    const mockKey = `state:${folderId}`;
    mockStore[mockKey] = state;
    return;
  }

  const client = getClient();
  const content = JSON.stringify(state, null, 2);

  try {
    const dotKartaId = await findOrCreateDotKarta(folderId);

    // Buscar state.json existente
    const query = `name='${STATE_FILE_NAME}' and '${dotKartaId}' in parents and trashed=false`;
    const searchResult = await client.request({
      path: '/drive/v3/files',
      method: 'GET',
      params: {
        q: query,
        fields: 'files(id)',
        pageSize: '1',
      },
    });

    const files = (searchResult.result as { files?: { id: string }[] }).files;

    if (files && files.length > 0) {
      // Actualizar existente — PATCH con uploadType=media sobreescribe el contenido
      await client.request({
        path: `/upload/drive/v3/files/${files[0].id}`,
        method: 'PATCH',
        params: { uploadType: 'media' },
        body: content,
      });
    } else {
      // Crear nuevo con metadata
      const metadata = { name: STATE_FILE_NAME, parents: [dotKartaId], mimeType: 'application/json' };
      await client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        body: { metadata, content },
      });
    }
  } catch (err) {
    console.warn('[kartaStorage] Error writing state:', err);
  }
}

/**
 * Elimina el state.json de una carpeta (al vaciar papelera, etc.).
 */
export async function deleteCanvasState(folderId: string): Promise<void> {
  if (getUseMock()) {
    const mockKey = `state:${folderId}`;
    delete mockStore[mockKey];
    return;
  }

  const client = getClient();

  try {
    const dotKartaId = await findOrCreateDotKarta(folderId);

    const query = `name='${STATE_FILE_NAME}' and '${dotKartaId}' in parents and trashed=false`;
    const searchResult = await client.request({
      path: '/drive/v3/files',
      method: 'GET',
      params: {
        q: query,
        fields: 'files(id)',
        pageSize: '1',
      },
    });

    const files = (searchResult.result as { files?: { id: string }[] }).files;
    if (files && files.length > 0) {
      await client.request({
        path: `/drive/v3/files/${files[0].id}`,
        method: 'DELETE',
      });
    }
  } catch (err) {
    console.warn('[kartaStorage] Error deleting state:', err);
  }
}
