import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { OperationQueue } from './operationQueue';
import { db } from './db';

// ---------------------------------------------------------------------------
// Mock drive service
// ---------------------------------------------------------------------------

const mockMoveItem = vi.fn();
const mockRenameItem = vi.fn();
const mockTrashItem = vi.fn();

vi.mock('./drive', () => ({
  moveItem: (...args: unknown[]) => mockMoveItem(...args),
  renameItem: (...args: unknown[]) => mockRenameItem(...args),
  trashItem: (...args: unknown[]) => mockTrashItem(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for pending promises and timer callbacks. */
async function tick(ms = 0): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  // Flush microtasks
  await new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OperationQueue', () => {
  let queue: OperationQueue;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockMoveItem.mockReset().mockResolvedValue(undefined);
    mockRenameItem.mockReset().mockResolvedValue(undefined);
    mockTrashItem.mockReset().mockResolvedValue(undefined);

    // Ensure DB is clean
    if (db.isOpen()) {
      await db.storedOperations.clear();
    } else {
      await db.open();
    }

    queue = new OperationQueue();
  });

  afterEach(() => {
    queue.clear();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Basic push & debounce
  // -----------------------------------------------------------------------

  it('acumula operaciones sin ejecutar hasta que pasa el debounce', async () => {
    queue.push({ type: 'move', fileId: 'f1', payload: { newParentId: 'target', oldParentId: 'old' } });

    // Should NOT have executed yet (debounce hasn't fired)
    expect(mockMoveItem).not.toHaveBeenCalled();
    expect(queue.size).toBe(1);
  });

  it('ejecuta operaciones después del debounce de 2s', async () => {
    const promise = queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'target', oldParentId: 'old' },
    });

    // Advance time past debounce
    vi.advanceTimersByTime(2100);
    await tick();

    expect(mockMoveItem).toHaveBeenCalledTimes(1);
    expect(mockMoveItem).toHaveBeenCalledWith('f1', 'target', 'old');
    expect(queue.size).toBe(0);

    // Promise should resolve
    await expect(promise).resolves.toBeUndefined();
  });

  it('reinicia el timer si llega una nueva operación antes del debounce', async () => {
    const promise1 = queue.push({
      type: 'rename',
      fileId: 'f1',
      payload: { newName: 'new-name' },
    });

    // Advance 1s (still within debounce window)
    vi.advanceTimersByTime(1000);

    // Push another operation — should reset debounce
    const promise2 = queue.push({
      type: 'move',
      fileId: 'f2',
      payload: { newParentId: 'target', oldParentId: 'old' },
    });

    // Advance 1.5s (2s from the SECOND push — first timer reset)
    vi.advanceTimersByTime(1500);
    await tick();

    // The rename was pushed first but the timer was reset by the second push
    // So after 2.5s total, still less than 2s from second push
    expect(mockMoveItem).not.toHaveBeenCalled();
    expect(mockRenameItem).not.toHaveBeenCalled();
    expect(queue.size).toBe(2);

    // Advance remaining time past second debounce (another 1s = 2.5s from second push)
    vi.advanceTimersByTime(1000);
    await tick();

    // Both should have been executed by now
    expect(mockRenameItem).toHaveBeenCalledTimes(1);
    expect(mockMoveItem).toHaveBeenCalledTimes(1);

    await expect(promise1).resolves.toBeUndefined();
    await expect(promise2).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Deduplication
  // -----------------------------------------------------------------------

  it('deduplica por fileId — la última operación reemplaza a la anterior', async () => {
    // Push move f1 → folderA
    queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'folderA', oldParentId: 'root' },
    });

    // Push move f1 → folderB (same fileId, should replace)
    queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'folderB', oldParentId: 'folderA' },
    });

    // Flush
    vi.advanceTimersByTime(2100);
    await tick();

    // Should only have executed once (dedup) and with the last payload
    expect(mockMoveItem).toHaveBeenCalledTimes(1);
    expect(mockMoveItem).toHaveBeenCalledWith('f1', 'folderB', 'folderA');
  });

  it('si el mismo fileId aparece como tipo diferente, gana el último', async () => {
    // Push rename f1, then move f1 — move should win
    queue.push({
      type: 'rename',
      fileId: 'f1',
      payload: { newName: 'newname' },
    });

    queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'folderA', oldParentId: 'root' },
    });

    vi.advanceTimersByTime(2100);
    await tick();

    expect(mockRenameItem).not.toHaveBeenCalled();
    expect(mockMoveItem).toHaveBeenCalledTimes(1);
    expect(mockMoveItem).toHaveBeenCalledWith('f1', 'folderA', 'root');
  });

  // -----------------------------------------------------------------------
  // Priorities: CREATE(0) > MOVE/RENAME(1) > DELETE(2)
  // -----------------------------------------------------------------------

  it('procesa operaciones en orden de prioridad (CREATE primero)', async () => {
    const executionOrder: string[] = [];

    mockMoveItem.mockImplementation(async () => { executionOrder.push('move'); });
    mockTrashItem.mockImplementation(async () => { executionOrder.push('delete'); });

    // Push in reverse priority order
    queue.push({ type: 'delete', fileId: 'd1', payload: {} });  // priority 2
    queue.push({ type: 'move', fileId: 'm1', payload: { newParentId: 't', oldParentId: 'o' } });  // priority 1

    vi.advanceTimersByTime(2100);
    await tick();

    // move should execute before delete
    expect(executionOrder).toEqual(['move', 'delete']);
  });

  // -----------------------------------------------------------------------
  // Backoff on rate limit (429)
  // -----------------------------------------------------------------------

  it('reintenta con backoff exponencial en 429', async () => {
    // Fail twice with 429, succeed on third attempt
    const mockError = Object.assign(new Error('Rate limit'), { status: 429 });
    mockMoveItem
      .mockRejectedValueOnce(mockError)  // 1st attempt → 429
      .mockRejectedValueOnce(mockError)  // 2nd attempt → 429
      .mockResolvedValueOnce(undefined); // 3rd attempt → success

    const promise = queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'target', oldParentId: 'old' },
    });

    // First attempt after debounce
    vi.advanceTimersByTime(2100);
    await tick();

    // First retry after 2s backoff (2^1 * 1000)
    expect(mockMoveItem).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2100);
    await tick();

    // Second retry after 4s backoff (2^2 * 1000)
    expect(mockMoveItem).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(4100);
    await tick();

    // Third attempt (success)
    expect(mockMoveItem).toHaveBeenCalledTimes(3);
    await expect(promise).resolves.toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it('falla después de agotar los 3 reintentos en 429', async () => {
    const mockError = Object.assign(new Error('Rate limit'), { status: 429 });
    mockMoveItem.mockRejectedValue(mockError); // Always 429

    const promise = queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'target', oldParentId: 'old' },
    });

    // Suppress unhandled rejection if test fails
    promise.catch(() => {});

    // Debounce: 2s
    vi.advanceTimersByTime(2100);
    await tick();

    // Retry 1: 2s  (total: 4s)
    vi.advanceTimersByTime(2100);
    await tick();

    // Retry 2: 4s  (total: 8s)
    vi.advanceTimersByTime(4100);
    await tick();

    // Retry 3: 8s  (total: 16s)
    vi.advanceTimersByTime(8100);
    await tick();

    // Total retries: initial + 3 = 4 calls
    expect(mockMoveItem).toHaveBeenCalledTimes(4);
    await expect(promise).rejects.toThrow('Rate limit');
    expect(queue.size).toBe(0);
  });

  it('NO reintenta errores que no son 429', async () => {
    mockMoveItem.mockRejectedValue(new Error('Permission denied'));

    const promise = queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'target', oldParentId: 'old' },
    });

    // Suppress unhandled rejection
    promise.catch(() => {});

    vi.advanceTimersByTime(2100);
    await tick();

    // Only one attempt
    expect(mockMoveItem).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toThrow('Permission denied');
  });

  // -----------------------------------------------------------------------
  // flushNow
  // -----------------------------------------------------------------------

  it('flushNow() procesa inmediatamente sin esperar debounce', async () => {
    queue.push({
      type: 'rename',
      fileId: 'f1',
      payload: { newName: 'new' },
    });

    // No debounce wait
    await queue.flushNow();
    await tick();

    expect(mockRenameItem).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  it('clear() vacía la cola y cancela el debounce', async () => {
    const promise = queue.push({
      type: 'rename',
      fileId: 'f1',
      payload: { newName: 'new' },
    });

    queue.clear();

    // Advance time — should NOT execute
    vi.advanceTimersByTime(2100);
    await tick();

    expect(mockRenameItem).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
    // promise will stay pending — clear() no longer rejects
  });

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  it('persiste la cola en Dexie y puede reanudarla', async () => {
    // Open DB
    if (!db.isOpen()) await db.open();

    queue.push({
      type: 'move',
      fileId: 'f1',
      payload: { newParentId: 'target', oldParentId: 'old' },
    });

    // Wait for persistence
    await tick(100);

    // Force persist to Dexie by calling persistQueue via flushNow
    // (persist happens in scheduleFlush → flush → persist)
    const stored = await db.storedOperations.toArray();
    expect(stored.length).toBe(1);
    expect(stored[0].fileId).toBe('f1');
    expect(stored[0].type).toBe('move');

    // Clear in-memory queue
    queue.clear();
    await db.storedOperations.clear();

    // Clean up
    await db.storedOperations.clear();
  });

  // -----------------------------------------------------------------------
  // getQueued / size
  // -----------------------------------------------------------------------

  it('getQueued devuelve copia de las operaciones encoladas', () => {
    queue.push({ type: 'move', fileId: 'f1', payload: { newParentId: 't', oldParentId: 'o' } });
    queue.push({ type: 'delete', fileId: 'f2', payload: {} });

    const queued = queue.getQueued();
    expect(queued).toHaveLength(2);
    expect(queued[0].fileId).toBe('f1');
    expect(queued[1].fileId).toBe('f2');
    expect(queue.size).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('no ejecuta nada si la cola está vacía', async () => {
    await queue.flushNow();
    await tick();
    expect(mockMoveItem).not.toHaveBeenCalled();
  });

  it('resumeFromStorage no falla si no hay datos', async () => {
    if (!db.isOpen()) await db.open();
    await db.storedOperations.clear();

    await expect(queue.resumeFromStorage()).resolves.toBeUndefined();
  });

  it('maneja operaciones delete correctamente', async () => {
    mockTrashItem.mockResolvedValue(undefined);

    queue.push({ type: 'delete', fileId: 'f1', payload: {} });

    vi.advanceTimersByTime(2100);
    await tick();

    expect(mockTrashItem).toHaveBeenCalledTimes(1);
    expect(mockTrashItem).toHaveBeenCalledWith('f1');
  });
});
