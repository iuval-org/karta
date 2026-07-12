/**
 * Operation Queue — cola inteligente de operaciones Drive con debounce,
 * deduplicación, prioridades y backoff exponencial.
 *
 * En lugar de llamar a Drive API directamente, las operaciones se acumulan
 * en una cola y se procesan en batch tras 2s de inactividad.
 *
 * ── Características ──
 * - Debounce 2s: se reinicia el timer con cada push()
 * - Deduplicación: mismo fileId → la última operación reemplaza a la anterior
 * - Prioridad: CREATE(0) > MOVE/RENAME(1) > DELETE(2)
 * - Backoff: 429 → reintenta con 2s, 4s, 8s (máx 3 intentos)
 * - Persistencia: cola guardada en Dexie, se reanuda al recargar la app
 */

import { db } from './db';
import {
  moveItem as driveMoveItem,
  renameItem as driveRenameItem,
  trashItem as driveTrashItem,
} from './drive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationType = 'move' | 'rename' | 'delete' | 'create';

export interface QueuedOperation {
  /** Unique operation ID (uuid). */
  id: string;
  /** Kind of operation. */
  type: OperationType;
  /** Drive file ID being operated on. */
  fileId: string;
  /** Operation-specific payload. */
  payload: Record<string, unknown>;
  /**
   * Priority: lower number = higher priority.
   * 0 = create, 1 = move/rename, 2 = delete
   */
  priority: number;
  /** When the operation was enqueued (timestamp). */
  createdAt: number;
}

export interface PendingResolution {
  resolve: () => void;
  reject: (err: unknown) => void;
}

// ---------------------------------------------------------------------------
// Priority map
// ---------------------------------------------------------------------------

const PRIORITY: Record<OperationType, number> = {
  create: 0,
  move: 1,
  rename: 1,
  delete: 2,
};

// ---------------------------------------------------------------------------
// OperationQueue
// ---------------------------------------------------------------------------

let operationIdCounter = 0;

function generateId(): string {
  operationIdCounter++;
  return `op-${Date.now()}-${operationIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export class OperationQueue {
  static DEBOUNCE_MS = 2000;
  static MAX_RETRIES = 3;

  /**
   * Internal queue: Map<fileId, QueuedOperation>.
   * Using fileId as key gives us natural deduplication.
   */
  private queue = new Map<string, QueuedOperation>();

  /** Resolvers keyed by fileId, so each push() caller can await the result. */
  private resolvers = new Map<string, PendingResolution>();

  /** Retry count per fileId (tracked across debounce cycles). */
  private retries = new Map<string, number>();

  /** The debounce timer handle. */
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** True while flush() is executing operations. */
  private flushing = false;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Enqueue an operation. Returns a Promise that resolves when the operation
   * completes successfully, or rejects after exhausting all retries.
   *
   * The caller typically fires this and forgets (local state is already
   * optimistically updated). If you need to be notified of failure, attach
   * a `.catch()` to the returned Promise.
   */
  push(op: {
    type: OperationType;
    fileId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    // Build the operation object
    const operation: QueuedOperation = {
      id: generateId(),
      type: op.type,
      fileId: op.fileId,
      payload: op.payload,
      priority: PRIORITY[op.type] ?? 1,
      createdAt: Date.now(),
    };

    // ── Deduplication ──────────────────────────────────────────────
    // If the same fileId is already queued, replace it.
    // Carry forward the existing resolver so the old caller's promise
    // also resolves/rejects when the new operation finishes.
    const existingResolver = this.resolvers.get(op.fileId);
    this.queue.set(op.fileId, operation);

    // ── Create a promise for the caller ────────────────────────────
    const promise = new Promise<void>((resolve, reject) => {
      this.resolvers.set(op.fileId, {
        resolve,
        reject: (err: unknown) => {
          // If there's an existing resolver from dedup, reject that too
          if (existingResolver) {
            existingResolver.reject(err);
          }
          reject(err);
        },
      });
    });

    // If this was a dedup replacement, resolve the old resolver immediately
    // (the new operation supersedes it — no need to keep the old one waiting)
    if (existingResolver) {
      existingResolver.resolve();
    }

    // ── Persist to Dexie ───────────────────────────────────────────
    this.persistQueue().catch((err) => {
      console.error('[OpQueue] persist error:', err);
    });

    // ── Reset debounce timer ───────────────────────────────────────
    this.scheduleFlush();

    return promise;
  }

  /**
   * Manually trigger an immediate flush (bypasses debounce).
   * Used when the app is closing or for testing.
   */
  async flushNow(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /**
   * Resume processing from Dexie (call on app startup).
   * Loads any leftover operations and queues them for processing.
   */
  async resumeFromStorage(): Promise<void> {
    try {
      const stored = await db.storedOperations.toArray();
      if (stored.length === 0) return;

      console.log(`[OpQueue] Resuming ${stored.length} operations from Dexie`);

      for (const op of stored) {
        const fileId = op.fileId;
        // Don't overwrite operations already in the in-memory queue
        if (!this.queue.has(fileId)) {
          this.queue.set(fileId, {
            id: op.id,
            type: op.type as OperationType,
            fileId: op.fileId,
            payload: typeof op.payload === 'string' ? JSON.parse(op.payload) : op.payload,
            priority: op.priority,
            createdAt: op.createdAt,
          });
        }
      }

      // Clear stored operations (they're now in memory)
      await db.storedOperations.clear();

      // Schedule flush for any resumed operations
      if (this.queue.size > 0) {
        this.scheduleFlush();
      }
    } catch (err) {
      console.error('[OpQueue] Error resuming from storage:', err);
    }
  }

  /** Number of operations currently queued. */
  get size(): number {
    return this.queue.size;
  }

  /** Peek at queued operations (copy, for inspection/testing). */
  getQueued(): QueuedOperation[] {
    return Array.from(this.queue.values());
  }

  /** Clear all queued operations and resolvers. */
  clear(): void {
    this.queue.clear();
    this.retries.clear();
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Remove resolvers without rejecting (push() promises stay pending,
    // but the queue is empty so they'll never resolve — the caller should
    // not await push() after clear()).
    this.resolvers.clear();
    // Clear persisted queue
    db.storedOperations.clear().catch(() => {});
  }

  // -----------------------------------------------------------------------
  // Private: scheduling
  // -----------------------------------------------------------------------

  private scheduleFlush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch((err) => {
        console.error('[OpQueue] flush error:', err);
      });
    }, OperationQueue.DEBOUNCE_MS);
  }

  // -----------------------------------------------------------------------
  // Private: flush & execute
  // -----------------------------------------------------------------------

  /**
   * Process the queue. Operations are sorted by priority (highest first),
   * then by creation time (oldest first within same priority).
   * Each operation is executed sequentially so order is predictable.
   */
  private async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.queue.size === 0) return;

    this.flushing = true;

    try {
      // 1. Sort operations: priority ASC, then createdAt ASC
      const sorted = Array.from(this.queue.entries()).sort(([, a], [, b]) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.createdAt - b.createdAt;
      });

      // 2. Execute each operation sequentially
      for (const [fileId, operation] of sorted) {
        try {
          await this.executeOperation(operation);

          // Success → clean up
          this.queue.delete(fileId);
          this.retries.delete(fileId);

          const resolver = this.resolvers.get(fileId);
          if (resolver) {
            resolver.resolve();
            this.resolvers.delete(fileId);
          }
        } catch (err) {
          // Check if we should retry
          const isRateLimit = this.isRateLimitError(err);
          const currentRetries = this.retries.get(fileId) ?? 0;

          if (isRateLimit && currentRetries < OperationQueue.MAX_RETRIES) {
            // Schedule individual retry with backoff
            const backoffMs = Math.pow(2, currentRetries + 1) * 1000; // 2s, 4s, 8s
            this.retries.set(fileId, currentRetries + 1);

            console.warn(
              `[OpQueue] 429 on ${operation.type}(${fileId}), ` +
              `retry ${currentRetries + 1}/${OperationQueue.MAX_RETRIES} in ${backoffMs}ms`,
            );

            // Schedule this single operation for retry after backoff
            setTimeout(() => {
              // Re-insert into queue if not already there (might have been cleared)
              if (!this.queue.has(fileId)) {
                this.queue.set(fileId, operation);
              }
              // Directly flush without debounce (backoff IS the debounce)
              this.flush().catch((flushErr) => {
                console.error('[OpQueue] retry flush error:', flushErr);
              });
            }, backoffMs);
          } else {
            // Non-retryable error or exhausted retries → reject
            console.error(`[OpQueue] ${operation.type}(${fileId}) failed:`, err);

            this.queue.delete(fileId);
            this.retries.delete(fileId);

            const resolver = this.resolvers.get(fileId);
            if (resolver) {
              resolver.reject(err);
              this.resolvers.delete(fileId);
            }
          }
        }
      }

      // 3. Persist remaining queue (in case of partial execution)
      if (this.queue.size > 0) {
        await this.persistQueue();
      } else {
        await db.storedOperations.clear();
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Execute a single operation against the Drive API.
   */
  private async executeOperation(operation: QueuedOperation): Promise<void> {
    switch (operation.type) {
      case 'move': {
        const newParentId = operation.payload.newParentId as string;
        const oldParentId = operation.payload.oldParentId as string;
        await driveMoveItem(operation.fileId, newParentId, oldParentId);
        break;
      }

      case 'rename': {
        const newName = operation.payload.newName as string;
        await driveRenameItem(operation.fileId, newName);
        break;
      }

      case 'delete': {
        await driveTrashItem(operation.fileId);
        break;
      }

      case 'create': {
        // Create operations go through the existing creation flow
        // This is just a placeholder for future batch-creation support
        console.warn('[OpQueue] create operation not yet supported via queue');
        break;
      }

      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`);
    }
  }

  // -----------------------------------------------------------------------
  // Private: error handling
  // -----------------------------------------------------------------------

  /**
   * Detect if an error is a Drive API rate-limit (HTTP 429).
   */
  private isRateLimitError(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const e = err as { status?: number; message?: string };
      if (e.status === 429) return true;
      if (typeof e.message === 'string' && e.message.includes('429')) return true;
      if (typeof e.message === 'string' && e.message.includes('Límite de solicitudes')) return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Private: persistence
  // -----------------------------------------------------------------------

  /**
   * Save the current in-memory queue to Dexie so it survives page reloads.
   */
  private async persistQueue(): Promise<void> {
    const operations = Array.from(this.queue.values()).map((op) => ({
      id: op.id,
      type: op.type,
      fileId: op.fileId,
      payload: JSON.stringify(op.payload),
      priority: op.priority,
      createdAt: op.createdAt,
    }));

    if (operations.length === 0) {
      await db.storedOperations.clear();
      return;
    }

    await db.storedOperations.bulkPut(operations);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const operationQueue = new OperationQueue();
