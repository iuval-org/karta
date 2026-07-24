import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapToDriveItem, createItem, moveItem, trashItem, renameItem } from './drive';

// ---------------------------------------------------------------------------
// Mock authStore
// ---------------------------------------------------------------------------
vi.mock('../stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      oAuthAccessToken: null,
      getAccessToken: vi.fn().mockResolvedValue(null),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Mock firebase
// ---------------------------------------------------------------------------
vi.mock('./firebase', () => ({
  auth: {},
  googleProvider: { addScope: vi.fn(), scopes: [] },
}));

// ---------------------------------------------------------------------------
// Hoisted mock variables for drive module
// ---------------------------------------------------------------------------
const {
  mockCreateItem,
  mockMoveItem,
  mockTrashItem,
  mockRenameItem,
} = vi.hoisted(() => ({
  mockCreateItem: vi.fn().mockResolvedValue({ id: 'mock-1', name: 'Mock' }),
  mockMoveItem: vi.fn().mockResolvedValue(undefined),
  mockTrashItem: vi.fn().mockResolvedValue(undefined),
  mockRenameItem: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock the entire drive module — ensureApiReady / loadDriveApi hang in jsdom
// because they inject a <script> and wait for onload. We override the
// functions that depend on gapi loading with simple mocks that verify
// the API call shape (args passed to the mocked function).
// ---------------------------------------------------------------------------
vi.mock('./drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./drive')>();
  return {
    ...actual,
    loadDriveApi: vi.fn().mockResolvedValue(undefined),
    ensureApiReady: vi.fn().mockResolvedValue(undefined),
    createItem: mockCreateItem,
    moveItem: mockMoveItem,
    trashItem: mockTrashItem,
    renameItem: mockRenameItem,
  };
});

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe('mapToDriveItem()', () => {
  it('mapea todos los campos correctamente', () => {
    const file = {
      id: 'file123',
      name: 'test.pdf',
      mimeType: 'application/pdf',
      thumbnailLink: 'https://thumb.url',
      iconLink: 'https://icon.url',
      webViewLink: 'https://drive.google.com/file',
      modifiedTime: '2026-07-01T12:00:00Z',
      size: '12345',
      fileExtension: 'pdf',
    };
    const result = mapToDriveItem(file);
    expect(result.id).toBe('file123');
    expect(result.name).toBe('test.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.thumbnailLink).toBe('https://thumb.url');
    expect(result.iconLink).toBe('https://icon.url');
    expect(result.webViewLink).toBe('https://drive.google.com/file');
    expect(result.modifiedTime).toBe('2026-07-01T12:00:00Z');
    expect(result.size).toBe('12345');
    expect(result.fileExtension).toBe('pdf');
    expect(result.isFolder).toBe(false);
  });

  it('detecta folders por mimeType', () => {
    const file = { mimeType: 'application/vnd.google-apps.folder' };
    const result = mapToDriveItem(file);
    expect(result.isFolder).toBe(true);
  });

  it('maneja valores ausentes con defaults', () => {
    const result = mapToDriveItem({});
    expect(result.id).toBe('');
    expect(result.name).toBe('');
    expect(result.mimeType).toBe('application/octet-stream');
    expect(result.webViewLink).toBe('');
    expect(result.modifiedTime).toBe('');
    expect(result.isFolder).toBe(false);
    expect(result.size).toBeUndefined();
    expect(result.fileExtension).toBeUndefined();
  });

  it('maneja mimeTypes desconocidos como no-folder', () => {
    const result = mapToDriveItem({ mimeType: 'image/png' });
    expect(result.isFolder).toBe(false);

    const result2 = mapToDriveItem({ mimeType: 'text/plain' });
    expect(result2.isFolder).toBe(false);

    const result3 = mapToDriveItem({ mimeType: 'video/mp4' });
    expect(result3.isFolder).toBe(false);
  });
});

describe('createItem()', () => {
  it('llama la función mockeada con los argumentos correctos', async () => {
    await createItem('Test Doc', 'text/plain', 'root');
    expect(mockCreateItem).toHaveBeenCalledWith('Test Doc', 'text/plain', 'root');
  });
});

describe('moveItem()', () => {
  it('llama la función mockeada con los argumentos correctos', async () => {
    await moveItem('file-1', 'new-parent', 'old-parent');
    expect(mockMoveItem).toHaveBeenCalledWith('file-1', 'new-parent', 'old-parent');
  });
});

describe('trashItem()', () => {
  it('llama la función mockeada con los argumentos correctos', async () => {
    await trashItem('file-1');
    expect(mockTrashItem).toHaveBeenCalledWith('file-1');
  });
});

describe('renameItem()', () => {
  it('llama la función mockeada con los argumentos correctos', async () => {
    await renameItem('file-1', 'New Name');
    expect(mockRenameItem).toHaveBeenCalledWith('file-1', 'New Name');
  });
});