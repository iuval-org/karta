import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCanvasStore } from './canvasStore';
import type { DriveItem } from '../types/drive';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

// Mock authStore
vi.mock('../stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      oAuthAccessToken: null,
      getAccessToken: vi.fn().mockResolvedValue(null),
    })),
  },
}));

// Mock firebase
vi.mock('../services/firebase', () => ({
  auth: {},
  googleProvider: { addScope: vi.fn(), scopes: [] },
}));

// Mock drive module
const mockListChildren = vi.hoisted(() => vi.fn());
vi.mock('../services/drive', () => ({
  listChildren: (folderId: string) => mockListChildren(folderId),
  listAllChildren: (folderId: string) => mockListChildren(folderId),
  moveItem: vi.fn(),
  renameItem: vi.fn(),
  createItem: vi.fn(),
  trashItem: vi.fn(),
  trashItems: vi.fn(),
}));

// Mock db module — properly chained Dexie API
const mockWhere = vi.hoisted(() => vi.fn(() => ({ equals: vi.fn().mockResolvedValue([]) })));
vi.mock('../services/db', () => ({
  db: {
    positions: { where: mockWhere, bulkPut: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
    edges: { where: mockWhere, bulkPut: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
    folderState: { where: mockWhere, bulkPut: vi.fn().mockResolvedValue(undefined), clear: vi.fn() },
    storedOperations: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue(undefined),
      bulkPut: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    settings: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      bulkGet: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    tabs: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// Mock layout
vi.mock('../utils/layout', () => ({
  calcGridLayout: vi.fn((items: DriveItem[]) =>
    items.map((item, index) => ({
      id: item.id,
      position: { x: (index % 6) * 220, y: Math.floor(index / 6) * 160 },
      data: item,
    })),
  ),
}));

// Mock debounce — execute immediately but track calls
const mockDebounceFn = vi.hoisted(() => vi.fn());
vi.mock('../utils/debounce', () => ({
  debounce: vi.fn((fn: any) => {
    const debounced = (...args: any[]) => {
      mockDebounceFn(...args);
      return fn(...args);
    };
    return debounced;
  }),
}));

// Mock operationQueue
const mockOpQueue = vi.hoisted(() => ({
  push: vi.fn(() => Promise.resolve()),
  resumeFromStorage: vi.fn(),
  flushNow: vi.fn(),
  clear: vi.fn(),
  getQueued: vi.fn(() => [] as any[]),
  size: 0,
}));
vi.mock('../services/operationQueue', () => ({
  operationQueue: mockOpQueue,
}));

// Mock toastStore
vi.mock('./toastStore', () => ({
  useToastStore: {
    getState: vi.fn(() => ({
      addToast: vi.fn(),
    })),
  },
}));

// Mock rootStore
const mockRootFolderId = vi.hoisted(() => vi.fn(() => 'root-folder-id'));
vi.mock('./rootStore', () => ({
  useRootStore: {
    getState: vi.fn(() => ({
      rootFolderId: mockRootFolderId(),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Sample data used in tests
// ---------------------------------------------------------------------------

const ROOT_FOLDER_ID = 'root-folder-id';

const MOCK_ROOT_ITEMS: DriveItem[] = [
  {
    id: 'f1', name: 'Guion', mimeType: 'application/vnd.google-apps.folder',
    webViewLink: '#', modifiedTime: '', isFolder: true, parentId: ROOT_FOLDER_ID,
  },
  {
    id: 'f2', name: 'Referencias Visuales', mimeType: 'application/vnd.google-apps.folder',
    webViewLink: '#', modifiedTime: '', isFolder: true, parentId: ROOT_FOLDER_ID,
  },
  {
    id: 'f3', name: 'Assets', mimeType: 'application/vnd.google-apps.folder',
    webViewLink: '#', modifiedTime: '', isFolder: true, parentId: ROOT_FOLDER_ID,
  },
  {
    id: 'file1', name: 'Texto Final.pdf', mimeType: 'application/pdf',
    webViewLink: '#', modifiedTime: '', isFolder: false, parentId: ROOT_FOLDER_ID,
  },
];

const MOCK_CHILD_ITEMS: DriveItem[] = [
  {
    id: 'child1', name: 'Escena 1', mimeType: 'text/plain',
    webViewLink: '#', modifiedTime: '', isFolder: false, parentId: 'f1',
  },
  {
    id: 'child2', name: 'Escena 2', mimeType: 'text/plain',
    webViewLink: '#', modifiedTime: '', isFolder: false, parentId: 'f1',
  },
];

beforeEach(() => {
  // Reset store state
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    allItems: [],
    isLoading: false,
    error: null,
    errorType: null,
    expandedFolders: {},
    layout: 'grid',
    currentFolderId: '',
    activeTabId: 'root',
    selectedNodeIds: [],
    panMode: false,
  });

  vi.clearAllMocks();
});

describe('Canvas store — loadItems()', () => {
  it('carga items desde Drive API para folder root', async () => {
    mockListChildren.mockResolvedValue(MOCK_ROOT_ITEMS);

    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.allItems).toEqual(MOCK_ROOT_ITEMS);
    expect(state.nodes.length).toBe(MOCK_ROOT_ITEMS.length);
  });

  it('filtra root items cuando se pasa folderId específico', async () => {
    mockListChildren.mockResolvedValue(MOCK_CHILD_ITEMS);

    await useCanvasStore.getState().loadItems('f1');

    const state = useCanvasStore.getState();
    expect(state.nodes.length).toBe(MOCK_CHILD_ITEMS.length);
    for (const node of state.nodes) {
      expect(node.data.driveItem.parentId).toBe('f1');
    }
  });

  it('maneja error de API gracefulmente', async () => {
    mockListChildren.mockRejectedValue(new Error('Network error'));

    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Network error');
    expect(state.errorType).toBe('connection');
  });

  it('no se rompe si hydrateFromDexie falla', async () => {
    mockListChildren.mockResolvedValue(MOCK_ROOT_ITEMS);
    // Mock DB query to throw
    mockWhere.mockImplementation(() => { throw new Error('DB error'); });

    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    expect(state.isLoading).toBe(false);
    // Should still have loaded the items even if hydration failed
    expect(state.nodes.length).toBe(MOCK_ROOT_ITEMS.length);
  });

  it('crea nodes con tipo correcto (folderNode/fileNode)', async () => {
    mockListChildren.mockResolvedValue(MOCK_ROOT_ITEMS);

    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    for (const node of state.nodes) {
      const item = MOCK_ROOT_ITEMS.find((i) => i.id === node.id);
      if (item?.isFolder) {
        expect(node.type).toBe('folderNode');
      } else {
        expect(node.type).toBe('fileNode');
      }
    }
  });
});

describe('Canvas store — addNewItem', () => {
  beforeEach(async () => {
    mockListChildren.mockResolvedValue(MOCK_ROOT_ITEMS);
    await useCanvasStore.getState().loadItems('root');
  });

  it('agrega a allItems y crea nodo', () => {
    const newItem: DriveItem = {
      id: 'new-1',
      name: 'New File',
      mimeType: 'text/plain',
      webViewLink: '#',
      modifiedTime: new Date().toISOString(),
      isFolder: false,
    };

    const beforeCount = useCanvasStore.getState().allItems.length;
    useCanvasStore.getState().addNewItem(newItem);

    const state = useCanvasStore.getState();
    expect(state.allItems).toHaveLength(beforeCount + 1);
    expect(state.allItems.find((i) => i.id === 'new-1')).toBeDefined();
    expect(state.nodes.find((n) => n.id === 'new-1')).toBeDefined();
  });
});

describe('Canvas store — toggleFolder', () => {
  it('abre una carpeta que existe en los nodos cargados', async () => {
    mockListChildren.mockResolvedValue(MOCK_ROOT_ITEMS);
    await useCanvasStore.getState().loadItems('root');

    // 'f1' (Guion) is a root-level folder, so it exists as a node
    useCanvasStore.getState().toggleFolder('f1');

    const state = useCanvasStore.getState();
    expect(state.expandedFolders['f1']).toBe(true);

    // Close it
    useCanvasStore.getState().toggleFolder('f1');
    expect(useCanvasStore.getState().expandedFolders['f1']).toBeUndefined();
  });

  it('togglea incluso sin children (expandedFolders solo trackea qué está expandido)', async () => {
    mockListChildren.mockResolvedValue(MOCK_ROOT_ITEMS);
    await useCanvasStore.getState().loadItems('root');

    // Folder 'f2' (Referencias Visuales)
    useCanvasStore.getState().toggleFolder('f2');

    // Now it always toggles — no child check
    expect(useCanvasStore.getState().expandedFolders['f2']).toBe(true);
  });
});

describe('Canvas store — setSelectedNodeIds', () => {
  it('maneja selección múltiple', () => {
    useCanvasStore.getState().setSelectedNodeIds(['node1', 'node2']);
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(['node1', 'node2']);

    useCanvasStore.getState().setSelectedNodeIds([]);
    expect(useCanvasStore.getState().selectedNodeIds).toEqual([]);
  });
});

describe('Canvas store — toggleNodeSelection', () => {
  it('togglea un nodo individual en selección múltiple', () => {
    useCanvasStore.getState().toggleNodeSelection('node1');
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(['node1']);

    useCanvasStore.getState().toggleNodeSelection('node2');
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(['node1', 'node2']);

    useCanvasStore.getState().toggleNodeSelection('node1');
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(['node2']);
  });

  it('clearSelection limpia todo', () => {
    useCanvasStore.getState().setSelectedNodeIds(['a', 'b']);
    useCanvasStore.getState().clearSelection();
    expect(useCanvasStore.getState().selectedNodeIds).toEqual([]);
  });
});