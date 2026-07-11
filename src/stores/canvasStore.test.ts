import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCanvasStore } from './canvasStore';
import { MOCK_ITEMS } from '../data/mockDriveItems';
import type { DriveItem } from '../types/drive';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

// Mock authStore (needed by getUseMock in drive.ts)
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
const mockGetUseMock = vi.hoisted(() => vi.fn(() => true));
vi.mock('../services/drive', () => ({
  listChildren: (folderId: string) => mockListChildren(folderId),
  getUseMock: (...args: any[]) => mockGetUseMock(...args),
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

// Mock toastStore
vi.mock('./toastStore', () => ({
  useToastStore: {
    getState: vi.fn(() => ({
      addToast: vi.fn(),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count root-level items in MOCK_ITEMS (no parentId) */
const ROOT_ITEM_COUNT = MOCK_ITEMS.filter((i) => !i.parentId).length;

/** Count child items of a given folder */
function childCount(folderId: string): number {
  return MOCK_ITEMS.filter((i) => i.parentId === folderId).length;
}

beforeEach(() => {
  // Reset store state
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    allItems: [],
    isLoading: false,
    error: null,
    errorType: null,
    folderOpenState: {},
    folderDimensions: {},
    folderChildPositions: {},
    layout: 'grid',
    currentFolderId: '',
    activeTabId: 'root',
    selectedNodeIds: [],
  });

  vi.clearAllMocks();
  // Default: mock mode ON
  mockGetUseMock.mockReturnValue(true);
});

describe('Canvas store — loadItems()', () => {
  it('carga items desde MOCK_ITEMS cuando getUseMock()', async () => {
    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.allItems).toEqual(MOCK_ITEMS);
    expect(state.nodes.length).toBe(ROOT_ITEM_COUNT);
  });

  it('filtra root items por !parentId en vista root', async () => {
    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    for (const node of state.nodes) {
      const item = MOCK_ITEMS.find((i) => i.id === node.id);
      expect(item?.parentId).toBeUndefined();
    }
  });

  it('cuando mock mode, trata cualquier folderId como root view', async () => {
    // In mock mode, isRootView is always true because mock parentIds
    // won't match real Drive folder IDs. So loadItems('f1') returns ROOT items.
    await useCanvasStore.getState().loadItems('f1');

    const state = useCanvasStore.getState();
    // Because getUseMock() == true, isRootView is forced to true
    expect(state.nodes.length).toBe(ROOT_ITEM_COUNT);
  });

  it('cuando NO mock mode en vista root, no filtra por !parentId (Drive API da parents[0]=root)', async () => {
    mockGetUseMock.mockReturnValue(false);
    // Simulate real Drive API: root-level items have parents: ['root']
    // so listChildren returns them with parentId='root' (NOT undefined)
    const rootItems = MOCK_ITEMS.filter((i) => !i.parentId)
      .map((i) => ({ ...i, parentId: 'root' as string }));
    mockListChildren.mockResolvedValue(rootItems);

    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    // All root items should appear — fix keeps ALL items since API already scoped
    expect(state.nodes.length).toBe(ROOT_ITEM_COUNT);
    // Verify parentId was correctly received
    expect(state.allItems.every((i) => i.parentId === 'root')).toBe(true);
  });

  it('cuando NO mock mode, filtra items por parentId === folderId en subcarpetas', async () => {
    mockGetUseMock.mockReturnValue(false);
    // Simulate listChildren returning only children of f1
    const f1Children = MOCK_ITEMS.filter((i) => i.parentId === 'f1');
    mockListChildren.mockResolvedValue(f1Children);

    await useCanvasStore.getState().loadItems('f1');

    const state = useCanvasStore.getState();
    expect(state.nodes.length).toBe(childCount('f1'));
    for (const node of state.nodes) {
      const item = MOCK_ITEMS.find((i) => i.id === node.id);
      expect(item?.parentId).toBe('f1');
    }
  });

  it('maneja error de API gracefulmente', async () => {
    mockGetUseMock.mockReturnValue(false);
    mockListChildren.mockRejectedValue(new Error('Network error'));

    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Network error');
    expect(state.errorType).toBe('connection');
  });

  it('no se rompe si hydrateFromDexie falla', async () => {
    // Mock DB query to throw
    mockWhere.mockImplementation(() => { throw new Error('DB error'); });

    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    expect(state.isLoading).toBe(false);
    // Should still have loaded the items even if hydration failed
    expect(state.nodes.length).toBe(ROOT_ITEM_COUNT);
  });

  it('crea nodes con tipo correcto (folderNode/fileNode)', async () => {
    await useCanvasStore.getState().loadItems('root');

    const state = useCanvasStore.getState();
    for (const node of state.nodes) {
      const item = MOCK_ITEMS.find((i) => i.id === node.id);
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
    await useCanvasStore.getState().loadItems('root');

    // 'f1' (Guion) is a root-level folder, so it exists as a node
    useCanvasStore.getState().toggleFolder('f1');

    const state = useCanvasStore.getState();
    expect(state.folderOpenState['f1']).toBe(true);

    // Close it
    useCanvasStore.getState().toggleFolder('f1');
    expect(useCanvasStore.getState().folderOpenState['f1']).toBe(false);
  });

  it('no-op si el folder no existe en los nodos', () => {
    useCanvasStore.getState().toggleFolder('nonexistent');
    expect(useCanvasStore.getState().folderOpenState['nonexistent']).toBeUndefined();
  });

  it('toggleFolder no-op si no hay children para abrir', async () => {
    await useCanvasStore.getState().loadItems('root');

    // Folder 'f2' (Referencias Visuales) has no children in MOCK_ITEMS
    useCanvasStore.getState().toggleFolder('f2');

    // Should not be open since there are no children
    expect(useCanvasStore.getState().folderOpenState['f2']).toBeUndefined();
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
