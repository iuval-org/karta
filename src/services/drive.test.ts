import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUseMock, mapToDriveItem, createItem, moveItem, trashItem, renameItem } from './drive';
import { useAuthStore } from '../stores/authStore';
import { MOCK_ITEMS } from '../data/mockDriveItems';

// ---------------------------------------------------------------------------
// Mock authStore so getUseMock can read oAuthAccessToken
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
// Mock firebase — authStore imports it at module top-level
// ---------------------------------------------------------------------------
vi.mock('./firebase', () => ({
  auth: {},
  googleProvider: { addScope: vi.fn(), scopes: [] },
}));

// ---------------------------------------------------------------------------
// Helper to set mock token state
// ---------------------------------------------------------------------------
function setMockToken(token: string | null) {
  const mock = vi.mocked(useAuthStore.getState);
  mock.mockReturnValue({
    oAuthAccessToken: token,
    getAccessToken: vi.fn().mockResolvedValue(token),
  } as unknown as ReturnType<typeof useAuthStore.getState>);
}

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  setMockToken(null);
});

describe('getUseMock()', () => {
  it('devuelve true cuando no hay token', () => {
    expect(getUseMock()).toBe(true);
  });

  it('devuelve false cuando hay token en sessionStorage', () => {
    setMockToken('fake-token-123');
    expect(getUseMock()).toBe(false);
  });

  it('cambia dinámicamente después de login', () => {
    // Initially no token
    expect(getUseMock()).toBe(true);

    // After login
    setMockToken('token-after-login');
    expect(getUseMock()).toBe(false);

    // After logout
    setMockToken(null);
    expect(getUseMock()).toBe(true);
  });
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
  beforeEach(() => {
    // Clear mock items before each test
    MOCK_ITEMS.splice(0, MOCK_ITEMS.length);
    // Reset to mock mode
    setMockToken(null);
  });

  it('mock mode agrega a MOCK_ITEMS', async () => {
    const item = await createItem('Nueva Carpeta', 'application/vnd.google-apps.folder', 'root');
    expect(item.name).toBe('Nueva Carpeta');
    expect(item.isFolder).toBe(true);
    expect(MOCK_ITEMS).toHaveLength(1);
    expect(MOCK_ITEMS[0].name).toBe('Nueva Carpeta');
  });

  it('mock mode crea item sin parentId cuando parentFolderId es root', async () => {
    const item = await createItem('Root File', 'application/pdf', 'root');
    expect(item.parentId).toBeUndefined();
  });

  it('mock mode asigna parentId cuando hay folder padre', async () => {
    const item = await createItem('Child File', 'text/plain', 'f1');
    expect(item.parentId).toBe('f1');
  });

  it('real mode llama a gapi.drive.files.create', async () => {
    setMockToken('real-token');
    const gapiCreate = vi.mocked(window.gapi.client!.drive.files.create);
    gapiCreate.mockResolvedValue({ result: { id: 'gapi-1', name: 'Real Doc', mimeType: 'application/vnd.google-apps.document' } });

    await createItem('Real Doc', 'application/vnd.google-apps.document', 'root');

    expect(gapiCreate).toHaveBeenCalledTimes(1);
    const [body] = gapiCreate.mock.calls[0];
    expect(body.name).toBe('Real Doc');
    expect(body.mimeType).toBe('application/vnd.google-apps.document');
    // parents should NOT be included for root
    expect((body as Record<string, unknown>).parents).toBeUndefined();
  });
});

describe('moveItem()', () => {
  beforeEach(() => {
    MOCK_ITEMS.splice(0, MOCK_ITEMS.length);
    setMockToken(null);
  });

  it('mock mode actualiza parentId', async () => {
    MOCK_ITEMS.push({
      id: 'movable-1', name: 'Movable', mimeType: 'text/plain',
      webViewLink: '#', modifiedTime: '', isFolder: false,
    });

    await moveItem('movable-1', 'target-folder', 'old-parent');
    const item = MOCK_ITEMS.find((i) => i.id === 'movable-1');
    expect(item?.parentId).toBe('target-folder');
  });

  it('mock mode lanza error si no encuentra item', async () => {
    await expect(moveItem('nonexistent', 'target', 'old')).rejects.toThrow('Archivo no encontrado');
  });
});

describe('trashItem()', () => {
  beforeEach(() => {
    MOCK_ITEMS.splice(0, MOCK_ITEMS.length);
    setMockToken(null);
  });

  it('mock mode remueve de MOCK_ITEMS', async () => {
    MOCK_ITEMS.push({
      id: 'trashable-1', name: 'Trash Me', mimeType: 'text/plain',
      webViewLink: '#', modifiedTime: '', isFolder: false,
    });
    expect(MOCK_ITEMS).toHaveLength(1);

    await trashItem('trashable-1');
    expect(MOCK_ITEMS).toHaveLength(0);
  });

  it('mock mode lanza error si no encuentra item', async () => {
    await expect(trashItem('nonexistent')).rejects.toThrow('Archivo no encontrado');
  });
});

describe('renameItem()', () => {
  beforeEach(() => {
    MOCK_ITEMS.splice(0, MOCK_ITEMS.length);
    setMockToken(null);
  });

  it('mock mode actualiza el nombre', async () => {
    MOCK_ITEMS.push({
      id: 'renamable-1', name: 'Old Name', mimeType: 'text/plain',
      webViewLink: '#', modifiedTime: '', isFolder: false,
    });

    await renameItem('renamable-1', 'New Name');
    const item = MOCK_ITEMS.find((i) => i.id === 'renamable-1');
    expect(item?.name).toBe('New Name');
  });

  it('mock mode lanza error si no encuentra item', async () => {
    await expect(renameItem('nonexistent', 'New Name')).rejects.toThrow('Archivo no encontrado');
  });
});
