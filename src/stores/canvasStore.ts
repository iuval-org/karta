import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  MarkerType,
} from '@xyflow/react';
import type { DriveItem } from '../types/drive';
import { listChildren, getUseMock } from '../services/drive';
import { moveItem, renameItem } from '../services/drive';
import { MOCK_ITEMS } from '../data/mockDriveItems';
import { calcGridLayout } from '../utils/layout';
import { debounce } from '../utils/debounce';
import { db } from '../services/db';
import type { NodePosition, StoredEdge, FolderStateRow } from '../services/db';
import { useToastStore } from './toastStore';

export interface CanvasNodeData {
  driveItem: DriveItem;
  [key: string]: unknown;
}

/** Internal grid for children inside an open folder (3 cols, small gap). */
const CHILD_COLS = 3;
const CHILD_GAP_X = 210;
const CHILD_GAP_Y = 150;

interface CanvasState {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  isLoading: boolean;
  error: string | null;
  errorType: 'connection' | 'auth' | 'rate-limit' | 'unknown' | null;
  layout: 'grid' | 'free';

  /** All items (root + children), populated at load time. */
  allItems: DriveItem[];
  /** Which folders are currently open. */
  folderOpenState: Record<string, boolean>;
  /** Persisted dimensions for open folder containers. */
  folderDimensions: Record<string, { width: number; height: number }>;
  /** Saved relative positions of children inside a folder so they survive close/re-open. */
  folderChildPositions: Record<string, Record<string, { x: number; y: number }>>;
  /** Viewport pan/zoom state per open folder (for internal mini-canvas). */
  folderViewportState: Record<string, { panX: number; panY: number; zoom: number }>;
  /** Active tab ID for persistence. */
  activeTabId: string;

  /** Search highlighted nodes. */
  searchHighlightedNodeIds: string[];

  /** Current folder being viewed (for navigation within a tab). Empty = root view. */
  currentFolderId: string;

  /** Folder being hovered during a drag operation (for visual feedback). */
  folderHoverTarget: string | null;

  /** IDs of nodes currently being removed (for fade-out animation). */
  removingNodeIds: string[];

  /** IDs of items pending trash confirmation (to show ConfirmModal in Canvas). */
  pendingTrashItemIds: string[];

  /** Set pending trash item IDs (opens ConfirmModal in Canvas). */
  setPendingTrash: (fileIds: string[]) => void;

  /** Clear pending trash state. */
  clearPendingTrash: () => void;

  /**
   * Remove items from local canvas state with fade-out animation.
   * Called after successful trash API call.
   */
  removeItems: (fileIds: string[]) => void;

  loadItems: (folderId: string) => Promise<void>;
  setCurrentFolderId: (folderId: string) => void;
  toggleFolder: (folderId: string) => void;
  updateFolderDimensions: (folderId: string, dimensions: { width: number; height: number }) => void;
  updateFolderViewport: (folderId: string, viewport: { panX: number; panY: number; zoom: number }) => void;
  resetFolderViewport: (folderId: string) => void;
  resetLayout: () => void;
  applyGridLayout: () => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  removeEdges: (edgeIds: string[]) => void;

  /** Hydrate canvas state from Dexie after initial load. */
  hydrateFromDexie: (tabId?: string) => Promise<void>;
  /** Persist all current state to Dexie (debounced). */
  persistNow: () => Promise<void>;
  /** Set active tab ID (for tab integration). */
  setActiveTabId: (tabId: string) => void;
  /** Set search-highlighted node IDs. */
  setSearchHighlightedNodeIds: (ids: string[]) => void;

  /** Set the folder currently being hovered during a drag (or null to clear). */
  setFolderHoverTarget: (folderId: string | null) => void;

  /**
   * Add a newly created Drive item to the canvas as a new node.
   * Calculates the next available grid position, creates the node,
   * selects it automatically, and adds it to allItems.
   */
  addNewItem: (driveItem: DriveItem) => void;

  /**
   * Move an item (file or folder) into a target folder.
   * Returns true on success, false on failure (toast shown automatically).
   * Handles validation, Drive API call, local state updates, and persistence.
   */
  moveItemToFolder: (itemId: string, targetFolderId: string) => Promise<boolean>;

  /**
   * Refresca el contenido de la carpeta activa desde Drive sin perder posiciones.
   * Hace diff con allItems actual: agrega lo nuevo, actualiza cambios, remueve lo faltante.
   */
  refreshCurrentFolder: () => Promise<void>;

  /**
   * Renombra un nodo localmente (actualiza allItems + nodos) sin llamar a Drive.
   * Llama a renameItem de drive.ts para sincronizar con Drive.
   */
  renameNodeItem: (fileId: string, newName: string) => Promise<boolean>;

  /** Set selected node IDs (from React Flow selection change). */
  setSelectedNodeIds: (ids: string[]) => void;
  /** Toggle a single node in/out of multi-selection. */
  toggleNodeSelection: (id: string) => void;
  /** Clear all selection. */
  clearSelection: () => void;
}

/* ── helpers ─────────────────────────────────────────────────── */

/** Default child positions inside a folder (3-column grid). */
function defaultChildPositions(
  children: DriveItem[],
): Record<string, { x: number; y: number }> {
  const map: Record<string, { x: number; y: number }> = {};
  children.forEach((child, i) => {
    map[child.id] = {
      x: (i % CHILD_COLS) * CHILD_GAP_X + 12,
      y: Math.floor(i / CHILD_COLS) * CHILD_GAP_Y + 12,
    };
  });
  return map;
}

/**
 * Check recursively if `candidateId` is a descendant of `parentId`
 * in the DriveItem tree (cycle detection).
 */
function checkIsDescendant(
  parentId: string,
  candidateId: string,
  items: DriveItem[],
): boolean {
  const children = items.filter((i) => i.parentId === parentId);
  for (const child of children) {
    if (child.id === candidateId) return true;
    if (child.isFolder && checkIsDescendant(child.id, candidateId, items)) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the persistence scope key.
 * When navigating inside a folder, scope positions to `${tabId}/${folderId}`.
 * For root view, just use the tabId.
 */
function persistenceScope(activeTabId: string, currentFolderId: string): string {
  return currentFolderId ? `${activeTabId}/${currentFolderId}` : activeTabId;
}

/* ── debounced persistence ───────────────────────────────────── */

const debouncedPersist = debounce(
  async (
    nodes: Node<CanvasNodeData>[],
    edges: Edge[],
    folderOpenState: Record<string, boolean>,
    folderDimensions: Record<string, { width: number; height: number }>,
    folderChildPositions: Record<string, Record<string, { x: number; y: number }>>,
    folderViewportState: Record<string, { panX: number; panY: number; zoom: number }>,
    tabId: string,
  ) => {
    const dbOperations: Promise<unknown>[] = [];

    /* Positions: root-level nodes + child nodes currently on canvas */
    const rootNodePositions: NodePosition[] = nodes
      .filter((n) => !n.parentId)
      .map((n) => ({
        fileId: n.id,
        x: n.position.x,
        y: n.position.y,
        tabId,
      }));
    dbOperations.push(db.positions.bulkPut(rootNodePositions));

    /* Child positions of closed folders (from folderChildPositions) */
    const childPositions: NodePosition[] = [];
    for (const [, children] of Object.entries(folderChildPositions)) {
      for (const [childId, pos] of Object.entries(children)) {
        childPositions.push({
          fileId: childId,
          x: pos.x,
          y: pos.y,
          tabId,
        });
      }
    }
    if (childPositions.length > 0) {
      dbOperations.push(db.positions.bulkPut(childPositions));
    }

    /* Folder states */
    const fStates: FolderStateRow[] = Object.entries(folderOpenState).map(
      ([folderId, isOpen]) => {
        const vp = folderViewportState[folderId];
        return {
          folderId,
          isOpen,
          width: folderDimensions[folderId]?.width ?? 640,
          height: folderDimensions[folderId]?.height ?? 320,
          tabId,
          viewportPanX: vp?.panX,
          viewportPanY: vp?.panY,
          viewportZoom: vp?.zoom,
        } as FolderStateRow;
      },
    );
    if (fStates.length > 0) {
      dbOperations.push(db.folderState.bulkPut(fStates));
    }

    /* Edges */
    const edgeRows: StoredEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      tabId,
    }));
    if (edgeRows.length > 0) {
      dbOperations.push(db.edges.bulkPut(edgeRows));
    }

    await Promise.all(dbOperations);
  },
  500,
);

/* ── store ───────────────────────────────────────────────────── */

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedNodeIds: [],
  isLoading: false,
  error: null,
  errorType: null,
  layout: 'grid',

  allItems: [],
  folderOpenState: {},
  folderDimensions: {},
  folderChildPositions: {},
  folderViewportState: {},
  activeTabId: 'root',
  searchHighlightedNodeIds: [],
  currentFolderId: '',
  folderHoverTarget: null,
  removingNodeIds: [],
  pendingTrashItemIds: [],

  /* ── load ──────────────────────────────────────────────────── */

  loadItems: async (folderId: string) => {
    set({ isLoading: true, error: null, errorType: null, searchHighlightedNodeIds: [] });

    try {
      let items: DriveItem[];

      if (getUseMock()) {
        items = MOCK_ITEMS;
      } else {
        items = await listChildren(folderId);
      }

      // Filter root-level items based on folder context.
      // For root view:
      //   - Mock mode: items with NO parentId are root-level (mock data convention).
      //   - Real Drive API: the query already filtered by "'folderId' in parents",
      //     so ALL returned items are children of folderId. Keep them all — don't
      //     filter by !parentId because Drive API always returns parents[] on items
      //     even at root level (e.g. parents: ['root']).
      // For navigation into a subfolder: items whose parentId matches the folder.
      const isRootView = !folderId || folderId === 'root' || getUseMock();
      const rootItems = isRootView
        ? (getUseMock() ? items.filter((i) => !i.parentId) : items)
        : items.filter((i) => i.parentId === folderId);

      const gridNodes = calcGridLayout(rootItems);
      const nodes: Node<CanvasNodeData>[] = gridNodes.map((gn) => ({
        id: gn.id,
        type: gn.data.isFolder ? 'folderNode' : 'fileNode',
        position: gn.position,
        data: { driveItem: gn.data },
        deletable: false,
      }));

      set({
        nodes,
        edges: [],
        allItems: items,
        isLoading: false,
        error: null,
        errorType: null,
        layout: 'grid',
        folderOpenState: {},
        folderDimensions: {},
        folderChildPositions: {},
        folderViewportState: {},
      });

      // After initial grid layout, try to hydrate saved state from Dexie
      try {
        await get().hydrateFromDexie();
      } catch (hydrateErr) {
        // If hydration fails (e.g. DB schema mismatch), keep grid layout
        console.warn('Hydration from Dexie failed, using grid layout:', hydrateErr);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar archivos';
      let errorType: CanvasState['errorType'] = 'unknown';

      if (message.includes('token') || message.includes('sesión') || message.includes('Sesión')) {
        errorType = 'auth';
      } else if (message.includes('Límite') || message.includes('solicitudes') || message.includes('rate')) {
        errorType = 'rate-limit';
      } else if (message.includes('cargar') || message.includes('conectar') || message.includes('network') || message.includes('Network')) {
        errorType = 'connection';
      }

      set({ isLoading: false, error: message, errorType });
    }
  },

  /* ── Dexie hydration ──────────────────────────────────────── */

  hydrateFromDexie: async (scope?: string) => {
    const { allItems, activeTabId, currentFolderId } = get();
    if (allItems.length === 0) return;

    const currentScope = scope ?? persistenceScope(activeTabId, currentFolderId);

    const [savedPositions, savedEdges, savedFolderStates] = await Promise.all([
      db.positions.where('tabId').equals(currentScope).toArray(),
      db.edges.where('tabId').equals(currentScope).toArray(),
      db.folderState.where('tabId').equals(currentScope).toArray(),
    ]);

    // If no persisted data, keep grid layout
    if (savedPositions.length === 0 && savedFolderStates.length === 0) {
      return;
    }

    const posMap = new Map(
      savedPositions.map((p) => [p.fileId, { x: p.x, y: p.y }]),
    );

    /* 1. Compile folder state from Dexie */
    const folderOpenState: Record<string, boolean> = {};
    const folderDimensions: Record<string, { width: number; height: number }> = {};
    for (const fs of savedFolderStates) {
      folderOpenState[fs.folderId] = fs.isOpen;
      if (fs.width > 0 && fs.height > 0) {
        folderDimensions[fs.folderId] = { width: fs.width, height: fs.height };
      }
    }

    /* 2. Rebuild folderChildPositions from saved positions */
    const childItems = allItems.filter((i) => i.parentId);
    const folderChildPositions: Record<
      string,
      Record<string, { x: number; y: number }>
    > = {};
    for (const child of childItems) {
      const pos = posMap.get(child.id);
      if (pos) {
        const fId = child.parentId!;
        if (!folderChildPositions[fId]) {
          folderChildPositions[fId] = {};
        }
        folderChildPositions[fId][child.id] = pos;
      }
    }

    /* 2b. Restore viewport state for open folders */
    const folderViewportState: Record<string, { panX: number; panY: number; zoom: number }> = {};
    for (const fs of savedFolderStates) {
      if (fs.isOpen && (fs.viewportPanX !== undefined || fs.viewportZoom !== undefined)) {
        folderViewportState[fs.folderId] = {
          panX: fs.viewportPanX ?? 0,
          panY: fs.viewportPanY ?? 0,
          zoom: fs.viewportZoom ?? 1,
        };
      }
    }

    /* 3. Apply saved positions to root-level nodes */
    const rootNodeIds = new Set(allItems.filter((i) => !i.parentId).map((i) => i.id));
    const updatedNodes: Node<CanvasNodeData>[] = get().nodes.map((n) => {
      const pos = posMap.get(n.id);
      if (pos && rootNodeIds.has(n.id)) {
        return { ...n, position: pos };
      }
      return n;
    });

    /* 4. Restore edges */
    const edges: Edge[] = savedEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.label ? { label: e.label } : {}),
    }));

    set({
      nodes: updatedNodes,
      edges,
      layout: 'free',
      folderOpenState,
      folderDimensions,
      folderChildPositions,
      folderViewportState,
    });

    /* 5. For folders that were open, create child nodes */
    const openFolderIds = Object.entries(folderOpenState)
      .filter(([_, isOpen]) => isOpen)
      .map(([id]) => id);

    for (const fId of openFolderIds) {
      const children = allItems.filter((i) => i.parentId === fId);
      if (children.length === 0) continue;

      const saved = folderChildPositions[fId] ?? {};
      const defaults = defaultChildPositions(children);
      const hasSaved = Object.keys(saved).length > 0;
      const positions = hasSaved ? saved : defaults;

      const childNodes: Node<CanvasNodeData>[] = children.map((item) => ({
        id: item.id,
        type: 'fileNode',
        position: positions[item.id] ?? { x: 12, y: 12 },
        parentId: fId,
        extent: 'parent' as const,
        data: { driveItem: item },
        deletable: false,
      }));

      const currentNodes = get().nodes;
      set({ nodes: [...currentNodes, ...childNodes] });
    }
  },

  /* ── persistent save (immediate, not debounced) ───────────── */

  persistNow: async () => {
    const { nodes, edges, folderOpenState, folderDimensions, folderChildPositions, folderViewportState, activeTabId, currentFolderId } =
      get();
    const scope = persistenceScope(activeTabId, currentFolderId);

    const dbOps: Promise<unknown>[] = [];

    const rootNodePositions: NodePosition[] = nodes
      .filter((n) => !n.parentId)
      .map((n) => ({
        fileId: n.id,
        x: n.position.x,
        y: n.position.y,
        tabId: scope,
      }));
    dbOps.push(db.positions.bulkPut(rootNodePositions));

    const childPosition: NodePosition[] = [];
    for (const [, children] of Object.entries(folderChildPositions)) {
      for (const [childId, pos] of Object.entries(children)) {
        childPosition.push({
          fileId: childId,
          x: pos.x,
          y: pos.y,
          tabId: scope,
        });
      }
    }
    if (childPosition.length > 0) {
      dbOps.push(db.positions.bulkPut(childPosition));
    }

    const fStates: FolderStateRow[] = Object.entries(folderOpenState).map(
      ([fId, isOpen]) => {
        const vp = folderViewportState[fId];
        return {
          folderId: fId,
          isOpen,
          width: folderDimensions[fId]?.width ?? 640,
          height: folderDimensions[fId]?.height ?? 320,
          tabId: scope,
          viewportPanX: vp?.panX,
          viewportPanY: vp?.panY,
          viewportZoom: vp?.zoom,
        } as FolderStateRow;
      },
    );
    if (fStates.length > 0) {
      dbOps.push(db.folderState.bulkPut(fStates));
    }

    const edgeRows: StoredEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      tabId: scope,
    }));
    if (edgeRows.length > 0) {
      dbOps.push(db.edges.bulkPut(edgeRows));
    }

    await Promise.all(dbOps);
  },

  /* ── folder toggle ─────────────────────────────────────────── */

  toggleFolder: (folderId: string) => {
    const { nodes, allItems, folderOpenState, folderChildPositions, folderDimensions, folderViewportState } = get();
    const currentlyOpen = folderOpenState[folderId] ?? false;

    if (currentlyOpen) {
      // ── CLOSE ──────────────────────────────────────────────
      // 1. Save relative positions of children
      const children = nodes.filter((n) => n.parentId === folderId);
      const savedPositions: Record<string, { x: number; y: number }> = {};
      for (const child of children) {
        savedPositions[child.id] = { ...child.position };
      }

      // 2. Remove child nodes (they disappear from canvas)
      const childIds = new Set(children.map((c) => c.id));
      const remaining = nodes.filter((n) => !childIds.has(n.id));

      const newFolderChildPositions = {
        ...folderChildPositions,
        [folderId]: savedPositions,
      };

      // 3. Clean up viewport state
      const newViewportState = { ...folderViewportState };
      delete newViewportState[folderId];

      set({
        nodes: remaining,
        folderOpenState: { ...folderOpenState, [folderId]: false },
        folderChildPositions: newFolderChildPositions,
        folderViewportState: newViewportState,
      });

      // Persist to Dexie
      const state = get();
      debouncedPersist(
        state.nodes,
        state.edges,
        state.folderOpenState,
        state.folderDimensions,
        state.folderChildPositions,
        state.folderViewportState,
        persistenceScope(state.activeTabId, state.currentFolderId),
      );
    } else {
      // ── OPEN ───────────────────────────────────────────────
      const folderNode = nodes.find((n) => n.id === folderId);
      if (!folderNode) return;

      // Find child items from the loaded data
      const childItems = allItems.filter((i) => i.parentId === folderId);
      if (childItems.length === 0) return;

      // Determine positions: use saved if available, otherwise default grid
      const saved = folderChildPositions[folderId] ?? {};
      const hasSaved = Object.keys(saved).length > 0;
      const positions = hasSaved
        ? saved
        : defaultChildPositions(childItems);

      // Create child nodes
      const childNodes: Node<CanvasNodeData>[] = childItems.map((item) => {
        const pos = positions[item.id] ?? { x: 12, y: 12 };
        return {
          id: item.id,
          type: 'fileNode',
          position: pos,
          parentId: folderId,
          extent: 'parent' as const,
          data: { driveItem: item },
          deletable: false,
        };
      });

      // Default folder dimensions if not yet set
      const dims = folderDimensions[folderId] ?? { width: 640, height: 320 };

      set({
        nodes: [...nodes, ...childNodes],
        folderOpenState: { ...folderOpenState, [folderId]: true },
        folderDimensions: { ...folderDimensions, [folderId]: dims },
      });

      // Persist folder state
      const state = get();
      debouncedPersist(
        state.nodes,
        state.edges,
        state.folderOpenState,
        state.folderDimensions,
        state.folderChildPositions,
        state.folderViewportState,
        persistenceScope(state.activeTabId, state.currentFolderId),
      );
    }
  },

  /* ── folder resize ─────────────────────────────────────────── */

  updateFolderDimensions: (folderId: string, dimensions: { width: number; height: number }) => {
    const { folderDimensions } = get();
    set({
      folderDimensions: { ...folderDimensions, [folderId]: dimensions },
    });

    // Debounced persistence
    const state = get();
    debouncedPersist(
      state.nodes,
      state.edges,
      state.folderOpenState,
      state.folderDimensions,
      state.folderChildPositions,
      state.folderViewportState,
      persistenceScope(state.activeTabId, state.currentFolderId),
    );
  },

  /* ── folder viewport (pan/zoom) ───────────────────────────── */

  updateFolderViewport: (folderId: string, viewport: { panX: number; panY: number; zoom: number }) => {
    const { folderViewportState } = get();
    set({
      folderViewportState: {
        ...folderViewportState,
        [folderId]: viewport,
      },
    });
  },

  resetFolderViewport: (folderId: string) => {
    const { folderViewportState } = get();
    const next = { ...folderViewportState };
    delete next[folderId];
    set({ folderViewportState: next });
  },

  /* ── layout ────────────────────────────────────────────────── */

  resetLayout: () => {
    // Clear saved positions from Dexie
    const { activeTabId, currentFolderId } = get();
    const scope = persistenceScope(activeTabId, currentFolderId);
    db.positions.where('tabId').equals(scope).delete();
    db.folderState.where('tabId').equals(scope).delete();

    set({
      folderOpenState: {},
      folderDimensions: {},
      folderChildPositions: {},
      folderViewportState: {},
    });

    get().applyGridLayout();
  },

  applyGridLayout: () => {
    const { nodes } = get();

    // Only layout root-level nodes (children inside folders keep their relative positions)
    const rootNodes = nodes.filter((n) => !n.parentId);
    const rootItems: DriveItem[] = rootNodes.map((n) => n.data.driveItem);
    const gridNodes = calcGridLayout(rootItems);

    const rootIds = new Set(rootNodes.map((n) => n.id));
    const updatedNodes: Node<CanvasNodeData>[] = nodes.map((n) => {
      if (rootIds.has(n.id)) {
        const grid = gridNodes.find((gn) => gn.id === n.id);
        if (grid) {
          return { ...n, position: grid.position };
        }
      }
      return n;
    });

    set({ nodes: updatedNodes, layout: 'grid' });
  },

  /* ── React Flow handlers ───────────────────────────────────── */

  onNodesChange: (changes: NodeChange[]) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<CanvasNodeData>[] });

    // If a position change happened, persist (debounced)
    if (changes.some((c) => c.type === 'position')) {
      const state = get();
      debouncedPersist(
        state.nodes,
        state.edges,
        state.folderOpenState,
        state.folderDimensions,
        state.folderChildPositions,
        state.folderViewportState,
        persistenceScope(state.activeTabId, state.currentFolderId),
      );
    }
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });

    // Persist (debounced) — edge add/remove/replace matter most
    if (changes.some((c) => c.type === 'add' || c.type === 'remove' || c.type === 'replace')) {
      const state = get();
      debouncedPersist(
        state.nodes,
        state.edges,
        state.folderOpenState,
        state.folderDimensions,
        state.folderChildPositions,
        state.folderViewportState,
        persistenceScope(state.activeTabId, state.currentFolderId),
      );
    }
  },

  onConnect: (connection: Connection) => {
    // Prevent self-connections
    if (connection.source === connection.target) return;

    const newEdge: Edge = {
      id: `edge-${connection.source}-${connection.target}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      type: 'smoothstep',
      style: { stroke: '#6366F1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' },
      interactionWidth: 10,
    };

    set({ edges: addEdge(newEdge, get().edges) });

    // Persist immediately
    const state = get();
    debouncedPersist(
      state.nodes,
      state.edges,
      state.folderOpenState,
      state.folderDimensions,
      state.folderChildPositions,
      state.folderViewportState,
      persistenceScope(state.activeTabId, state.currentFolderId),
    );
  },

  removeEdges: (edgeIds: string[]) => {
    const { edges } = get();
    const remaining = edges.filter((e) => !edgeIds.includes(e.id));
    set({ edges: remaining });

    // Persist
    const state = get();
    debouncedPersist(
      state.nodes,
      state.edges,
      state.folderOpenState,
      state.folderDimensions,
      state.folderChildPositions,
      state.folderViewportState,
      persistenceScope(state.activeTabId, state.currentFolderId),
    );
  },

  /* ── Tab integration ───────────────────────────────────────── */

  setActiveTabId: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  /* ── Search highlighting ──────────────────────────────────── */

  setSearchHighlightedNodeIds: (ids: string[]) => {
    set({ searchHighlightedNodeIds: ids });
  },

  /* ── Multi-selection ───────────────────────────────────────── */

  setSelectedNodeIds: (ids: string[]) => {
    set({ selectedNodeIds: ids });
  },

  toggleNodeSelection: (id: string) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.includes(id)) {
      set({ selectedNodeIds: selectedNodeIds.filter((sid) => sid !== id) });
    } else {
      set({ selectedNodeIds: [...selectedNodeIds, id] });
    }
  },

  clearSelection: () => {
    set({ selectedNodeIds: [] });
  },

  /* ── Folder navigation ───────────────────────────────────── */

  setCurrentFolderId: (folderId: string) => {
    set({ currentFolderId: folderId });
  },

  /* ── Drag & drop: hover target feedback ─────────────────────── */

  setFolderHoverTarget: (folderId: string | null) => {
    set({ folderHoverTarget: folderId });
  },

  /* ── Drag & drop: move item to folder ───────────────────────── */

  moveItemToFolder: async (itemId: string, targetFolderId: string) => {
    const state = get();

    // ── Validations ─────────────────────────────────────────────
    const targetItem = state.allItems.find((i) => i.id === targetFolderId);
    if (!targetItem) {
      console.error('[moveItemToFolder] Target folder not found:', targetFolderId);
      return false;
    }

    const sourceItem = state.allItems.find((i) => i.id === itemId);
    if (!sourceItem) {
      console.error('[moveItemToFolder] Source item not found:', itemId);
      return false;
    }

    // 1. No mover un folder dentro de sí mismo
    if (itemId === targetFolderId) {
      useToastStore.getState().addToast({
        type: 'warning',
        message: 'No podés mover una carpeta dentro de sí misma.',
      });
      return false;
    }

    // 2. No mover la carpeta raíz
    if (sourceItem.id === 'root') {
      useToastStore.getState().addToast({
        type: 'warning',
        message: 'No podés mover la carpeta raíz.',
      });
      return false;
    }

    // 3. No mover a la misma carpeta donde ya está
    const oldParentId = sourceItem.parentId ?? '';
    if (oldParentId === targetFolderId) {
      useToastStore.getState().addToast({
        type: 'info',
        message: 'El archivo ya está en esa carpeta.',
      });
      return false;
    }

    // 4. No mover un folder dentro de uno de sus descendientes (ciclo)
    if (sourceItem.isFolder) {
      const isDescendant = checkIsDescendant(itemId, targetFolderId, state.allItems);
      if (isDescendant) {
        useToastStore.getState().addToast({
          type: 'warning',
          message: 'No podés mover una carpeta dentro de una de sus subcarpetas.',
        });
        return false;
      }
    }

    // ── Drive API call ──────────────────────────────────────────
    try {
      await moveItem(itemId, targetFolderId, oldParentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al mover archivo';
      useToastStore.getState().addToast({
        type: 'error',
        message: 'No se pudo mover. Reintentá.',
      });
      console.error('[moveItemToFolder] API error:', message);
      return false;
    }

    // ── Update local state ──────────────────────────────────────
    const updatedItems = state.allItems.map((item) => {
      if (item.id === itemId) {
        return { ...item, parentId: targetFolderId };
      }
      return item;
    });

    // 1. Remove the node from root-level view (if it was root-level)
    const nodeToRemove = state.nodes.find(
      (n) => n.id === itemId && !n.parentId,
    );
    const updatedNodes = nodeToRemove
      ? state.nodes.filter((n) => n.id !== itemId)
      : state.nodes;

    // 2. If target folder is open, add the node as a child
    const isTargetOpen = state.folderOpenState[targetFolderId] ?? false;
    let nodesAfterMove = updatedNodes;

    if (isTargetOpen) {
      const childPos = state.folderChildPositions[targetFolderId]?.[itemId] ?? {
        x: 12,
        y: 12,
      };

      const newChildNode: Node<CanvasNodeData> = {
        id: itemId,
        type: sourceItem.isFolder ? 'folderNode' : 'fileNode',
        position: childPos,
        parentId: targetFolderId,
        extent: 'parent' as const,
        data: { driveItem: { ...sourceItem, parentId: targetFolderId } },
        deletable: false,
      };

      nodesAfterMove = [...updatedNodes, newChildNode];
    } else {
      // Target folder is closed — increment count by adding to folderChildPositions
      const existingChildren = state.folderChildPositions[targetFolderId] ?? {};
      const updatedChildPositions = {
        ...state.folderChildPositions,
        [targetFolderId]: {
          ...existingChildren,
          [itemId]: { x: 12, y: 12 },
        },
      };
      // We need to set it as a side effect — handle in set below
      set({
        folderChildPositions: updatedChildPositions,
      });
    }

    set({
      nodes: nodesAfterMove,
      allItems: updatedItems,
    });

    // ── Persist to Dexie ────────────────────────────────────
    const newState = get();
    debouncedPersist(
      newState.nodes,
      newState.edges,
      newState.folderOpenState,
      newState.folderDimensions,
      newState.folderChildPositions,
      newState.folderViewportState,
      persistenceScope(newState.activeTabId, newState.currentFolderId),
    );

    // ── Success toast ───────────────────────────────────────────
    useToastStore.getState().addToast({
      type: 'success',
      message: `Movido a ${targetItem.name}`,
    });

    return true;
  },

  /* ── Refresh current folder (sync CRUD) ─────────────────────── */

  refreshCurrentFolder: async () => {
    const { currentFolderId, allItems, nodes } = get();

    try {
      const freshItems = getUseMock()
        ? MOCK_ITEMS
        : await listChildren(currentFolderId || 'root');

      // Build a set of current item IDs for quick lookup
      const currentIds = new Set(allItems.map((i) => i.id));
      const freshIds = new Set(freshItems.map((i) => i.id));

      // Build a map of fresh items by ID
      const freshMap = new Map(freshItems.map((i) => [i.id, i]));

      // 1. Remove items that no longer exist in Drive
      const removedIds = new Set(
        [...currentIds].filter((id) => !freshIds.has(id)),
      );

      // 2. Add items that are new in Drive
      const newItems = freshItems.filter((i) => !currentIds.has(i.id));

      // 3. Update items whose name changed
      const updatedItems = allItems.map((item) => {
        const fresh = freshMap.get(item.id);
        if (fresh && fresh.name !== item.name) {
          return { ...item, name: fresh.name };
        }
        return item;
      });

      // Merge: keep existing items + add new ones
      const mergedItems = [
        ...updatedItems.filter((i) => !removedIds.has(i.id)),
        ...newItems,
      ];

      // Update nodes:
      // - Remove nodes for removed IDs
      // - Add nodes for new items (at the end)
      // - Update names for renamed items
      const existingNodeIds = new Set(nodes.filter((n) => !removedIds.has(n.id)).map((n) => n.id));

      const filteredNodes = nodes.filter((n) => !removedIds.has(n.id));

      // Update names on existing nodes
      const updatedNodes = filteredNodes.map((node) => {
        const fresh = freshMap.get(node.id);
        if (fresh && fresh.name !== node.data.driveItem.name) {
          return {
            ...node,
            data: {
              ...node.data,
              driveItem: { ...node.data.driveItem, name: fresh.name },
            },
          };
        }
        return node;
      });

      // Add new nodes at the end
      const newNodes = newItems
        .filter((item) => !existingNodeIds.has(item.id))
        .map((item) => ({
          id: item.id,
          type: item.isFolder ? 'folderNode' as const : 'fileNode' as const,
          position: { x: 12, y: 12 },
          data: { driveItem: item },
          deletable: false,
        }));

      set({
        allItems: mergedItems,
        nodes: [...updatedNodes, ...newNodes],
      });
    } catch (err) {
      console.error('[refreshCurrentFolder] Error:', err);
    }
  },

  /* ── Rename node item ──────────────────────────────────────────── */

  renameNodeItem: async (fileId: string, newName: string) => {
    const { allItems, nodes } = get();

    try {
      await renameItem(fileId, newName);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al renombrar';
      useToastStore.getState().addToast({
        type: 'error',
        message,
      });
      return false;
    }

    // Update local state (no full refresh needed — just update the one node)
    const updatedItems = allItems.map((item) => {
      if (item.id === fileId) {
        return { ...item, name: newName };
      }
      return item;
    });

    const updatedNodes = nodes.map((node) => {
      if (node.id === fileId) {
        return {
          ...node,
          data: {
            ...node.data,
            driveItem: { ...node.data.driveItem, name: newName },
          },
        };
      }
      return node;
    });

    set({
      allItems: updatedItems,
      nodes: updatedNodes,
    });

    return true;
  },

  /* ── Add new item (create from context menu) ─────────────────── */

  addNewItem: (driveItem: DriveItem) => {
    const { nodes, allItems } = get();

    // 1. Add to allItems
    const updatedAllItems = [...allItems, driveItem];

    // 2. Calculate next available grid position for root-level items
    const columns = 6;
    const gapX = 220;
    const gapY = 160;
    const rootLevelNodes = nodes.filter((n) => !n.parentId);
    const nextIndex = rootLevelNodes.length;
    const position = {
      x: (nextIndex % columns) * gapX,
      y: Math.floor(nextIndex / columns) * gapY,
    };

    // 3. Deselect all existing nodes, create the new node as selected
    const updatedNodes: Node<CanvasNodeData>[] = nodes.map((n) => ({
      ...n,
      selected: false,
    }));

    const newNode: Node<CanvasNodeData> = {
      id: driveItem.id,
      type: driveItem.isFolder ? 'folderNode' : 'fileNode',
      position,
      data: { driveItem },
      deletable: false,
      selected: true,
    };

    updatedNodes.push(newNode);

    set({
      nodes: updatedNodes,
      allItems: updatedAllItems,
      selectedNodeId: driveItem.id,
    });
  },

  /* ── Remove items (trash from canvas) ────────────────────────── */

  setPendingTrash: (fileIds: string[]) => {
    set({ pendingTrashItemIds: fileIds });
  },

  clearPendingTrash: () => {
    set({ pendingTrashItemIds: [] });
  },

  /**
   * Remove items from local state after they've been moved to trash.
   * Handles fade-out animation via removingNodeIds state:
   * 1. Sets removingNodeIds for the given IDs (triggers fade-out class in nodes)
   * 2. After 300ms (match CSS animation duration), removes nodes and items from state
   * 3. Handles cleanup of folderOpenState, folderChildPositions for removed folders
   */
  removeItems: (fileIds: string[]) => {
    const { removingNodeIds } = get();

    // If any are already being removed, skip
    const alreadyRemoving = new Set(removingNodeIds);
    const toRemove = fileIds.filter((id) => !alreadyRemoving.has(id));
    if (toRemove.length === 0) return;

    // 1. Start fade-out animation
    set({ removingNodeIds: [...removingNodeIds, ...toRemove] });

    // 2. After animation completes, actually remove from state
    setTimeout(() => {
      const currentState = get();
      const removeSet = new Set(toRemove);

      // Remove nodes
      const updatedNodes = currentState.nodes.filter((n) => !removeSet.has(n.id));

      // Remove from allItems
      const updatedItems = currentState.allItems.filter((i) => !removeSet.has(i.id));

      // Clean up folder state for removed folders
      const updatedOpenState = { ...currentState.folderOpenState };
      const updatedChildPositions = { ...currentState.folderChildPositions };
      const updatedViewportState = { ...currentState.folderViewportState };

      for (const id of toRemove) {
        delete updatedOpenState[id];
        delete updatedChildPositions[id];
        delete updatedViewportState[id];
      }

      // Clean up removingNodeIds
      const remainingRemoving = currentState.removingNodeIds.filter(
        (id) => !removeSet.has(id),
      );

      set({
        nodes: updatedNodes,
        allItems: updatedItems,
        folderOpenState: updatedOpenState,
        folderChildPositions: updatedChildPositions,
        folderViewportState: updatedViewportState,
        removingNodeIds: remainingRemoving,
      });
    }, 300);
  },
}));
