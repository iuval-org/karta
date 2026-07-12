/**
 * Firestore Sync — sincronización de posiciones de nodos con Firestore.
 *
 * Firestore es el source of truth para posiciones de nodos.
 * Dexie queda como cache local de lectura rápida + offline fallback.
 *
 * ── Estrategia ──
 * - Escritura: Dexie primero (instantáneo), Firestore en background
 * - Lectura: Firestore primero, Dexie como fallback
 * - Tiempo real: onSnapshot para recibir cambios de otros dispositivos
 */

import {
  doc,
  getDocs,
  collection,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  getDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from './firebase';
import type { NodePosition } from './db';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS_COLLECTION = 'positions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirestorePosition {
  fileId: string;
  folderId: string;
  x: number;
  y: number;
  zIndex: number;
  tabId: string;
  updatedAt: number;
  width?: number;
  height?: number;
}

export type RemoteChangeCallback = (positions: NodePosition[]) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the Firestore document path for a user's position.
 * Structure: users/{userId}/positions/{docId}
 */
function positionDocRef(userId: string, fileId: string) {
  return doc(firestore, 'users', userId, POSITIONS_COLLECTION, fileId);
}

/**
 * Build the Firestore collection reference for a user's positions.
 */
function positionsColRef(userId: string) {
  return collection(firestore, 'users', userId, POSITIONS_COLLECTION);
}

/**
 * Convert a FirestorePosition to a NodePosition (tabId-scoped).
 */
function toNodePosition(fp: FirestorePosition): NodePosition {
  return {
    fileId: fp.fileId,
    x: fp.x,
    y: fp.y,
    tabId: fp.tabId ?? '',
    ...(fp.width != null && fp.height != null
      ? { width: fp.width, height: fp.height }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upsert a batch of positions to Firestore.
 * Escribe en Firestore como operación en background.
 * Las posiciones existentes se sobrescriben (por fileId).
 *
 * @param userId - UID del usuario autenticado
 * @param positions - Array de NodePosition a sincronizar
 */
export async function syncToFirestore(
  userId: string,
  positions: NodePosition[],
): Promise<void> {
  if (!userId || positions.length === 0) return;

  try {
    const batch = writeBatch(firestore);
    const now = Date.now();

    for (const pos of positions) {
      const ref = positionDocRef(userId, pos.fileId);
      const data: FirestorePosition = {
        fileId: pos.fileId,
        folderId: pos.tabId,
        x: pos.x,
        y: pos.y,
        zIndex: 0,
        tabId: pos.tabId,
        updatedAt: now,
      };
      if (pos.width != null && pos.height != null) {
        data.width = pos.width;
        data.height = pos.height;
      }
      batch.set(ref, data);
    }

    await batch.commit();
  } catch (err) {
    console.warn('[firestoreSync] syncToFirestore error (non-fatal):', err);
    // Non-fatal — Dexie cache is still valid
  }
}

/**
 * Load all positions for a user from Firestore.
 * Returns positions filtered by the given scope (tabId or folderId).
 *
 * @param userId - UID del usuario autenticado
 * @param scope - Tab ID o folder ID para filtrar (mayormente 'root')
 * @returns Array de NodePosition
 */
export async function syncFromFirestore(
  userId: string,
  scope?: string,
): Promise<NodePosition[]> {
  if (!userId) return [];

  try {
    let q;
    if (scope) {
      q = query(
        positionsColRef(userId),
        where('tabId', '==', scope),
      );
    } else {
      q = query(positionsColRef(userId));
    }

    const snapshot = await getDocs(q);
    const positions: NodePosition[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as FirestorePosition;
      positions.push(toNodePosition(data));
    });

    return positions;
  } catch (err) {
    console.warn('[firestoreSync] syncFromFirestore error, falling back to Dexie:', err);
    return []; // Empty array signals caller to use Dexie fallback
  }
}

/**
 * Subscribe to real-time changes from Firestore for a user's positions.
 * Calls `callback` with updated positions whenever a change is detected.
 * Returns an unsubscribe function.
 *
 * @param userId - UID del usuario autenticado
 * @param scope - Optional scope (tabId) to filter changes
 * @param callback - Called with updated NodePosition[] on every change
 * @returns Unsubscribe function to stop listening
 */
export function onRemoteChange(
  userId: string,
  callback: RemoteChangeCallback,
  scope?: string,
): Unsubscribe {
  let q;
  if (scope) {
    q = query(
      positionsColRef(userId),
      where('tabId', '==', scope),
    );
  } else {
    q = query(positionsColRef(userId));
  }

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const positions: NodePosition[] = [];
      snapshot.forEach((docChange) => {
        const data = docChange.data() as FirestorePosition;
        positions.push(toNodePosition(data));
      });

      if (positions.length > 0) {
        callback(positions);
      }
    },
    (err) => {
      console.warn('[firestoreSync] onSnapshot error:', err);
    },
  );

  return unsubscribe;
}

/**
 * Remove a single position from Firestore (e.g., when a node is deleted).
 */
export async function removePosition(
  userId: string,
  fileId: string,
): Promise<void> {
  if (!userId || !fileId) return;

  try {
    await deleteDoc(positionDocRef(userId, fileId));
  } catch (err) {
    console.warn('[firestoreSync] removePosition error:', err);
  }
}

/**
 * Remove all positions for a given scope from Firestore.
 * Used when resetting layout for a folder.
 */
export async function removePositionsByScope(
  userId: string,
  scope: string,
): Promise<void> {
  if (!userId || !scope) return;

  try {
    const q = query(positionsColRef(userId), where('tabId', '==', scope));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const batch = writeBatch(firestore);
    snapshot.forEach((d) => {
      batch.delete(d.ref);
    });
    await batch.commit();
  } catch (err) {
    console.warn('[firestoreSync] removePositionsByScope error:', err);
  }
}

/**
 * Check if Firestore is reachable by attempting to read a trivial document.
 * Returns true if the user's project document is accessible (or Firestore responds).
 */
export async function checkFirestoreReachable(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    // Try to read a non-existent doc — if it responds at all, Firestore is reachable
    const ref = doc(firestore, 'users', userId, POSITIONS_COLLECTION, '_health');
    await getDoc(ref);
    return true;
  } catch {
    return false;
  }
}
