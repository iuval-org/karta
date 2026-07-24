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
import { listChildren, listAllChildren, createItem } from '../services/drive';
import { operationQueue } from '../services/operationQueue';
import { calcGridLayout } from '../utils/layout';
import { debounce } from '../utils/debounce';
import { db } from '../services/db';
import type { NodePosition, StoredEdge } from '../services/db';
import { useToastStore } from './toastStore';
import { useRootStore } from './rootStore';
import { findContainingFolder, isOverlappingFolder } from '../utils/folderBounds';
import { syncFolder as syncFolderService } from '../services/sync';
import type { SyncResult } from '../services/sync';
import { useAuthStore } from './authStore';
import { serializeCanvas, deserializeCanvas, filterNodesByFolder } from '../utils/canvasSerializer';
import { readCanvasState, writeCanvasState } from '../services/kartaStorage';

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

  /** True mientras se está sincronizando con Google Drive. */
  isSyncing: boolean;

  /** True mientras se está subiendo un archivo al canvas. */
  isUploading: boolean;
  /** Progreso de la subida actual (0-100). */
  uploadProgress: number;

  /** Actualiza el progreso de subida. */
  setUploadProgress: (progress: number) => void;
  /** Resetea el estado de subida. */
  clearUploadState: () => void;

  /** All items (all levels), populated at load time. */
  allItems: DriveItem[];
  /**
   * Which folders are currently expanded (open).
   * All nodes are root-level in ReactFlow; folder membership is determined
   * by bounds checking (position inside folder bounding box).
   */
  expandedFolders: Record<string, boolean>;
  /** Saved expanded folder dimensions (set by custom resize, read by FolderNode). */
  expandedFolderDims: Record<string, { width: number; height: number }>;
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

  /**
   * Stores the original positions of children at drag start for each folder.
   * Key: folder ID, Value: map of child ID → original {x, y}.
   * Used in onNodeDragStop to set final child positions as `origin + delta`
   * rather than `current + delta`, preventing double-movement when children
   * were also moved during drag (e.g. multi-selection drag in Canvas).
   */
  folderDragChildOrigins: Record<string, Record<string, { x: number; y: number }>>;

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

  /** Save expanded folder dimensions after custom resize. */
  setExpandedFolderDims: (folderId: string, width: number, height: number) => void;

  /**
   * Force ReactFlow to re-apply all node positions. Used after a folder
   * resize to correct the visual shift caused by ReactFlow's rendering bug
   * when ResizeObserver fires after a single node's DOM size changes.
   */
  forceRecalcPositions: () => void;

  /**
   * Add a newly created Drive item to the canvas as a new node.
   * If a position is provided, places the node there (drag & drop).
   * Otherwise, calculates the next available grid position (context menu).
   * Selects the new node automatically, and adds it to allItems.
   */
  addNewItem: (driveItem: DriveItem, position?: { x: number; y: number }) => void;

  /**
   * Create a new sticky note on the canvas at the given position.
   */
  addStickyNote: (position: { x: number; y: number }) => string;

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
   * Sincroniza una carpeta con Google Drive usando Changes API.
   * Detecta archivos creados, eliminados, renombrados y movidos
   * desde la última sincronización y aplica cambios quirúrgicos al canvas.
   */
  syncFolder: (folderId: string) => Promise<void>;

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
   * Bring selected nodes to the front of the z-order (max zIndex + 1).
   * If ids provided, use those instead of selectedNodeIds.
   */
  bringToFront: (ids?: string[]) => void;

  /**
   * Send selected nodes to the back of the z-order (min zIndex - 1).
   * If ids provided, use those instead of selectedNodeIds.
   */
  sendToBack: (ids?: string[]) => void;

  /**
   * Increment zIndex of selected nodes by 1.
   * If ids provided, use those instead of selectedNodeIds.
   */
  bringForward: (ids?: string[]) => void;

  /**
   * Decrement zIndex of selected nodes by 1.
   * If ids provided, use those instead of selectedNodeIds.
   */
  sendBackward: (ids?: string[]) => void;

  /** Directly set the nodes array (used during multi-selection drag). */
  setNodes: (nodes: Node<CanvasNodeData>[]) => void;

  /**
   * Batch: create a new folder and move selected items into it.
   * Returns the new folder's DriveItem on success, null on failure.
   */
  groupInFolder: (nodeIds: string[], folderName: string) => Promise<DriveItem | null>;
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
    const dims = useCanvasStore.getState().expandedFolderDims;
    const rootNodePositions: NodePosition[] = nodes.map((n) => {
      const fd = dims[n.id];
      return {
        fileId: n.id,
        x: n.position.x,
        y: n.position.y,
        zIndex: n.zIndex,
        tabId,
        ...(fd ? { width: fd.width, height: fd.height } : {}),
      };
    });
    console.log('[PERSIST] saving positions:', {
      scope: tabId,
      positionsCount: rootNodePositions.length,
      nodes: rootNodePositions.map(p => `${p.fileId}:(${p.x},${p.y})`),
    });
    dbOperations.push(db.positions.bulkPut(rootNodePositions));

    /* Folder states + dimensions (merged so bulkPut doesn't overwrite) */
    const allFolderIds = new Set([
      ...Object.keys(expandedFolders),
      ...Object.keys(dims),
    ]);
    const fStates = Array.from(allFolderIds).map((folderId) => ({
      folderId,
      isOpen: expandedFolders[folderId] ?? false,
      width: dims[folderId]?.width,
      height: dims[folderId]?.height,
      tabId,
    }));
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

    // ── Sync to Google Drive ._karta/state.json (background, non-blocking) ──
    const user = useAuthStore.getState().user;
    if (user) {
      const folderId = useCanvasStore.getState().currentFolderId || 'root';
      const rootFolderId = useRootStore.getState().rootFolderId;
      const folderNodes = filterNodesByFolder(nodes, folderId, rootFolderId);
      const state = serializeCanvas(folderNodes, []);
      writeCanvasState(folderId, state).catch((err) => {
        console.warn('[PERSIST] Drive sync error (non-fatal):', err);
      });
    }
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
  expandedFolderDims: {},
  activeTabId: 'root',
  searchHighlightedNodeIds: [],
  currentFolderId: '',
  folderHoverTarget: null,
  removingNodeIds: [],
  pendingTrashItemIds: [],
  folderDragOrigins: {},
  folderDragChildren: {},
  folderDragChildOrigins: {},
  panMode: typeof window !== 'undefined' && navigator.maxTouchPoints > 0,
  isSyncing: false,
  isUploading: false,
  uploadProgress: 0,
  /* ── load ──────────────────────────────────────────────────── */

  loadItems: async (folderId: string) => {
    set({ isLoading: true, error: null, errorType: null, searchHighlightedNodeIds: [] });

    try {
      // At root view, load ALL items recursively so all saved positions
      // match existing nodes. When navigating inside a folder, only load
      // that folder's direct children.
      const rootFolderId = useRootStore.getState().rootFolderId;
      const loadingRoot = !folderId || folderId === 'root' || folderId === rootFolderId;
      let items: DriveItem[];
      if (loadingRoot) {
        items = await listAllChildren(folderId || 'root');
      } else {
        items = await listChildren(folderId);
      }

      // Filter root-level items based on folder context.
      const isRootView = loadingRoot;
      const rootItems = isRootView
        ? items
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

  /* ── Hydration: Google Drive first, Dexie fallback ──────────── */

  hydrateFromDexie: async (scope?: string) => {
    const { allItems, activeTabId, currentFolderId } = get();
    if (allItems.length === 0) return;

    const currentScope = scope ?? persistenceScope(activeTabId, currentFolderId);

    // ── Try Google Drive first ──────────────────────────────────
    const driveState = await readCanvasState(currentFolderId || 'root');
    let savedPositions: NodePosition[] = [];

    if (driveState && driveState.nodes.length > 0) {
      const { nodes: restoredNodes } = deserializeCanvas(driveState);
      savedPositions = restoredNodes.map((n) => ({
        fileId: n.id,
        x: n.position.x,
        y: n.position.y,
        zIndex: n.zIndex,
        tabId: currentScope,
      }));
      console.log('[HYDRATE] loaded from Google Drive:', {
        scope: currentScope,
        count: savedPositions.length,
      });
    } else {
      // ── Fallback: Dexie ────────────────────────────────────
      savedPositions = await db.positions.filter(p => p.tabId === currentScope).toArray();
      console.log('[HYDRATE] loaded from Dexie:', {
        scope: currentScope,
        count: savedPositions.length,
      });
    }

    const [savedEdges, savedFolderStates] = await Promise.all([
      db.edges.filter(e => e.tabId === currentScope).toArray(),
      db.folderState.filter(fs => fs.tabId === currentScope).toArray(),
    ]);

    // If no persisted data, keep grid layout
    if (savedPositions.length === 0 && savedFolderStates.length === 0) {
      return;
    }

    const posMap = new Map(
      savedPositions.map((p) => [p.fileId, { x: p.x, y: p.y, zIndex: p.zIndex }]),
    );

    /* 1. Compile folder expand state + dimensions from Dexie */
    const expandedFolders: Record<string, boolean> = {};
    const expandedFolderDims: Record<string, { width: number; height: number }> = {};
    for (const fs of savedFolderStates) {
      expandedFolders[fs.folderId] = fs.isOpen;
      if (fs.width != null && fs.height != null) {
        expandedFolderDims[fs.folderId] = { width: fs.width, height: fs.height };
      }
    }

    /* 2. Apply saved positions to all nodes (all root-level now) */
    const updatedNodes: Node<CanvasNodeData>[] = get().nodes.map((n) => {
      const pos = posMap.get(n.id);
      if (pos) {
        return { ...n, position: pos, zIndex: pos.zIndex ?? n.zIndex };
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
      expandedFolderDims,
    });

    console.log('[HYDRATE] complete — nodes:', get().nodes.length, 'expanded:', Object.keys(expandedFolders).length);
  },

  /* ── persistent save (immediate, not debounced) ───────────── */

  persistNow: async () => {
    const { nodes, edges, expandedFolders, expandedFolderDims, activeTabId, currentFolderId } = get();
    const scope = persistenceScope(activeTabId, currentFolderId);

    const dbOps: Promise<unknown>[] = [];

    const allNodePositions: NodePosition[] = nodes.map((n) => {
      const fd = expandedFolderDims[n.id];
      return {
        fileId: n.id,
        x: n.position.x,
        y: n.position.y,
        zIndex: n.zIndex,
        tabId: scope,
        ...(fd ? { width: fd.width, height: fd.height } : {}),
      };
    });
    dbOps.push(db.positions.bulkPut(allNodePositions));

    const allFolderIds = new Set([
      ...Object.keys(expandedFolders),
      ...Object.keys(expandedFolderDims),
    ]);
    const fStates = Array.from(allFolderIds).map((folderId) => ({
      folderId,
      isOpen: expandedFolders[folderId] ?? false,
      width: expandedFolderDims[folderId]?.width,
      height: expandedFolderDims[folderId]?.height,
      tabId: scope,
    }));
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
    console.log('[persistNow] Dexie save complete');

    // ── Sync to Google Drive ._karta/state.json (background, non-blocking) ──
    const user = useAuthStore.getState().user;
    if (user) {
      const folderId = get().currentFolderId || 'root';
      const rootFolderId = useRootStore.getState().rootFolderId;
      const folderNodes = filterNodesByFolder(nodes, folderId, rootFolderId);
      const state = serializeCanvas(folderNodes, edges);
      writeCanvasState(folderId, state).catch((err) => {
        console.warn('[persistNow] Drive sync error (non-fatal):', err);
      });
    }
  },

  /* ── folder toggle ─────────────────────────────────────────── */

  toggleFolder: async (folderId: string) => {
    const { expandedFolders } = get();
    const currentlyOpen = expandedFolders[folderId] ?? false;

    if (currentlyOpen) {
      // CLOSE: remove from expandedFolders. Set collapsed dimensions
      // so the mini-map shows correct size immediately (the onNodesChange
      // guard now ignores collapsed folders, so this sticks). Keep
      // expandedFolderDims intact for re-expand. Clear zIndex from children.
      const next = { ...expandedFolders };
      delete next[folderId];

      const { nodes, allItems } = get();
      const childIds = new Set(
        allItems.filter((item) => item.parentId === folderId).map((item) => item.id),
      );
      const updatedNodes = nodes.map((n) => {
        if (n.id === folderId) {
          // Set collapsed size: width 180 (matching containerStyle) and
          // approximate height for the card layout (icon + name + meta).
          return { ...n, width: 180, height: 170, measured: { width: 180, height: 170 } };
        }
        if (childIds.has(n.id)) {
          // Clear elevated zIndex set during expand
          const { zIndex, ...rest } = n as any;
          return rest;
        }
        return n;
      });

      set({
        expandedFolders: next,
        nodes: updatedNodes,
      });
    } else {
      // OPEN: mark as expanded. Restore saved (or default) expanded
      // dimensions on the folder node so ReactFlow's wrapper matches
      // the expanded content size immediately — no flicker from stale
      // collapsed dimensions leftover from toggleFolder CLOSE.
      const { nodes, allItems, expandedFolderDims } = get();
      const saved = expandedFolderDims[folderId];
      const expW = saved?.width ?? 640;
      const expH = saved?.height ?? 320;
      const childIds = allItems
        .filter((item) => item.parentId === folderId)
        .map((item) => item.id);
      let reorderedNodes = nodes;
      if (childIds.length > 0) {
        const childSet = new Set(childIds);
        const otherNodes = nodes
          .filter((n) => !childSet.has(n.id))
          .map((n) => {
            if (n.id === folderId) {
              return { ...n, width: expW, height: expH, measured: { width: expW, height: expH } } as Node<CanvasNodeData>;
            }
            return n;
          });
        const childNodes = nodes
          .filter((n) => childSet.has(n.id))
          .map((n) => ({ ...n, zIndex: 2000 } as Node<CanvasNodeData>));
        reorderedNodes = [...otherNodes, ...childNodes];
      } else {
        // No children, just restore expanded dims on the folder
        reorderedNodes = nodes.map((n) =>
          n.id === folderId
            ? ({ ...n, width: expW, height: expH, measured: { width: expW, height: expH } } as Node<CanvasNodeData>)
            : n,
        );
      }
      set({
        expandedFolders: { ...expandedFolders, [folderId]: true },
        nodes: reorderedNodes,
      });

      // Sync con Google Drive al expandir carpeta
      get().syncFolder(folderId).catch((err) => {
        console.error('[toggleFolder] sync error:', err);
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

    set({ expandedFolders: {}, expandedFolderDims: {} });

    get().applyGridLayout();
  },

  applyGridLayout: () => {
    const { nodes } = get();

    const items: DriveItem[] = nodes
      .filter((n) => n.type !== 'stickyNote')
      .map((n) => n.data.driveItem);
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
      let updated = applyNodeChanges(changes, get().nodes) as Node<CanvasNodeData>[];

      // Guard: ReactFlow's ResizeObserver dimension changes carry
      // `setAttributes: true` which overwrites user-set width/height.
      // Stale callbacks (from during a drag) can fire after our
      // setExpandedFolderDims, snapping the folder back to an intermediate
      // or old size. Restore expanded-folder dimensions from our store,
      // but ONLY for folders that are currently expanded — collapsed
      // folders should keep their measured collapsed size.
      const hasDimChanges = changes.some((c) => c.type === 'dimensions');
      if (hasDimChanges) {
        const dims = get().expandedFolderDims;
        if (Object.keys(dims).length > 0) {
          const expanded = get().expandedFolders;
          updated = updated.map((n) => {
            const saved = dims[n.id];
            if (saved && expanded[n.id]) {
              return { ...n, width: saved.width, height: saved.height, measured: { width: saved.width, height: saved.height } };
            }
            return n;
          });
        }
      }

      set({ nodes: updated });
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

  setExpandedFolderDims: (folderId: string, width: number, height: number) => {
    set((state) => {
      const childIds = new Set(
        state.allItems
          .filter((item) => item.parentId === folderId)
          .map((item) => item.id),
      );
      return {
        expandedFolderDims: { ...state.expandedFolderDims, [folderId]: { width, height } },
        // Update the folder node dimensions and ensure children keep
        // their elevated zIndex so they stay on top of the folder.
        nodes: state.nodes.map((n) => {
          if (n.id === folderId) {
            return { ...n, width, height, measured: { width, height } };
          }
          if (childIds.has(n.id) && (n as any).zIndex !== 2000) {
            return { ...n, zIndex: 2000 };
          }
          return n;
        }),
      };
    });
  },

  forceRecalcPositions: () => {
    const { nodes } = get();
    // Force new position object references so ReactFlow re-applies
    // CSS transforms for every node, correcting visual drift caused
    // by its ResizeObserver rendering bug.
    set({
      nodes: nodes.map((n) => ({
        ...n,
        position: { x: n.position.x, y: n.position.y },
      })),
    });
  },

  /* ── Upload state ─────────────────────────────────────────── */

  setUploadProgress: (progress: number) => {
    set({ isUploading: true, uploadProgress: progress });
  },

  clearUploadState: () => {
    set({ isUploading: false, uploadProgress: 0 });
  },

  /* ── Drag handlers ──────────────────────────────────────────── */

  onNodeDragStart: (_event: unknown, node: Node) => {
    if (node.type === 'folderNode') {
      const state = get();
      const allNodes = get().nodes;
      // Use bounds-based overlap detection (isOverlappingFolder) to find
      // nodes that visually belong to this folder at drag start (>50% overlap).
      const storeNode = allNodes.find(n => n.id === node.id);
      const folderPos = storeNode?.position ?? node.position;
      const folderWidth = (storeNode as any)?.width ?? (storeNode as any)?.measured?.width ?? (node as any).width ?? 640;
      const folderHeight = (storeNode as any)?.height ?? (storeNode as any)?.measured?.height ?? (node as any).height ?? 320;

      const childIds = allNodes
        .filter(n => n.id !== node.id)
        .filter(n => {
          const nWidth = (n as any)?.width ?? (n as any)?.measured?.width ?? 180;
          const nHeight = (n as any)?.height ?? (n as any)?.measured?.height ?? (n.type === 'folderNode' ? 320 : 170);
          return isOverlappingFolder(
            n.position,
            { width: nWidth, height: nHeight },
            folderPos,
            { width: folderWidth, height: folderHeight },
          );
        })
        .map(n => n.id);
      const origins = { ...state.folderDragOrigins };
      origins[node.id] = {
        x: node.position.x,
        y: node.position.y,
        width: folderWidth,
        height: folderHeight,
      };

      // Capture children's original positions. Used during drag to keep
      // children following the folder in real-time, and on drag stop to
      // compute final positions as `origin + delta` (avoids double-movement
      // from multi-selection drag in Canvas.tsx).
      const childOrigins: Record<string, { x: number; y: number }> = {};
      for (const childId of childIds) {
        const childNode = allNodes.find(n => n.id === childId);
        if (childNode) {
          childOrigins[childId] = { x: childNode.position.x, y: childNode.position.y };
        }
      }

      // Move children to the end of the nodes array so they render on top
      // of the folder during drag (ReactFlow z-index = array order).
      let reorderedNodes = allNodes;
      if (childIds.length > 0) {
        const childSet = new Set(childIds);
        const otherNodes = allNodes.filter(n => !childSet.has(n.id));
        const childNodes = allNodes.filter(n => childSet.has(n.id));
        reorderedNodes = [...otherNodes, ...childNodes];
      }

      set({
        nodes: reorderedNodes,
        folderDragOrigins: origins,
        folderDragChildren: {
          ...state.folderDragChildren,
          [node.id]: childIds,
        },
        folderDragChildOrigins: {
          ...state.folderDragChildOrigins,
          [node.id]: childOrigins,
        },
      });
    }
  },

  onNodeDrag: (_event: unknown, node: Node) => {
    if (node.type === 'folderNode') {
      const state = get();
      const origin = state.folderDragOrigins[node.id];
      const childIds = state.folderDragChildren[node.id];
      const childOrigins = state.folderDragChildOrigins[node.id];
      if (origin && childIds?.length && childOrigins) {
        const dx = node.position.x - origin.x;
        const dy = node.position.y - origin.y;
        const childSet = new Set(childIds);
        const updatedNodes = get().nodes.map((n) => {
          if (childSet.has(n.id)) {
            const co = childOrigins[n.id];
            if (co) {
              return { ...n, position: { x: co.x + dx, y: co.y + dy } };
            }
          }
          return n;
        });
        set({ nodes: updatedNodes });
      }
    }
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
        const currentWidth = (storeNode as any)?.width ?? (storeNode as any)?.measured?.width ?? (node as any).width ?? 0;
        const currentHeight = (storeNode as any)?.height ?? (storeNode as any)?.measured?.height ?? (node as any).height ?? 0;
        const isResize =
          origin.width !== undefined &&
          origin.height !== undefined &&
          (Math.abs(currentWidth - origin.width) > 3 ||
            Math.abs(currentHeight - origin.height) > 3);

        const childOrigins = state.folderDragChildOrigins[node.id];
        const childSet = new Set(childIds);
        const { nodes } = get();

        if (isResize) {
          // Resize: snap children BACK to their original positions.
          // During drag they were moved alongside the folder, but for a
          // resize operation they should stay put.
          const updatedNodes = nodes.map((n) => {
            const co = childOrigins?.[n.id];
            if (co) return { ...n, position: { x: co.x, y: co.y } };
            return n;
          });
          set({ nodes: updatedNodes });

          const newState = get();
          debouncedPersist(
            newState.nodes,
            newState.edges,
            newState.expandedFolders,
            persistenceScope(newState.activeTabId, newState.currentFolderId),
          );
        } else if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          // Drag: children were already positioned during onNodeDrag, but
          // set final positions using origin + delta to be absolutely correct
          // (handles edge cases from multi-selection drag).
          const updatedNodes = nodes.map((n) => {
            if (childSet.has(n.id)) {
              const co = childOrigins?.[n.id];
              return {
                ...n,
                position: {
                  x: (co?.x ?? n.position.x) + dx,
                  y: (co?.y ?? n.position.y) + dy,
                },
              };
            }
            return n;
          });
          set({ nodes: updatedNodes });

          const newState = get();
          debouncedPersist(
            newState.nodes,
            newState.edges,
            newState.expandedFolders,
            persistenceScope(newState.activeTabId, newState.currentFolderId),
          );
        }
      }

      // Clean up drag state
      const { [node.id]: _, ...restOrigins } = state.folderDragOrigins;
      const { [node.id]: __, ...restChildren } = state.folderDragChildren;
      const { [node.id]: ___, ...restChildOrigins } = state.folderDragChildOrigins;
      set({
        folderDragOrigins: restOrigins,
        folderDragChildren: restChildren,
        folderDragChildOrigins: restChildOrigins,
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
        // ── Optimistic local update + queue Drive API call ──────
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

        operationQueue.push({
          type: 'move',
          fileId: node.id,
          payload: { newParentId: rootId || '', oldParentId: currentParentId || '' },
        }).catch((err) => {
          console.error('[onNodeDragStop] Error moving to root:', err);
        });
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

    // ── Optimistic local update + queue Drive API call ─────────
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

    // Queue the Drive API call (non-blocking)
    operationQueue.push({
      type: 'move',
      fileId: itemId,
      payload: { newParentId: targetFolderId, oldParentId: oldParentId || '' },
    }).catch((err) => {
      console.error('[moveItemToFolder] API error:', err);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'No se pudo mover. Reintentá.',
      });
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
      const freshItems = await listChildren(currentFolderId || 'root');

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
        if (fresh && node.data.driveItem && fresh.name !== node.data.driveItem.name) {
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

  /* ── Sync folder (Drive Changes API) ───────────────────────────── */

  syncFolder: async (folderId: string) => {
    const state = get();
    if (state.isSyncing) return;

    set({ isSyncing: true });

    try {
      const result: SyncResult = await syncFolderService(folderId);

      if (result.changeCount === 0) {
        return;
      }

      const { allItems, nodes } = get();

      // 1. Remove items deleted in Drive
      const removeSet = new Set(result.removed);
      const filteredItems = allItems.filter((i) => !removeSet.has(i.id));
      const filteredNodes = nodes.filter((n) => !removeSet.has(n.id));

      // 2. Add new items
      const newNodes = result.added
        .filter((item) => !filteredItems.find((i) => i.id === item.id))
        .map((item) => ({
          id: item.id,
          type: item.isFolder ? 'folderNode' as const : 'fileNode' as const,
          position: { x: 12, y: 12 },
          data: { driveItem: item } as CanvasNodeData,
          deletable: false,
        }));

      const mergedItems = [
        ...filteredItems,
        ...result.added.filter((a) => !filteredItems.find((i) => i.id === a.id)),
      ];

      // 3. Rename items
      const renamedMap = new Map(result.renamed.map((r) => [r.fileId, r.newName]));
      const renamedNodes = filteredNodes.map((node) => {
        const newName = renamedMap.get(node.id);
        if (newName && node.data.driveItem && newName !== node.data.driveItem.name) {
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
        allItems: mergedItems,
        nodes: [...renamedNodes, ...newNodes],
      });

      // Persist changes
      const persistState = get();
      debouncedPersist(
        persistState.nodes,
        persistState.edges,
        persistState.expandedFolders,
        persistenceScope(persistState.activeTabId, persistState.currentFolderId),
      );
    } catch (err) {
      console.error('[syncFolder] Error:', err);
    } finally {
      set({ isSyncing: false });
    }
  },

  /* ── Rename node item ──────────────────────────────────────────── */

  renameNodeItem: async (fileId: string, newName: string) => {
    const { allItems, nodes } = get();

    // ── Optimistic local update ────────────────────────────
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

    // ── Queue the Drive API call (non-blocking) ────────────
    operationQueue.push({
      type: 'rename',
      fileId,
      payload: { newName },
    }).catch((err) => {
      const message = err instanceof Error ? err.message : 'Error al renombrar';
      useToastStore.getState().addToast({
        type: 'error',
        message,
      });
      console.error('[renameNodeItem] API error:', message);
    });

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

  /* ── Sticky note ────────────────────────────────────────────── */

  addStickyNote: (position: { x: number; y: number }) => {
    const { nodes } = get();
    const id = `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    let lastColor = 'yellow';
    try {
      const stored = localStorage.getItem('karta-last-sticky-color');
      if (stored) lastColor = stored;
    } catch { /* localStorage no disponible */ }

    const newNode: Node<Record<string, unknown>> = {
      id,
      type: 'stickyNote',
      position,
      data: {
        text: '',
        color: lastColor,
        author: 'K',
        createdAt: now,
      },
      deletable: false,
      width: 180,
      height: 180,
      selected: true,
    };

    const updatedNodes = nodes.map((n) => ({ ...n, selected: false })) as Node<CanvasNodeData>[];
    updatedNodes.push(newNode as unknown as Node<CanvasNodeData>);

    set({
      nodes: updatedNodes,
      selectedNodeId: id,
    });

    const persistState = get();
    debouncedPersist(
      persistState.nodes,
      persistState.edges,
      persistState.expandedFolders,
      persistenceScope(persistState.activeTabId, persistState.currentFolderId),
    );

    return id;
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
      const updatedDims = { ...currentState.expandedFolderDims };
      for (const id of toRemove) {
        delete updatedExpanded[id];
        delete updatedDims[id];
      }

      const remainingRemoving = currentState.removingNodeIds.filter(
        (id) => !removeSet.has(id),
      );

      set({
        nodes: updatedNodes,
        allItems: updatedItems,
        expandedFolders: updatedExpanded,
        expandedFolderDims: updatedDims,
        removingNodeIds: remainingRemoving,
      });

      const stateAfterRemove = get();
      debouncedPersist(
        stateAfterRemove.nodes,
        stateAfterRemove.edges,
        stateAfterRemove.expandedFolders,
        persistenceScope(stateAfterRemove.activeTabId, stateAfterRemove.currentFolderId),
      );

      // 3. Queue Drive delete operations (non-blocking)
      for (const fileId of toRemove) {
        operationQueue.push({
          type: 'delete',
          fileId,
          payload: {},
        }).catch((err) => {
          console.error(`[removeItems] Delete failed for ${fileId}:`, err);
        });
      }
    }, 300);
  },

  /* ── Z-index (traer al frente / enviar atrás) ─────────────────── */

  bringToFront: (ids?: string[]) => {
    const { nodes, selectedNodeIds } = get();
    const targetIds = ids ?? selectedNodeIds;
    if (targetIds.length === 0) return;
    const maxZ = Math.max(...nodes.map((n) => n.zIndex ?? 0), 0);
    const idSet = new Set(targetIds);
    set({
      nodes: nodes.map((n) =>
        idSet.has(n.id) ? { ...n, zIndex: maxZ + 1 } : n,
      ),
    });
  },

  sendToBack: (ids?: string[]) => {
    const { nodes, selectedNodeIds } = get();
    const targetIds = ids ?? selectedNodeIds;
    if (targetIds.length === 0) return;
    const minZ = Math.min(...nodes.map((n) => n.zIndex ?? 0), 0);
    const idSet = new Set(targetIds);
    set({
      nodes: nodes.map((n) =>
        idSet.has(n.id) ? { ...n, zIndex: minZ - 1 } : n,
      ),
    });
  },

  bringForward: (ids?: string[]) => {
    const { nodes, selectedNodeIds } = get();
    const targetIds = ids ?? selectedNodeIds;
    if (targetIds.length === 0) return;
    const idSet = new Set(targetIds);
    set({
      nodes: nodes.map((n) =>
        idSet.has(n.id) ? { ...n, zIndex: (n.zIndex ?? 0) + 1 } : n,
      ),
    });
  },

  sendBackward: (ids?: string[]) => {
    const { nodes, selectedNodeIds } = get();
    const targetIds = ids ?? selectedNodeIds;
    if (targetIds.length === 0) return;
    const idSet = new Set(targetIds);
    set({
      nodes: nodes.map((n) =>
        idSet.has(n.id) ? { ...n, zIndex: (n.zIndex ?? 0) - 1 } : n,
      ),
    });
  },

  /* ── Direct setNodes (for multi-selection drag) ────────────────── */

  setNodes: (nodes: Node<CanvasNodeData>[]) => {
    set({ nodes });
  },

  /* ── Group in folder (creates folder, moves items into it) ────── */

  groupInFolder: async (nodeIds: string[], folderName: string) => {
    const state = get();

    try {
      // 1. Create the folder in Drive
      const newFolder = await createItem(
        folderName,
        'application/vnd.google-apps.folder',
        state.currentFolderId || useRootStore.getState().rootFolderId || 'root',
      );

      // 2. Move all selected items into the new folder via queue
      const succeeded: string[] = [];
      for (const itemId of nodeIds) {
        const item = state.allItems.find((i) => i.id === itemId);
        const oldParentId = item?.parentId ?? '';
        succeeded.push(itemId); // optimistic — all succeed until proven otherwise
        operationQueue.push({
          type: 'move',
          fileId: itemId,
          payload: { newParentId: newFolder.id, oldParentId },
        }).catch((err) => {
          console.error(`[groupInFolder] Failed to move ${itemId}:`, err);
          // Remove from succeeded on failure
          const idx = succeeded.indexOf(itemId);
          if (idx >= 0) succeeded.splice(idx, 1);
        });
      }

      // 3. Update local state
      const updatedItems = state.allItems.map((item) => {
        if (succeeded.includes(item.id)) {
          return { ...item, parentId: newFolder.id };
        }
        return item;
      });
      updatedItems.push(newFolder);

      // 4. Add folder node to canvas with a position near the selection center
      const selectedNodes = state.nodes.filter((n) => succeeded.includes(n.id));
      const avgX = selectedNodes.length > 0
        ? Math.round(selectedNodes.reduce((s, n) => s + n.position.x, 0) / selectedNodes.length)
        : 200;
      const avgY = selectedNodes.length > 0
        ? Math.round(selectedNodes.reduce((s, n) => s + n.position.y, 0) / selectedNodes.length)
        : 200;

      const folderNode: Node<CanvasNodeData> = {
        id: newFolder.id,
        type: 'folderNode',
        position: { x: avgX, y: avgY },
        data: { driveItem: newFolder } as CanvasNodeData,
        deletable: false,
      };

      const updatedNodes = [
        ...state.nodes.map((n) => {
          if (succeeded.includes(n.id)) {
            return {
              ...n,
              data: {
                ...n.data,
                driveItem: { ...n.data.driveItem, parentId: newFolder.id },
              } as unknown as CanvasNodeData,
            };
          }
          return n;
        }),
        folderNode,
      ];

      set({
        nodes: updatedNodes,
        allItems: updatedItems,
      });

      // 5. Persist
      const newState = get();
      debouncedPersist(
        newState.nodes,
        newState.edges,
        newState.expandedFolders,
        persistenceScope(newState.activeTabId, newState.currentFolderId),
      );

      useToastStore.getState().addToast({
        type: 'success',
        message: `Carpeta "${folderName}" creada con ${succeeded.length} archivos ✅`,
      });

      return newFolder;
    } catch (err) {
      console.error('[groupInFolder] Error:', err);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'No se pudo agrupar. Reintentá.',
      });
      return null;
    }
  },
}));
