/**
 * Drive Sync Service
 *
 * Servicio para sincronizar cambios de Google Drive usando Changes API.
 * - Mantiene un pageToken en Dexie para saber desde dónde buscar cambios.
 * - Al expandir una carpeta, consulta los cambios desde el último token.
 * - Aplica cambios quirúrgicos: agregar, eliminar, renombrar, mover.
 *
 * No importa nada de React — es un servicio puro.
 */

import type { DriveItem } from '../types/drive';
import { getStartPageToken, getChanges } from './drive';
import { db, type SyncState } from './db';
import type { NodePosition } from './db';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Obtiene el pageToken guardado en Dexie.
 * Si no existe, obtiene uno nuevo de Drive API y lo guarda.
 */
export async function getOrCreatePageToken(): Promise<string> {
  // Intentar obtener token guardado
  const saved = await db.syncState.get('sync');
  if (saved?.pageToken) {
    return saved.pageToken;
  }

  // Obtener nuevo token de Drive API
  const token = await getStartPageToken();
  await savePageToken(token);
  return token;
}

/**
 * Guarda el pageToken en Dexie con timestamp.
 */
export async function savePageToken(pageToken: string): Promise<void> {
  const state: SyncState = {
    id: 'sync',
    pageToken,
    lastSyncAt: Date.now(),
  };
  await db.syncState.put(state);
}

// ---------------------------------------------------------------------------
// Change processing
// ---------------------------------------------------------------------------

export interface SyncResult {
  added: DriveItem[];
  removed: string[];
  renamed: { fileId: string; oldName: string; newName: string }[];
  moved: { fileId: string; oldParentId: string; newParentId: string }[];
  changeCount: number;
}

/**
 * Procesa los cambios desde el último pageToken y retorna un resumen
 * de los cambios relevantes para una carpeta específica.
 *
 * @param folderId - ID de la carpeta a sincronizar
 * @returns SyncResult con los cambios detectados
 */
export async function syncFolder(
  folderId: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    added: [],
    removed: [],
    renamed: [],
    moved: [],
    changeCount: 0,
  };

  const pageToken = await getOrCreatePageToken();

  try {
    const { changes, nextStartPageToken } = await getChanges(pageToken);

    if (changes.length === 0) {
      // Sin cambios, solo actualizamos el timestamp
      if (nextStartPageToken) {
        await savePageToken(nextStartPageToken);
      }
      return result;
    }

    // Obtener los items existentes en la carpeta (para diff)
    const existingItems: NodePosition[] = await db.positions
      .filter((p: NodePosition) => p.tabId === folderId || p.tabId === `root/${folderId}`)
      .toArray();
    const existingIds = new Set(existingItems.map((p: NodePosition) => p.fileId));

    for (const change of changes) {
      if (!change.fileId || change.fileId === folderId) continue;

      const file = change.file;

      // ── Archivo eliminado (trashed o permanentemente borrado) ─────────
      if (change.removed || (file && file.trashed)) {
        if (existingIds.has(change.fileId)) {
          result.removed.push(change.fileId);
          result.changeCount++;
        }
        continue;
      }

      // ── Archivo creado o modificado ──────────────────────────────────
      if (file) {
        const isInFolder = file.parents?.includes(folderId);

        if (change.type === 'create' && isInFolder) {
          // Archivo nuevo en esta carpeta
          result.added.push(mapChangeToDriveItem(file));
          result.changeCount++;
          continue;
        }

        if (change.type === 'update') {
          const existingItem = existingItems.find(
            (p: NodePosition) => p.fileId === change.fileId,
          );

          if (isInFolder) {
            if (!existingItem) {
              // Archivo movido a esta carpeta desde otra
              result.added.push(mapChangeToDriveItem(file));
              result.changeCount++;
            } else if (file.name) {
              // Posible rename — detectamos por cambio de nombre
              result.renamed.push({
                fileId: change.fileId,
                oldName: file.name, // No tenemos el nombre anterior del change
                newName: file.name,
              });
              result.changeCount++;
            }
          } else if (existingItem) {
            // Archivo movido FUERA de esta carpeta
            result.removed.push(change.fileId);
            result.changeCount++;
          }
        }
      }
    }

    // Guardar nuevo token para la próxima sync
    if (nextStartPageToken) {
      await savePageToken(nextStartPageToken);
    }
  } catch (err) {
    // Token inválido → lo borramos para que se genere uno nuevo
    if (err instanceof Error && err.message.includes('startPageToken')) {
      await db.syncState.delete('sync');
    }
    throw err;
  }

  return result;
}

/**
 * Mapa de cambio a DriveItem para nuevos archivos.
 */
function mapChangeToDriveItem(file: GapiDriveFile): DriveItem {
  const mimeType = file.mimeType ?? 'application/octet-stream';
  return {
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
    parentId: file.parents?.[0],
  };
}

// ---------------------------------------------------------------------------
// Offline / connectivity helpers
// ---------------------------------------------------------------------------

/**
 * Verifica si hay cambios pendientes desde la última sync.
 * Útil para mostrar indicador visual de "cambios sin sincronizar".
 */
export async function hasPendingChanges(): Promise<boolean> {
  try {
    const saved = await db.syncState.get('sync');
    if (!saved?.pageToken) return false;

    const { changes } = await getChanges(saved.pageToken);
    return changes.length > 0;
  } catch {
    return false;
  }
}
