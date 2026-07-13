import { useEffect, useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  MarkerType,
  PanOnScrollMode,
  SelectionMode,
  type Node,
  type OnConnect,
  type Edge,
  ConnectionLineType,
} from '@xyflow/react';
import { useCanvasStore } from '../stores/canvasStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useViewStore } from '../stores/viewStore';
import FileNode from '../nodes/FileNode';
import FolderNode from '../nodes/FolderNode';
import StickyNote from './StickyNote';
import TextBox from './TextBox';
import ShapeNode from './ShapeNode';
import LoadingSkeleton from './LoadingSkeleton';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import CreateModal from './CreateModal';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { useNavigationStore } from '../stores/navigationStore';
import { useRootStore } from '../stores/rootStore';
import FilePreview from './FilePreview';
import ViewToggle from './ViewToggle';
import ListView from './ListView';
import DetailsPanel from './DetailsPanel';
import { useDetailsStore } from '../stores/detailsStore';
import GridView from './GridView';
import { createItem, CREATE_MIME_TYPES } from '../services/drive';
import { uploadFile, isFileTooLarge, MAX_UPLOAD_SIZE } from '../services/upload';
import ConfirmModal from './ConfirmModal';
import { isInsideFolder } from '../utils/folderBounds';

const nodeTypes = {
  fileNode: FileNode,
  folderNode: FolderNode,
  stickyNote: StickyNote,
  textBox: TextBox,
  shapeNode: ShapeNode,
};

const defaultEdgeOptions = {
  style: { stroke: '#6366F1', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' },
  interactionWidth: 10,
  type: 'smoothstep',
};

function Flow() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const isLoading = useCanvasStore((s) => s.isLoading);
  const error = useCanvasStore((s) => s.error);
  const errorType = useCanvasStore((s) => s.errorType);
  const loadItems = useCanvasStore((s) => s.loadItems);
  const mode = useViewStore((s) => s.mode);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const removeEdges = useCanvasStore((s) => s.removeEdges);
  const allItems = useCanvasStore((s) => s.allItems);
  const expandedFolders = useCanvasStore((s) => s.expandedFolders);
  const storeOnNodeDragStart = useCanvasStore((s) => s.onNodeDragStart);
  const storeOnNodeDrag = useCanvasStore((s) => s.onNodeDrag);
  const storeOnNodeDragStop = useCanvasStore((s) => s.onNodeDragStop);
  const persistNow = useCanvasStore((s) => s.persistNow);
  const isUploading = useCanvasStore((s) => s.isUploading);
  const uploadProgress = useCanvasStore((s) => s.uploadProgress);
  const setUploadProgress = useCanvasStore((s) => s.setUploadProgress);
  const clearUploadState = useCanvasStore((s) => s.clearUploadState);

  const { fitView } = useReactFlow();
  const { getIntersectingNodes } = useReactFlow();
  const logout = useAuthStore((s) => s.logout);

  const prefs = usePreferencesStore();

  /* ── Flush pending saves before tab close ──────────────────── */
  useEffect(() => {
    const onBeforeUnload = () => {
      persistNow(); // Best-effort: save to Dexie before the tab closes
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [persistNow]);

  /* ── File drag & drop state ──────────────────────────────────── */
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const fileDragCountRef = useRef(0);

  /* ── Multi-selection drag state (track origins of all selected nodes) ── */
  const multiDragOriginsRef = useRef<Record<string, { x: number; y: number }>>({});

  /* ── Filter visible nodes ────────────────────────────────────── */
  // All nodes are root-level. Nodes inside a collapsed folder are hidden.
  const visibleNodes = nodes.filter((node) => {
    if (node.type === 'folderNode') return true;

    // Hide nodes whose center point is inside any collapsed folder.
    for (const folder of nodes) {
      if (folder.type !== 'folderNode') continue;
      if (expandedFolders[folder.id]) continue;
      const folderPos = folder.position ?? { x: 0, y: 0 };
      const folderSize = {
        width: (folder as any).width ?? (folder as any).measured?.width ?? 640,
        height: (folder as any).height ?? (folder as any).measured?.height ?? 320,
      };
      const childSize = {
        width: (node as any).width ?? (node as any).measured?.width ?? 180,
        height: (node as any).height ?? (node as any).measured?.height ?? 170,
      };
      if (isInsideFolder(node.position, childSize, folderPos, folderSize)) {
        return false;
      }
    }
    return true;
  });

  const initialized = nodes.length > 0;

  /* ── drag & drop handlers ───────────────────────────────────── */
  const setFolderHoverTarget = useCanvasStore((s) => s.setFolderHoverTarget);

  // Drag delta tracking is handled in the store via folderDragOrigins.
  // The store's onNodeDragStart records the origin position, and onNodeDrag
  // compares current vs origin to distinguish real drags from resizes.

  const onNodeDragStart = useCallback(
    (_event: unknown, node: Node) => {
      setFolderHoverTarget(null);
      storeOnNodeDragStart(_event, node);

      // Record start positions for multi-selection drag
      const selectedIds = useCanvasStore.getState().selectedNodeIds;
      if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
        const origins: Record<string, { x: number; y: number }> = {};
        for (const n of useCanvasStore.getState().nodes) {
          if (selectedIds.includes(n.id)) {
            origins[n.id] = { ...n.position };
          }
        }
        multiDragOriginsRef.current = origins;
      } else {
        multiDragOriginsRef.current = {};
      }
    },
    [setFolderHoverTarget, storeOnNodeDragStart],
  );

  const onNodeDrag = useCallback(
    (_event: unknown, node: Node) => {
      // Call store handler to track folder position and move children if needed
      storeOnNodeDrag(_event, node);

      // ── Multi-selection drag: move all selected nodes together ──
      const origins = multiDragOriginsRef.current;
      const originKeys = Object.keys(origins);
      if (originKeys.length > 1 && origins[node.id]) {
        const dx = node.position.x - origins[node.id].x;
        const dy = node.position.y - origins[node.id].y;

        const stateNodes = useCanvasStore.getState().nodes;
        const needsUpdate = stateNodes.some((n) => {
          if (n.id === node.id || !origins[n.id]) return false;
          const expectedX = origins[n.id].x + dx;
          const expectedY = origins[n.id].y + dy;
          return Math.abs(n.position.x - expectedX) > 0.5 || Math.abs(n.position.y - expectedY) > 0.5;
        });

        if (needsUpdate) {
          const updatedNodes = stateNodes.map((n) => {
            if (origins[n.id] && n.id !== node.id) {
              return {
                ...n,
                position: {
                  x: origins[n.id].x + dx,
                  y: origins[n.id].y + dy,
                },
              };
            }
            return n;
          });
          useCanvasStore.getState().setNodes(updatedNodes);
        }
      }

      // Detect hover over folder nodes (visual feedback for drop targets)
      const intersecting = getIntersectingNodes(node)
        .filter(
          (n: Node) =>
            n.type === 'folderNode' && n.id !== node.id,
        );

      if (intersecting.length > 0) {
        setFolderHoverTarget(intersecting[0].id);
      } else {
        setFolderHoverTarget(null);
      }
    },
    [getIntersectingNodes, setFolderHoverTarget, storeOnNodeDrag],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      // Call store's onNodeDragStop for Drive sync
      storeOnNodeDragStop(_event, node);
      setFolderHoverTarget(null);
      multiDragOriginsRef.current = {};
    },
    [storeOnNodeDragStop, setFolderHoverTarget],
  );

  /* ── edge context menu ──────────────────────────────────────── */
  const [edgeCtxMenu, setEdgeCtxMenu] = useState<{
    x: number;
    y: number;
    edge: Edge;
  } | null>(null);
  const edgeCtxRef = useRef<HTMLDivElement>(null);

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setEdgeCtxMenu({ x: event.clientX, y: event.clientY, edge });
    },
    [],
  );

  const handleDeleteEdge = useCallback(() => {
    if (edgeCtxMenu) {
      removeEdges([edgeCtxMenu.edge.id]);
      setEdgeCtxMenu(null);
    }
  }, [edgeCtxMenu, removeEdges]);

  const handleEdgeCtxClose = useCallback(() => setEdgeCtxMenu(null), []);

  /* close edge context menu on outside click / Escape */
  useEffect(() => {
    if (!edgeCtxMenu) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (
        edgeCtxRef.current &&
        e.target instanceof Element &&
        !edgeCtxRef.current.contains(e.target)
      ) {
        handleEdgeCtxClose();
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleEdgeCtxClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [edgeCtxMenu, handleEdgeCtxClose]);

  /* ── CreateModal ────────────────────────────────────────────── */
  const [createModal, setCreateModal] = useState<{
    title: string;
    mimeType: string;
    parentFolderId: string;
    position?: { x: number; y: number };
  } | null>(null);

  const addNewItem = useCanvasStore((s) => s.addNewItem);
  const addStickyNote = useCanvasStore((s) => s.addStickyNote);
  const addTextBox = useCanvasStore((s) => s.addTextBox);
  const addShape = useCanvasStore((s) => s.addShape);
  const currentFolderId = useNavigationStore((s) => s.currentFolderId);

  /** Determine the parent folder for new items. */
  const getParentFolderId = useCallback(() => {
    if (currentFolderId) return currentFolderId;
    const realRootId = useRootStore.getState().rootFolderId;
    return realRootId || 'root';
  }, [currentFolderId]);

  /* ── drag & drop from sidebar onto canvas ────────────────────── */
  const reactFlowInstance = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    event.currentTarget.classList.add('drag-over');

    const hasFiles = Array.from(event.dataTransfer.types).includes('Files');
    if (hasFiles) {
      fileDragCountRef.current += 1;
      setIsFileDragOver(true);
    }
  }, []);

  const onDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const hasFiles = Array.from(event.dataTransfer.types).includes('Files');
    if (hasFiles) {
      fileDragCountRef.current += 1;
      setIsFileDragOver(true);
    }
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    event.currentTarget.classList.remove('drag-over');
    const hasFiles = Array.from(event.dataTransfer.types).includes('Files');
    if (hasFiles) {
      fileDragCountRef.current -= 1;
      if (fileDragCountRef.current <= 0) {
        fileDragCountRef.current = 0;
        setIsFileDragOver(false);
      }
    }
  }, []);

  const handleFileDrop = useCallback(
    async (files: FileList, dropPosition: { x: number; y: number }) => {
      const fileArray = Array.from(files);
      const folderId = getParentFolderId();

      for (const file of fileArray) {
        if (isFileTooLarge(file)) {
          useToastStore.getState().addToast({
            type: 'warning',
            message: `"${file.name}" supera los ${MAX_UPLOAD_SIZE / 1024 / 1024}MB. No se subió.`,
            duration: 5000,
          });
          continue;
        }

        setUploadProgress(0);

        try {
          const uploaded = await uploadFile(file, folderId, (progress) => {
            setUploadProgress(progress);
          });

          if (uploaded) {
            addNewItem(uploaded, dropPosition);
            useToastStore.getState().addToast({
              type: 'success',
              message: `"${file.name}" subido a Drive`,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al subir archivo';
          useToastStore.getState().addToast({
            type: 'error',
            message,
            duration: 5000,
          });
        }
      }

      clearUploadState();
    },
    [getParentFolderId, setUploadProgress, addNewItem, clearUploadState],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.currentTarget.classList.remove('drag-over');
      setIsFileDragOver(false);
      fileDragCountRef.current = 0;

      const files = event.dataTransfer.files;
      if (files.length > 0) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        handleFileDrop(files, position);
        return;
      }

      const stickyNoteType = event.dataTransfer.getData('application/x-karta-sticky-note');
      if (stickyNoteType) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addStickyNote(position);
        return;
      }

      const shapeType = event.dataTransfer.getData('application/x-karta-shape') as import('../types/nodes').ShapeType;
      if (shapeType) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addShape(position, shapeType);
        return;
      }

      const textBoxType = event.dataTransfer.getData('application/x-karta-text-box');
      if (textBoxType) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addTextBox(position);
        return;
      }

      const mimeType = event.dataTransfer.getData('application/karta-type');
      if (!mimeType) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let label = 'Elemento';
      if (mimeType === CREATE_MIME_TYPES.folder) label = 'Carpeta';
      else if (mimeType === CREATE_MIME_TYPES.document) label = 'Documento';
      else if (mimeType === CREATE_MIME_TYPES.spreadsheet) label = 'Planilla';
      else if (mimeType === CREATE_MIME_TYPES.presentation) label = 'Presentación';

      setCreateModal({
        title: `Nuevo ${label}`,
        mimeType,
        parentFolderId: getParentFolderId(),
        position,
      });
    },
    [reactFlowInstance, getParentFolderId, handleFileDrop],
  );

  /** Handle CreateModal submission → call Drive API, add to canvas. */
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSubmit = useCallback(
    async (name: string, mimeType: string, parentFolderId: string, dropPosition?: { x: number; y: number }) => {
      setIsCreating(true);
      try {
        const newItem = await createItem(name, mimeType, parentFolderId);
        addNewItem(newItem, dropPosition);
        setCreateModal(null);

        requestAnimationFrame(() => {
          fitView({ nodes: [{ id: newItem.id }], duration: 200, padding: 0.3 });
        });

        let label = 'Elemento';
        if (mimeType === CREATE_MIME_TYPES.folder) label = 'Carpeta';
        else if (mimeType === CREATE_MIME_TYPES.document) label = 'Documento';
        else if (mimeType === CREATE_MIME_TYPES.spreadsheet) label = 'Planilla';
        else if (mimeType === CREATE_MIME_TYPES.presentation) label = 'Presentación';

        useToastStore.getState().addToast({
          type: 'success',
          message: `${label} creado ✅`,
        });
      } catch (err) {
        console.error('[create] Error:', err);
        useToastStore.getState().addToast({
          type: 'error',
          message: 'No se pudo crear. Reintentá.',
        });
      } finally {
        setIsCreating(false);
      }
    },
    [addNewItem, fitView],
  );

  const handleCreateCancel = useCallback(() => {
    setCreateModal(null);
  }, []);

  /* ── Ctrl+N trigger from shortcutStore ─────────────────────────── */
  const pendingCreateType = useShortcutStore((s) => s.pendingCreateType);
  const clearCreateModal = useShortcutStore((s) => s.clearCreateModal);

  useEffect(() => {
    if (!pendingCreateType) return;

    const labelMap: Record<string, string> = {
      'application/vnd.google-apps.folder': 'Carpeta',
      'application/vnd.google-apps.document': 'Documento',
      'application/vnd.google-apps.spreadsheet': 'Planilla',
      'application/vnd.google-apps.presentation': 'Presentación',
    };
    const label = labelMap[pendingCreateType] || 'Elemento';
    const parentId = getParentFolderId();

    setCreateModal({
      title: `Nuevo ${label}`,
      mimeType: pendingCreateType,
      parentFolderId: parentId,
    });
    clearCreateModal();
  }, [pendingCreateType, clearCreateModal, getParentFolderId]);

  /* ── F2 rename trigger from shortcutStore ──────────────────────── */
  const pendingRenameNodeId = useShortcutStore((s) => s.pendingRenameNodeId);
  const clearRenameNode = useShortcutStore((s) => s.clearRenameNode);

  useEffect(() => {
    if (!pendingRenameNodeId) return;
    clearRenameNode();
    const item = allItems.find((i) => i.id === pendingRenameNodeId);
    const name = item?.name ?? pendingRenameNodeId;
    useToastStore.getState().addToast({
      type: 'info',
      message: `Renombrar "${name}" — disponible en próxima versión.`,
    });
  }, [pendingRenameNodeId, clearRenameNode, allItems]);

  /* ── Trash/Delete confirmation ───────────────────────────────── */

  const pendingTrashItemIds = useCanvasStore((s) => s.pendingTrashItemIds);
  const clearPendingTrash = useCanvasStore((s) => s.clearPendingTrash);
  const removeItems = useCanvasStore((s) => s.removeItems);
  const [isTrashing, setIsTrashing] = useState(false);

  const handleTrashConfirm = useCallback(async () => {
    const ids = useCanvasStore.getState().pendingTrashItemIds;
    if (ids.length === 0) return;

    setIsTrashing(true);
    try {
      // removeItems pushes delete operations to the queue and updates local state
      removeItems(ids);

      useToastStore.getState().addToast({
        type: 'success',
        message: ids.length === 1
          ? 'Elemento movido a la papelera'
          : `${ids.length} archivos movidos a la papelera`,
      });
    } catch (err) {
      console.error('[trash] Error:', err);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'No se pudo eliminar. Reintentá.',
      });
    } finally {
      setIsTrashing(false);
      clearPendingTrash();
    }
  }, [removeItems, clearPendingTrash]);

  const handleTrashCancel = useCallback(() => {
    clearPendingTrash();
  }, [clearPendingTrash]);

  /* ── edge tooltip on hover ──────────────────────────────────── */
  const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const onEdgeMouseEnter = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const target = allItems.find((i) => i.id === edge.target);
      if (target) {
        setHoveredEdge(edge);
      }
    },
    [allItems],
  );

  const onEdgeMouseMove = useCallback(
    (event: React.MouseEvent) => {
      setHoverPos({ x: event.clientX + 12, y: event.clientY - 10 });
    },
    [],
  );

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
    setHoverPos(null);
  }, []);

  // Fit view when nodes are first loaded
  useEffect(() => {
    if (initialized && !isLoading) {
      const timer = setTimeout(() => fitView({ duration: 200 }), 50);
      return () => clearTimeout(timer);
    }
  }, [initialized, isLoading, fitView]);

  const handleRetry = useCallback(() => {
    const folderId = useNavigationStore.getState().currentFolderId || useRootStore.getState().rootFolderId || 'root';
    loadItems(folderId);
  }, [loadItems]);

  const isEmpty = initialized && nodes.length === 0;

  /* ── render proper state ────────────────────────────────────── */
  if (error && !initialized) {
    const errorConfig =
      errorType === 'auth'
        ? {
            title: 'Sesión expirada',
            message: 'Tu sesión expiró. Iniciá sesión de nuevo.',
            onRetry: handleRetry,
            onLogout: () => {
              logout();
              useToastStore.getState().addToast({
                type: 'info',
                message: 'Sesión cerrada',
              });
            },
          }
        : errorType === 'rate-limit'
          ? {
              title: 'Demasiadas solicitudes',
              message: 'Esperá unos segundos y reintentá.',
              onRetry: handleRetry,
            }
          : {
              title: 'Error de conexión',
              message: error,
              onRetry: handleRetry,
            };

    return (
      <div className="w-full h-full flex items-center justify-center">
        <ErrorState {...errorConfig} />
      </div>
    );
  }

  if (isLoading && !initialized) {
    return (
      <div className="w-full h-full">
        <LoadingSkeleton />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <EmptyState
          icon="folder-open"
          title="Esta carpeta está vacía"
          description="Arrastrá archivos a tu Google Drive desde la web"
          action={{
            label: 'Abrir Google Drive',
            onClick: () => window.open('https://drive.google.com', '_blank'),
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="w-full h-full relative"
      onDragOver={mode === 'canvas' ? onDragOver : undefined}
      onDragEnter={mode === 'canvas' ? onDragEnter : undefined}
      onDragLeave={mode === 'canvas' ? onDragLeave : undefined}
      onDrop={mode === 'canvas' ? onDrop : undefined}
    >
      {/* ── ViewToggle ── */}
      <div className="absolute top-3 right-3 z-20">
        <ViewToggle />
      </div>

      {mode === 'canvas' && (
        <ReactFlow
          nodes={visibleNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect as OnConnect}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          proOptions={{ hideAttribution: true }}
          snapToGrid={prefs.snapToGrid}
          snapGrid={[20, 20]}
          minZoom={0.1}
          maxZoom={2}
          colorMode="light"
          zoomOnScroll={true}
          zoomOnDoubleClick={false}
          panOnScroll={true}
          panOnScrollMode={PanOnScrollMode.Free}
          panActivationKeyCode=""
          deleteKeyCode="Delete"
          selectionOnDrag={true}
          selectNodesOnDrag={false}
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode="Shift"
          panOnDrag={[1]}
          onSelectionChange={(params: { nodes: Node[] }) => {
            const ids = params.nodes.map((n) => n.id);
            useCanvasStore.getState().setSelectedNodeIds(ids);
            const details = useDetailsStore.getState();
            if (ids.length === 1) {
              details.open();
            } else {
              details.close();
            }
          }}
          onEdgeContextMenu={onEdgeContextMenu}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseMove={onEdgeMouseMove}
          onEdgeMouseLeave={onEdgeMouseLeave}

          connectionLineStyle={{ stroke: '#6366F1', strokeWidth: 2 }}
          connectionLineType={ConnectionLineType.SmoothStep}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
        >
          {prefs.showBackground && <Background variant={BackgroundVariant.Dots} gap={20} size={1} />}
          <Controls position="bottom-left" />
          {prefs.showMinimap && (
            <MiniMap
              position="bottom-right"
              nodeStrokeColor="#6366f1"
              nodeColor={(n: Node) => {
                if (n.type === 'folderNode') return '#dbeafe';
                return '#ffffff';
              }}
              style={{ background: '#f9fafb' }}
            />
          )}
        </ReactFlow>
      )}

      {mode === 'list' && <ListView />}
      {mode === 'grid' && <GridView />}

      {/* ── File drag overlay (canvas only) ── */}
      {mode === 'canvas' && isFileDragOver && (
        <div className="absolute inset-0 z-40 pointer-events-none rounded-2xl border-2 border-dashed border-[#2563EB] bg-[#2563EB]/[0.04]" />
      )}

      {/* ── Upload progress bar ── */}
      {isUploading && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg px-4 py-3 min-w-[200px] motion-safe:animate-fade-in-up">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-4 w-4 text-[#2563EB]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-[#1F2937] whitespace-nowrap">Subiendo… {uploadProgress}%</span>
          </div>
          <div className="mt-2 w-full h-1 bg-[#E5E7EB] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2563EB] rounded-full transition-all duration-200 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── File Preview ── */}
      <FilePreview />

      {/* ── Details Panel ── */}
      <DetailsPanel />

      {/* ── edge tooltip (canvas only) ── */}
      {mode === 'canvas' && hoveredEdge && hoverPos && (() => {
        const target = allItems.find((i) => i.id === hoveredEdge.target);
        return target ? (
          <div
            className="fixed z-50 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg pointer-events-none"
            style={{ left: hoverPos.x, top: hoverPos.y }}
          >
            Conectar con {target.name}
          </div>
        ) : null;
      })()}

      {/* ── edge context menu (canvas only) ── */}
      {mode === 'canvas' && edgeCtxMenu && (
        <div
          ref={edgeCtxRef}
          className="fixed z-50 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 motion-safe:animate-fade-in-up"
          style={{ left: edgeCtxMenu.x, top: edgeCtxMenu.y }}
        >
          <button
            onClick={handleDeleteEdge}
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              width="16"
              height="16"
              className="shrink-0 text-red-400"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                clipRule="evenodd"
              />
            </svg>
            Eliminar conexión
          </button>
        </div>
      )}

      {/* ── CreateModal ── */}
      {createModal && (
        <CreateModal
          title={createModal.title}
          onSubmit={(name) =>
            handleCreateSubmit(
              name,
              createModal.mimeType,
              createModal.parentFolderId,
              createModal.position,
            )
          }
          onCancel={handleCreateCancel}
          isLoading={isCreating}
        />
      )}

      {/* ── ConfirmModal (trash) ── */}
      {pendingTrashItemIds.length > 0 && (() => {
        const state = useCanvasStore.getState();
        const items = pendingTrashItemIds
          .map((id) => state.allItems.find((i) => i.id === id))
          .filter(Boolean)
          .map((i) => i!.name);
        const count = items.length;

        let message: string;
        if (count === 1) {
          message = `¿Mover "${items[0]}" a la papelera?`;
        } else {
          message = `¿Mover ${count} archivos a la papelera?`;
        }

        return (
          <ConfirmModal
            title="Mover a la papelera"
            message={message}
            onConfirm={handleTrashConfirm}
            onCancel={handleTrashCancel}
            isLoading={isTrashing}
          />
        );
      })()}
    </div>
  );
}

export default function Canvas() {
  return <Flow />;
}
