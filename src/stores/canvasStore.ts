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
import { listChildren, listAllChildren, getUseMock } from '../services/drive';
import { moveItem, renameItem } from '../services/drive';
import { MOCK_ITEMS } from '../data/mockDriveItems';
import { calcGridLayout } from '../utils/layout';
import { debounce } from '../utils/debounce';
import { db } from '../services/db';
import type { NodePosition, StoredEdge } from '../services/db';
import { useToastStore } from './toastStore';
import { useRootStore } from './rootStore';
import { findContainingFolder } from '../utils/folderBounds';

export interface CanvasNodeData {
  driveItem: DriveItem;
  [key: string]: unknown;
}

interface CanvasState {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  isLoading: boolean;
  error: string | null;
  errorType: 'connection' | 'auth' | 'rate-limit' | 'unknown' | null;
  layout: 'grid' | 'free';

  /** All items (all levels), populated at load time. */
  allItems: DriveItem[];
  /**
   * Which folders are currently expanded (open).
   * All nodes are root-level in ReactFlow; folder membership is determined
   * by bounds checking (position inside folder bounding box).
   */
  expandedFolders: Record<string, boolean>;
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

  /** Stores the ORIGINAL position AND dimensions of a folder node at drag start. Used in onNodeDragStop to compute the delta for repositioning children and to distinguish drag from resize (if dimensions changed, it's a resize). */
  folderDragOrigins: Record<string, { x: number; y: number; width?: number; height?: number }>;

  /**
   * Stores the list of child IDs captured at drag start for each folder.
   * Used in onNodeDrag to only move children that were inside the folder
   * when the drag began, rather than recalculating bounds in real time
   * (which would pick up items newly overlapped by a resized folder).
   */
  folderDragChildren: Record<string, string[]>;

  /** Pan mode: when true, drag moves the canvas (pan) instead of selecting. */
  panMode: boolean;
  /** Enable or disable pan mode. */
  setPanMode: (enabled: boolean) => void;
  /** Toggle pan mode on/off. */
  togglePanMode: () => void;

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
   * If a position is provided, places the node there (drag & drop).
   * Otherwise, calculates the next available grid position (context menu).
   * Selects the new node automatically, and adds it to allItems.
   */
  addNewItem: (driveItem: DriveItem, position?: { x: number; y: number }) => void;

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

  /**
   * Called on every drag move. During drag, ReactFlow handles all node movement
   * including resize. DO NOT move children here — that happens in onNodeDragStop
   * to avoid interfering with ReactFlow's resize logic.
   */
  onNodeDrag: (_event: unknown, node: Node) => void;

  /**
   * Called when drag starts: records the folder's origin position
   * to distinguish real drags from resize operations.
   */
  onNodeDragStart: (_event: unknown, node: Node) => void;

  /**
   * Called when drag ends: detect if item was dropped inside/outside a folder
   * and sync to Drive accordingly.
   */
  onNodeDragStop: (_event: unknown, node: Node) => void;

  /**
   * Move a node to the front of the z-order (end of nodes array).
   */
  bringToFront: (nodeId: string) => void;

  /**
   * Move a node to the back of the z-order (start of nodes array).
   */
  sendToBack: (nodeId: string) => void;
}

/* ── helpers ─────────────────────────────────────────────────── */

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
export function persistenceScope(activeTabId: string, currentFolderId: string): string {
  return currentFolderId ? `${activeTabId}/${currentFolderId}` : activeTabId;
}

/* ── debounced persistence ───────────────────────────────────── */

const debouncedPersist = debounce(
  async (
    nodes: Node<CanvasNodeData>[],
    edges: Edge[],
    expandedFolders: Record<string, boolean>,
    tabId: string,
  ) => {
    const dbOperations: Promise<unknown>[] = [];

    /* Positions: all nodes (all root-level now) */
    const rootNodePositions: NodePosition[] = nodes.map((n) => ({
      fileId: n.id,
      x: n.position.x,
      y: n.position.y,
      tabId,
    }));
    console.log('[PERSIST] saving positions:', {
      scope: tabId,
      positionsCount: rootNodePositions.length,
      nodes: rootNodePositions.map(p => `${p.fileId}:(${p.x},${p.y})`),
    });
    dbOperations.push(db.positions.bulkPut(rootNodePositions));

    /* Folder states (just expanded/not expanded, no dimensions/viewport) */
    const fStates = Object.entries(expandedFolders).map(
      ([folderId, isOpen]) => ({
        folderId,
        isOpen,
        tabId,
      }),
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
    console.log('[PERSIST] save completed');
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
  expandedFolders: {},
  activeTabId: 'root',
  searchHighlightedNodeIds: [],
  currentFolderId: '',
  folderHoverTarget: null,
  removingNodeIds: [],
  pendingTrashItemIds: [],
  folderDragOrigins: {},
  folderDragChildren: {},
  panMode: typeof window !== 'undefined' && navigator.maxTouchPoints > 0,

  /* ── load ──────────────────────────────────────────────────── */

  loadItems: async (folderId: string) => {
    set({ isLoading: true, error: null, errorType: null, searchHighlightedNodeIds: [] });

    try {
      let items: DriveItem[];

      if (getUseMock()) {
        items = MOCK_ITEMS;
      } else {
        // At root view, load ALL items recursively so all saved positions
        // match existing nodes. When navigating inside a folder, only load
        // that folder's direct children.
        const rootFolderId = useRootStore.getState().rootFolderId;
        const loadingRoot = !folderId || folderId === 'root' || folderId === rootFolderId;
        if (loadingRoot) {
          items = await listAllChildren(folderId || 'root');
        } else {
          items = await listChildren(folderId);
        }
      }

      // Filter root-level items based on folder context.
      const rootFolderId = useRootStore.getState().rootFolderId;
      const isRootView = !folderId || folderId === 'root' || folderId === rootFolderId || getUseMock();
      const rootItems = isRootView
        ? (getUseMock() ? items.filter((i) => !i.parentId) : items)
        : items.filter((i) => i.parentId === folderId);

      const gridNodes = calcGridLayout(rootItems);
      // All nodes are root-level — no parentId, no extent
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
        expandedFolders: {},
      });

      // After initial grid layout, try to hydrate saved state from Dexie
      try {
        await get().hydrateFromDexie();
        console.log('[LOAD] nodes after hydrate:', get().nodes.length);
      } catch (hydrateErr) {
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
      db.positions.filter(p => p.tabId === currentScope).toArray(),
      db.edges.filter(e => e.tabId === currentScope).toArray(),
      db.folderState.filter(fs => fs.tabId === currentScope).toArray(),
    ]);

    console.log('[HYDRATE] checking scope:', currentScope);
    console.log('[HYDRATE] savedPositions found:', savedPositions.length);

    // If no persisted data, keep grid layout
    if (savedPositions.length === 0 && savedFolderStates.length === 0) {
      return;
    }

    const posMap = new Map(
      savedPositions.map((p) => [p.fileId, { x: p.x, y: p.y }]),
    );

    /* 1. Compile folder expand state from Dexie (simplified — just open/closed) */
    const expandedFolders: Record<string, boolean> = {};
    for (const fs of savedFolderStates) {
      expandedFolders[fs.folderId] = fs.isOpen;
    }

    /* 2. Apply saved positions to all nodes (all root-level now) */
    const updatedNodes: Node<CanvasNodeData>[] = get().nodes.map((n) => {
      const pos = posMap.get(n.id);
      if (pos) {
        return { ...n, position: pos };
      }
      return n;
    });

    /* 3. Restore edges */
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
      expandedFolders,
    });

    console.log('[HYDRATE] complete — nodes:', get().nodes.length, 'expanded:', Object.keys(expandedFolders).length);
  },

  /* ── persistent save (immediate, not debounced) ───────────── */

  persistNow: async () => {
    const { nodes, edges, expandedFolders, activeTabId, currentFolderId } = get();
    const scope = persistenceScope(activeTabId, currentFolderId);

    const dbOps: Promise<unknown>[] = [];

    const allNodePositions: NodePosition[] = nodes.map((n) => ({
      fileId: n.id,
      x: n.position.x,
      y: n.position.y,
      tabId: scope,
    }));
    dbOps.push(db.positions.bulkPut(allNodePositions));

    const fStates = Object.entries(expandedFolders).map(
      ([folderId, isOpen]) => ({
        folderId,
        isOpen,
        tabId: scope,
      }),
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
    const { expandedFolders } = get();
    const currentlyOpen = expandedFolders[folderId] ?? false;

    if (currentlyOpen) {
      // CLOSE: just remove from expandedFolders
      const next = { ...expandedFolders };
      delete next[folderId];
      set({ expandedFolders: next });
    } else {
      // OPEN: mark as expanded (all nodes stay root-level, Canvas filters visibility)
      set({
        expandedFolders: { ...expandedFolders, [folderId]: true },
      });
    }

    // Persist to Dexie (debounced)
    const state = get();
    debouncedPersist(
      state.nodes,
      state.edges,
      state.expandedFolders,
      persistenceScope(state.activeTabId, state.currentFolderId),
    );
  },

  /* ── layout ────────────────────────────────────────────────── */

  resetLayout: () => {
    const { activeTabId, currentFolderId } = get();
    const scope = persistenceScope(activeTabId, currentFolderId);
    db.positions.filter(p => p.tabId === scope).delete();
    db.folderState.filter(fs => fs.tabId === scope).delete();

    set({ expandedFolders: {} });

    get().applyGridLayout();
  },

  applyGridLayout: () => {
    const { nodes } = get();

    // All nodes are root-level — layout all of them
    const items: DriveItem[] = nodes.map((n) => n.data.driveItem);
    const gridNodes = calcGridLayout(items);

    const updatedNodes: Node<CanvasNodeData>[] = nodes.map((n) => {
      const grid = gridNodes.find((gn) => gn.id === n.id);
      if (grid) {
        return { ...n, position: grid.position };
      }
      return n;
    });

    set({ nodes: updatedNodes, layout: 'grid' });
  },

  /* ── React Flow handlers ───────────────────────────────────── */

  onNodesChange: (changes: NodeChange[]) => {
    // Let ALL changes through — ReactFlow needs position updates during
    // resize from left/top edges to correctly shift position.x/position.y.
    // Child movement is handled in onNodeDrag, not here.
    if (changes.length > 0) {
      set({ nodes: applyNodeChanges(changes, get().nodes) as Node<CanvasNodeData>[] });
    }

    // If a real position change happened, persist (debounced)
    if (changes.some((c) => c.type === 'position')) {
      const state = get();
      debouncedPersist(
        state.nodes,
        state.edges,
        state.expandedFolders,
        persistenceScope(state.activeTabId, state.currentFolderId),
      );
    }
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });

    if (changes.some((c) => c.type === 'add' || c.type === 'remove' || c.type === 'replace')) {
      const state = get();
      debouncedPersist(
        state.nodes,
        state.edges,
        state.expandedFolders,
        persistenceScope(state.activeTabId, state.currentFolderId),
      );
    }
  },

  onConnect: (connection: Connection) => {
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

    const state = get();
    debouncedPersist(
      state.nodes,
      state.edges,
      state.expandedFolders,
      persistenceScope(state.activeTabId, state.currentFolderId),
    );
  },

  removeEdges: (edgeIds: string[]) => {
    const { edges } = get();
    const remaining = edges.filter((e) => !edgeIds.includes(e.id));
    set({ edges: remaining });

    const state = get();
    debouncedPersist(
      state.nodes,
      state.edges,
      state.expandedFolders,
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

  /* ── Drag handlers ──────────────────────────────────────────── */

  onNodeDragStart: (_event: unknown, node: Node) => {
    if (node.type === 'folderNode') {
      const state = get();
      // Use parentId from Drive items instead of positional bounds detection.
      // Bounds-based detection (getChildrenInFolder) picks up items near or
      // overlapping the folder's visual area that aren't actual children,
      // causing items outside the folder to move when dragging a folder.
      const childIds = state.allItems
        .filter((item) => item.parentId === node.id)
        .map((item) => item.id);
      const origins = { ...state.folderDragOrigins };
      // Read dimensions from the store node — it has the most reliable
      // measured width/height (the event node may not have them populated yet).
      const storeNode = get().nodes.find(n => n.id === node.id);
      origins[node.id] = {
        x: node.position.x,
        y: node.position.y,
        width: (storeNode as any)?.width ?? (node as any).width ?? undefined,
        height: (storeNode as any)?.height ?? (node as any).height ?? undefined,
      };
      set({
        folderDragOrigins: origins,
        folderDragChildren: {
          ...state.folderDragChildren,
          [node.id]: childIds,
        },
      });
    }
  },

  onNodeDrag: (_event: unknown, _node: Node) => {
    // Intentionally empty — ReactFlow handles all node movement including resize
    // during drag. Children are repositioned in onNodeDragStop to avoid
    // interfering with ReactFlow's resize logic.
  },

  onNodeDragStop: async (_event: unknown, node: Node) => {
    // ── Reposition children on drag stop (not during drag, avoids interfering with resize) ──
    if (node.type === 'folderNode') {
      const state = get();
      const origin = state.folderDragOrigins[node.id];
      const childIds = state.folderDragChildren[node.id];
      if (origin && childIds?.length) {
        const dx = node.position.x - origin.x;
        const dy = node.position.y - origin.y;

        // ── Detect resize vs drag — READ DIMENSIONS FROM STORE ──
        // CRITICAL: The 'node' parameter from ReactFlow's onNodeDragStop has
        // UPDATED position.y but STALE width/height during top/bottom-edge
        // resize operations. Dimension changes are applied via onNodesChange
        // which updates the store, but the drag-stop event's node reference
        // does NOT reflect those dimension updates. Always read dimensions
        // from the store node, which has the latest values.
        const storeNode = get().nodes.find(n => n.id === node.id);
        const currentWidth = (storeNode as any)?.width ?? (node as any).width ?? 0;
        const currentHeight = (storeNode as any)?.height ?? (node as any).height ?? 0;
        const isResize =
          origin.width !== undefined &&
          origin.height !== undefined &&
          (Math.abs(currentWidth - origin.width) > 3 ||
            Math.abs(currentHeight - origin.height) > 3);

        if (!isResize && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          const { nodes, expandedFolders } = get();
          // Only move children if the folder is expanded (children are visible)
          if (expandedFolders[node.id]) {
            const childSet = new Set(childIds);
            const updatedNodes = nodes.map((n) => {
              if (childSet.has(n.id)) {
                return {
                  ...n,
                  position: {
                    x: n.position.x + dx,
                    y: n.position.y + dy,
                  },
                };
              }
              return n;
            });
            set({ nodes: updatedNodes });

            // Persist after children repositioned
            const newState = get();
            debouncedPersist(
              newState.nodes,
              newState.edges,
              newState.expandedFolders,
              persistenceScope(newState.activeTabId, newState.currentFolderId),
            );
          }
        }
      }

      // Clean up drag state
      const { [node.id]: _, ...restOrigins } = state.folderDragOrigins;
      const { [node.id]: __, ...restChildren } = state.folderDragChildren;
      set({
        folderDragOrigins: restOrigins,
        folderDragChildren: restChildren,
      });
    }

    const state = get();
    const driveItem = (node.data as unknown as CanvasNodeData)?.driveItem;
    if (!driveItem) return;

    // Build a simple nodeSizes map
    const nodeSizes = new Map<string, { width: number; height: number }>();
    for (const n of state.nodes) {
      const size = (n as any).measured ?? { width: 180, height: 170 };
      nodeSizes.set(n.id, size);
    }

    // Find containing folder by bounds
    const containerFolder = findContainingFolder(node as unknown as Node<CanvasNodeData>, state.nodes, nodeSizes);

    const currentParentId = driveItem.parentId;
    const targetFolderId = containerFolder?.id ?? undefined;

    // ── EARLY RETURN: already in the same folder ───────────────
    // If targetFolderId is the same as current parent, the item hasn't
    // actually moved — skip the API call entirely.
    if (targetFolderId && currentParentId === targetFolderId) {
      set({ folderHoverTarget: null });
      return;
    }

    // ── EARLY RETURN: already at root, dropped outside ──────────
    // If dropped outside any folder and item's parent is the root folder,
    // the item is already at root — no move needed. This prevents the
    // 403 Forbidden from PATCH with addParents=rootId&removeParents=rootId.
    const rootFolderId = useRootStore.getState().rootFolderId;
    if (!targetFolderId && currentParentId && currentParentId === rootFolderId) {
      set({ folderHoverTarget: null });
      return;
    }

    // ── EARLY RETURN: item has no parent and dropped outside ────
    // Root-level items dropped on empty space are already at root.
    if (!targetFolderId && !currentParentId) {
      set({ folderHoverTarget: null });
      return;
    }

    // Only act if the parent changes
    if (currentParentId !== targetFolderId) {
      if (targetFolderId) {
        // Item was dropped INSIDE a folder
        await state.moveItemToFolder(node.id, targetFolderId);
      } else if (currentParentId) {
        // Item was dropped OUTSIDE its parent folder — move to root.
        // At this point we know currentParentId !== rootFolderId
        // (handled by early return above), so this is a real move.
        const rootId = rootFolderId || '';
        try {
          await moveItem(node.id, rootId, currentParentId);

          // Update local state
          const updatedItems = state.allItems.map((item) =>
            item.id === node.id
              ? { ...item, parentId: undefined }
              : item,
          );

          set({ allItems: updatedItems });
          useToastStore.getState().addToast({
            type: 'success',
            message: 'Movido a la raíz',
          });
        } catch (err) {
          console.error('[onNodeDragStop] Error moving to root:', err);
          useToastStore.getState().addToast({
            type: 'error',
            message: 'No se pudo mover. Reintentá.',
          });
        }
      }
    }

    set({ folderHoverTarget: null });
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

    // ── Update local state (just allItems — nodes stay root-level) ──
    const updatedItems = state.allItems.map((item) => {
      if (item.id === itemId) {
        return { ...item, parentId: targetFolderId };
      }
      return item;
    });

    // Update the node's data to reflect new parentId
    const updatedNodes = state.nodes.map((n) => {
      if (n.id === itemId) {
        return {
          ...n,
          data: {
            ...n.data,
            driveItem: { ...n.data.driveItem, parentId: targetFolderId },
          } as unknown as CanvasNodeData,
        };
      }
      return n;
    });

    set({
      nodes: updatedNodes,
      allItems: updatedItems,
    });

    // ── Persist to Dexie ────────────────────────────────────
    const newState = get();
    debouncedPersist(
      newState.nodes,
      newState.edges,
      newState.expandedFolders,
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

      const currentIds = new Set(allItems.map((i) => i.id));
      const freshIds = new Set(freshItems.map((i) => i.id));
      const freshMap = new Map(freshItems.map((i) => [i.id, i]));

      // 1. Remove items that no longer exist
      const removedIds = new Set(
        [...currentIds].filter((id) => !freshIds.has(id)),
      );

      // 2. Add new items
      const newItems = freshItems.filter((i) => !currentIds.has(i.id));

      // 3. Update names for renamed items
      const updatedItems = allItems.map((item) => {
        const fresh = freshMap.get(item.id);
        if (fresh && fresh.name !== item.name) {
          return { ...item, name: fresh.name };
        }
        return item;
      });

      const mergedItems = [
        ...updatedItems.filter((i) => !removedIds.has(i.id)),
        ...newItems,
      ];

      // Update nodes
      const filteredNodes = nodes.filter((n) => !removedIds.has(n.id));

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

      const newNodes = newItems
        .filter((item) => !currentIds.has(item.id))
        .map((item) => ({
          id: item.id,
          type: item.isFolder ? 'folderNode' as const : 'fileNode' as const,
          position: { x: 12, y: 12 },
          data: { driveItem: item } as CanvasNodeData,
          deletable: false,
        }));

      set({
        allItems: mergedItems,
        nodes: [...updatedNodes, ...newNodes],
      });

      const state = get();
      debouncedPersist(
        state.nodes,
        state.edges,
        state.expandedFolders,
        persistenceScope(state.activeTabId, state.currentFolderId),
      );
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

    set({ allItems: updatedItems, nodes: updatedNodes });

    const state = get();
    debouncedPersist(
      state.nodes,
      state.edges,
      state.expandedFolders,
      persistenceScope(state.activeTabId, state.currentFolderId),
    );

    return true;
  },

  /* ── Add new item (create from context menu) ─────────────────── */

  addNewItem: (driveItem: DriveItem, position?: { x: number; y: number }) => {
    const { nodes, allItems } = get();

    // 1. Add to allItems
    const updatedAllItems = [...allItems, driveItem];

    // 2. Calculate position
    const finalPosition: { x: number; y: number } = position ?? (() => {
      const columns = 6;
      const gapX = 220;
      const gapY = 160;
      const nextIndex = nodes.length;
      return {
        x: (nextIndex % columns) * gapX,
        y: Math.floor(nextIndex / columns) * gapY,
      };
    })();

    // 3. Deselect all existing nodes, create the new node as selected
    const updatedNodes: Node<CanvasNodeData>[] = nodes.map((n) => ({
      ...n,
      selected: false,
    }));

    const newNode: Node<CanvasNodeData> = {
      id: driveItem.id,
      type: driveItem.isFolder ? 'folderNode' : 'fileNode',
      position: finalPosition,
      data: { driveItem } as CanvasNodeData,
      deletable: false,
      selected: true,
    };

    updatedNodes.push(newNode);

    set({
      nodes: updatedNodes,
      allItems: updatedAllItems,
      selectedNodeId: driveItem.id,
    });

    // Persist
    const persistState = get();
    debouncedPersist(
      persistState.nodes,
      persistState.edges,
      persistState.expandedFolders,
      persistenceScope(persistState.activeTabId, persistState.currentFolderId),
    );
  },

  /* ── Remove items (trash from canvas) ────────────────────────── */

  setPanMode: (enabled: boolean) => {
    set({ panMode: enabled });
  },

  togglePanMode: () => {
    set((state) => ({ panMode: !state.panMode }));
  },

  setPendingTrash: (fileIds: string[]) => {
    set({ pendingTrashItemIds: fileIds });
  },

  clearPendingTrash: () => {
    set({ pendingTrashItemIds: [] });
  },

  removeItems: (fileIds: string[]) => {
    const { removingNodeIds } = get();

    const alreadyRemoving = new Set(removingNodeIds);
    const toRemove = fileIds.filter((id) => !alreadyRemoving.has(id));
    if (toRemove.length === 0) return;

    // 1. Start fade-out animation
    set({ removingNodeIds: [...removingNodeIds, ...toRemove] });

    // 2. After animation completes, actually remove from state
    setTimeout(() => {
      const currentState = get();
      const removeSet = new Set(toRemove);

      const updatedNodes = currentState.nodes.filter((n) => !removeSet.has(n.id));
      const updatedItems = currentState.allItems.filter((i) => !removeSet.has(i.id));

      // Clean up expanded state for removed folders
      const updatedExpanded = { ...currentState.expandedFolders };
      for (const id of toRemove) {
        delete updatedExpanded[id];
      }

      const remainingRemoving = currentState.removingNodeIds.filter(
        (id) => !removeSet.has(id),
      );

      set({
        nodes: updatedNodes,
        allItems: updatedItems,
        expandedFolders: updatedExpanded,
        removingNodeIds: remainingRemoving,
      });

      const stateAfterRemove = get();
      debouncedPersist(
        stateAfterRemove.nodes,
        stateAfterRemove.edges,
        stateAfterRemove.expandedFolders,
        persistenceScope(stateAfterRemove.activeTabId, stateAfterRemove.currentFolderId),
      );
    }, 300);
  },

  /* ── Z-index (traer al frente / enviar atrás) ─────────────────── */

  bringToFront: (nodeId: string) => {
    const { nodes } = get();
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1 || idx === nodes.length - 1) return;
    const updated = [...nodes];
    const [node] = updated.splice(idx, 1);
    updated.push(node); // Al final = al frente

    set({ nodes: updated });

    debouncedPersist(
      updated,
      get().edges,
      get().expandedFolders,
      persistenceScope(get().activeTabId, get().currentFolderId),
    );
  },

  sendToBack: (nodeId: string) => {
    const { nodes } = get();
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1 || idx === 0) return;
    const updated = [...nodes];
    const [node] = updated.splice(idx, 1);
    updated.unshift(node); // Al inicio = atrás

    set({ nodes: updated });

    debouncedPersist(
      updated,
      get().edges,
      get().expandedFolders,
      persistenceScope(get().activeTabId, get().currentFolderId),
    );
  },
}));
