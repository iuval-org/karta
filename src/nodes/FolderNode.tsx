import {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Handle,
  Position,
  useNodeId,
  useStore,
  type NodeProps,
} from '@xyflow/react';
import type { CanvasNodeData } from '../stores/canvasStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useTabStore } from '../stores/tabStore';
import EmptyState from '../components/EmptyState';
import { validateFileName } from '../utils/validation';

/* ------------------------------------------------------------------ */
/*  Realistic macOS‑style folder SVGs                                  */
/* ------------------------------------------------------------------ */

const CLOSED_FOLDER_SVG = `<svg viewBox="0 0 40 32" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 6 L2 28 Q2 30 4 30 L36 30 Q38 30 38 28 L38 10 Q38 8 36 8 L18 8 L14 4 Q13 2 11 2 L4 2 Q2 2 2 4 Z" fill="#3B82F6"/>
  <path d="M2 8 L2 28 Q2 30 4 30 L36 30 Q38 30 38 28 L38 10 Q38 10 36 10 Z" fill="#60A5FA" opacity="0.6"/>
</svg>`;

const OPEN_FOLDER_SVG = `<svg viewBox="0 0 40 32" width="24" height="19" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 8 L14 8 L18 4 Q19 2 21 2 L36 2 Q38 2 38 4 L38 8" fill="#3B82F6"/>
  <path d="M2 10 L2 28 Q2 30 4 30 L36 30 Q38 30 38 28 L38 12 Q38 10 36 10 Z" fill="#DBEAFE" stroke="#93C5FD"/>
</svg>`;

const MENU_DOTS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 14a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function FolderNode({ id, data, selected }: NodeProps) {
  const item = (data as unknown as CanvasNodeData).driveItem;

  /* ── ReactFlow node dimensions ── */
  const nodeId = useNodeId();
  const rfNode = useStore((s) => s.nodeLookup.get(nodeId ?? id));
  // Read expanded dimensions from our own store (not ReactFlow's) to avoid
  // triggering ReactFlow's rendering bug when dimensions change.
  const storedDims = useCanvasStore((s) => s.expandedFolderDims[id]);
  const setExpandedFolderDims = useCanvasStore((s) => s.setExpandedFolderDims);
  const rfWidth = storedDims?.width ?? rfNode?.width ?? rfNode?.measured?.width ?? 640;
  const rfHeight = storedDims?.height ?? rfNode?.height ?? rfNode?.measured?.height ?? 320;

  /* ── Custom resize (replaces buggy NodeResizer) ── */
  // We avoid direct DOM style manipulation because React re-renders
  // (triggered by ReactFlow's ResizeObserver → onNodesChange) will
  // overwrite it with the stale containerStyle in between pointer
  // frames. Instead we keep the current drag dims in a ref and use
  // them in pointer-up. To keep the visual smooth during drag we
  // also update a lightweight state so React's style prop adopts
  // the drag dims (preventing the overwrite fight).
  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const resizeLastApplied = useRef({ w: 0, h: 0 });
  const resizeNodeId = useRef(id);
  resizeNodeId.current = id;
  const [resizeLive, setResizeLive] = useState<{ w: number; h: number } | null>(null);

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const nodeEl = rootElRef.current;
    if (!nodeEl) return;
    const rect = nodeEl.getBoundingClientRect();
    isResizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
    // Track the last-applied size so we skip no-op updates
    resizeLastApplied.current = { w: rect.width, h: rect.height };

    // Re-assert children's zIndex so they stay on top of the folder
    // during resize (ReactFlow may recalculate z-indices on dimension
    // changes, dropping our explicit zIndex:2000).
    const state = useCanvasStore.getState();
    const childIds = state.allItems
      .filter((item) => item.parentId === id)
      .map((item) => item.id);
    if (childIds.length > 0) {
      const childSet = new Set(childIds);
      state.setNodes(
        state.nodes.map((n) =>
          childSet.has(n.id) ? { ...n, zIndex: 2000 } as any : n,
        ),
      );
    }
  }, [id]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isResizing.current) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    const newW = Math.max(300, resizeStart.current.w + dx);
    const newH = Math.max(100, resizeStart.current.h + dy);
    // Skip if dimensions haven't meaningfully changed (avoids
    // size drift from tiny pointer moves on click).
    const last = resizeLastApplied.current;
    if (Math.abs(newW - last.w) < 2 && Math.abs(newH - last.h) < 2) return;
    resizeLastApplied.current = { w: newW, h: newH };
    // Update local state (so React's style prop adopts the drag dims)
    // and keep direct DOM update for instant visual feedback.
    setResizeLive({ w: newW, h: newH });
    if (rootElRef.current) {
      rootElRef.current.style.width = `${newW}px`;
      rootElRef.current.style.height = `${newH}px`;
    }
    // Update the store's expandedFolderDims and node dimensions in
    // real-time so visibleNodes clips children to the live bounds
    // during resize (rather than using stale pre-resize dimensions).
    setExpandedFolderDims(id, newW, newH);
  }, [id, setExpandedFolderDims]);

  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isResizing.current) return;
    isResizing.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Only persist if dimensions actually changed (skip click-only).
    const startW = resizeStart.current.w;
    const startH = resizeStart.current.h;
    const finalDims = resizeLive ?? (rootElRef.current ? {
      w: rootElRef.current.getBoundingClientRect().width,
      h: rootElRef.current.getBoundingClientRect().height,
    } : { w: rfWidth, h: rfHeight });
    setResizeLive(null);
    if (Math.abs(finalDims.w - startW) > 2 || Math.abs(finalDims.h - startH) > 2) {
      setExpandedFolderDims(resizeNodeId.current, finalDims.w, finalDims.h);
    }
  }, [setExpandedFolderDims, resizeLive, rfWidth, rfHeight]);

  /* ── Store selectors (simplified — no viewport/child positions) ── */
  const isExpanded = useCanvasStore((s) => s.expandedFolders[id] ?? false);
  const allItems = useCanvasStore((s) => s.allItems);
  const toggleFolder = useCanvasStore((s) => s.toggleFolder);
  const nodes = useCanvasStore((s) => s.nodes);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const searchHighlightedNodeIds = useCanvasStore((s) => s.searchHighlightedNodeIds);
  const removingNodeIds = useCanvasStore((s) => s.removingNodeIds);
  const isSearchActive = searchHighlightedNodeIds.length > 0;
  const isSearchMatch = searchHighlightedNodeIds.includes(id);
  const isRemoving = removingNodeIds.includes(id);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const applyGridLayout = useCanvasStore((s) => s.applyGridLayout);
  const isMultiSelected = selected && selectedNodeIds.length > 1;
  const folderHoverTarget = useCanvasStore((s) => s.folderHoverTarget);
  const isDragOver = folderHoverTarget === id && !isExpanded;

  /* ── Refs ── */
  const rootElRef = useRef<HTMLDivElement>(null);

  /* ── child count ── */
  const childCount = useMemo(
    () => allItems.filter((i) => i.parentId === item.id).length,
    [allItems, item.id],
  );

  /* ── No longer needed: wrapper overflow:hidden was clipping the
     expanded folder because ReactFlow's wrapper retained collapsed
     dimensions (220x60) while the inner div expanded to saved dims.
     The content area div below already has overflow:hidden to
     clip children inside the folder. ── */

  /* ── handlers ── */

  const handleDoubleClick = useCallback(() => {
    toggleFolder(id);
  }, [id, toggleFolder]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFolder(id);
    },
    [id, toggleFolder],
  );

  /* ── context menu ── */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [_menuOpen, setMenuOpen] = useState(false);
  const [connectMenu, setConnectMenu] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  /* ── inline rename ── */
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameNodeItem = useCanvasStore((s) => s.renameNodeItem);

  const startRename = useCallback(() => {
    setIsRenaming(true);
    setRenameValue(item.name);
    setRenameError(false);
  }, [item.name]);

  const confirmRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === item.name) {
      setIsRenaming(false);
      setRenameError(false);
      return;
    }

    const validation = validateFileName(trimmed);
    if (!validation.valid) {
      setRenameError(true);
      return;
    }

    const success = await renameNodeItem(id, trimmed);
    if (success) {
      setIsRenaming(false);
      setRenameError(false);
    } else {
      setIsRenaming(false);
      setRenameError(false);
    }
  }, [renameValue, item.name, id, renameNodeItem]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameError(false);
  }, []);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    },
    [confirmRename, cancelRename],
  );

  const handleRenameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRenameValue(e.target.value);
      setRenameError(false);
    },
    [],
  );

  /* Focus input when renaming starts */
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
      setConnectMenu(false);
    },
    [],
  );

  const closeCtx = useCallback(() => {
    setCtxMenu(null);
    setMenuOpen(false);
    setConnectMenu(false);
  }, []);

  const handleMenuClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).closest('button')?.getBoundingClientRect();
      if (rect) {
        setCtxMenu({ x: rect.left, y: rect.bottom + 4 });
        setMenuOpen(true);
        setConnectMenu(false);
      }
    },
    [],
  );

  const handleOpenInDrive = useCallback(() => {
    if (item.webViewLink && item.webViewLink !== '#') {
      window.open(item.webViewLink, '_blank');
    }
    closeCtx();
  }, [item.webViewLink, closeCtx]);

  const handleCopyName = useCallback(() => {
    navigator.clipboard.writeText(item.name).catch(() => {});
    closeCtx();
  }, [item.name, closeCtx]);

  const handleOpenInNewTab = useCallback(() => {
    const addTab = useTabStore.getState().addTab;
    addTab(id, item.name);
    closeCtx();
  }, [id, item.name, closeCtx]);

  const handleConnectWith = useCallback(() => {
    setConnectMenu(true);
  }, []);

  const handleConnectToNode = useCallback(
    (targetId: string) => {
      onConnect({ source: id, target: targetId, sourceHandle: null, targetHandle: null });
      closeCtx();
    },
    [id, onConnect, closeCtx],
  );

  const setPendingTrash = useCanvasStore((s) => s.setPendingTrash);

  const handleTrash = useCallback(() => {
    setPendingTrash([id]);
    closeCtx();
  }, [id, setPendingTrash, closeCtx]);

  const handleBatchTrash = useCallback(() => {
    const state = useCanvasStore.getState();
    const ids = state.selectedNodeIds.filter((sid) => sid !== 'root');
    state.setPendingTrash(ids);
    closeCtx();
  }, [closeCtx]);

  const handleBatchGridLayout = useCallback(() => {
    applyGridLayout();
    closeCtx();
  }, [applyGridLayout, closeCtx]);

  const handleBatchClearSelection = useCallback(() => {
    clearSelection();
    closeCtx();
  }, [clearSelection, closeCtx]);

  const handleBatchBringToFront = useCallback(() => {
    const state = useCanvasStore.getState();
    state.batchBringToFront(state.selectedNodeIds);
    closeCtx();
  }, [closeCtx]);

  const handleBatchSendToBack = useCallback(() => {
    const state = useCanvasStore.getState();
    state.batchSendToBack(state.selectedNodeIds);
    closeCtx();
  }, [closeCtx]);

  const handleGroupInFolder = useCallback(() => {
    const name = window.prompt('Nombre de la carpeta:', 'Grupo');
    if (!name || !name.trim()) return;
    const state = useCanvasStore.getState();
    state.groupInFolder(state.selectedNodeIds, name.trim());
    closeCtx();
  }, [closeCtx]);

  /* close context menu on outside click / Escape */
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        closeCtx();
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closeCtx();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu, closeCtx]);

  /* close context menu on viewport change (zoom / pan) */
  const transform = useStore((s) => s.transform);
  useEffect(() => {
    closeCtx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform[0], transform[1], transform[2]]);

  /* ── available connection targets ── */
  const connectTargets = useMemo(
    () =>
      nodes
        .filter((n) => n.id !== id)
        .map((n) => ({
          id: n.id,
          name: (n.data as unknown as CanvasNodeData).driveItem.name,
        })),
    [nodes, id],
  );

  /* ── styles ── */
  const containerStyle: React.CSSProperties | undefined = (() => {
    if (isExpanded) {
      if (resizeLive) return { width: resizeLive.w, height: resizeLive.h };
      return { width: rfWidth, height: rfHeight };
    }
    return { width: 180 };
  })();

  const borderClass = selected
    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
    : isDragOver
      ? 'border-indigo-500 bg-blue-50/50 shadow-lg'
      : isSearchActive && isSearchMatch
        ? 'border-[#1E40AF] ring-2 ring-[#1E40AF]/30'
        : isExpanded
          ? 'border-gray-200'
          : 'border-gray-200 motion-safe:hover:border-indigo-500/30 motion-safe:hover:shadow-md motion-safe:hover:-translate-y-0.5';

  const opacityClass =
    isSearchActive && !isSearchMatch ? 'opacity-30' : '';

  const removingClass = isRemoving ? 'animate-fade-out' : '';

  /* ── hover state ── */
  const [isHovered, setIsHovered] = useState(false);

  /* ── Expand/collapse animation classes ── */
  const [animating, setAnimating] = useState<'expanding' | 'collapsing' | null>(null);
  const prevOpen = useRef(isExpanded);

  useEffect(() => {
    if (isExpanded && !prevOpen.current) {
      setAnimating('expanding');
      const t = setTimeout(() => setAnimating(null), 200);
      prevOpen.current = true;
      return () => clearTimeout(t);
    } else if (!isExpanded && prevOpen.current) {
      setAnimating('collapsing');
      const t = setTimeout(() => setAnimating(null), 300);
      prevOpen.current = false;
      return () => clearTimeout(t);
    }
  }, [isExpanded]);

  const animClass = animating === 'expanding'
    ? 'animate-folder-expand'
    : animating === 'collapsing'
      ? 'animate-folder-collapse'
      : '';

  /* ── render ── */
  return (
    <div
      ref={rootElRef}
      className={[
        'relative select-none',
        isExpanded
          ? 'bg-white border rounded-xl shadow-sm'
          : 'bg-white border rounded-xl shadow-sm',
        borderClass,
        opacityClass,
        removingClass,
        animClass,
      ].join(' ')}
      style={containerStyle}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── target handle (top, invisible) ── */}
      <Handle
        type="target"
        position={Position.Top}
        className="!opacity-0 !pointer-events-auto"
      />

      {/* ── left target handle (visible on hover, closed only) ── */}
      {!isExpanded && (
        <div
          className={`absolute left-[-5px] top-1/2 -translate-y-1/2 motion-safe:transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Handle
            type="target"
            id="left"
            position={Position.Left}
            className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-white !shadow-sm !relative !transform-none !top-auto !left-auto motion-safe:transition-transform motion-safe:hover:scale-125"
          />
        </div>
      )}

      {isExpanded ? (
        /* ════════════════════════════════════════════════════════ */
        /*  EXPANDED STATE — frame-style container                   */
        /* ════════════════════════════════════════════════════════ */
        <>
          {/* ── header bar ── */}
          <div className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-2 py-1.5 rounded-t-xl">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={handleClose}
                className="shrink-0 p-0.5 rounded text-gray-500 hover:text-gray-700 hover:bg-blue-100 motion-safe:transition-colors active:scale-[0.97]"
                title="Colapsar carpeta"
              >
                <span className="block w-4 h-4 text-[16px] leading-none font-mono text-gray-500">−</span>
              </button>
              <span
                className="shrink-0 text-blue-500 flex items-center"
                dangerouslySetInnerHTML={{ __html: OPEN_FOLDER_SVG }}
              />
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={handleRenameChange}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={confirmRename}
                  className={`font-display font-semibold text-sm text-gray-900 leading-tight bg-transparent border-b-2 outline-none px-0 py-0 min-w-[60px] ${
                    renameError ? 'border-red-500' : 'border-indigo-500'
                  }`}
                />
              ) : (
                <span
                  className="font-display font-semibold text-sm text-gray-900 truncate max-w-[120px] cursor-text"
                  onDoubleClick={startRename}
                  title={item.name}
                >
                  {item.name}
                </span>
              )}
              <span className="font-body text-xs text-gray-400 shrink-0">
                ({childCount})
              </span>
            </div>

            <button
              onClick={handleMenuClick}
              className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-blue-100 motion-safe:transition-colors active:scale-[0.97]"
              title="Opciones"
            >
              <span dangerouslySetInnerHTML={{ __html: MENU_DOTS }} />
            </button>
          </div>

          {/* ── content area — no internal viewport/pan/zoom ── */}
          <div
            className="relative overflow-hidden"
            style={{
              width: '100%',
              height: 'calc(100% - 34px)',
            }}
          >
            {childCount === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <EmptyState
                  icon="folder"
                  title="Sin archivos"
                  description="Esta carpeta no tiene archivos todavía"
                />
              </div>
            )}

            {childCount > 0 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
                Arrastrá archivos dentro de esta carpeta
              </div>
            )}
          </div>

          {/* ── Resize handle (bottom-right corner) ── */}
          {!isRenaming && (
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-50"
              style={{
                background: 'linear-gradient(135deg, transparent 50%, #9ca3af 50%)',
              }}
              title="Redimensionar"
            />
          )}
        </>
      ) : (
        /* ════════════════════════════════════════════════════════ */
        /*  COLLAPSED STATE — file‑like card                         */
        /* ════════════════════════════════════════════════════════ */
        <div className="p-2.5 space-y-1.5">
          {/* folder icon in thumbnail area */}
          <div className="w-full aspect-[16/10] rounded-lg overflow-hidden bg-blue-50 flex items-center justify-center">
            <div
              className="w-14 h-12 text-blue-400 flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: CLOSED_FOLDER_SVG }}
            />
          </div>

          {/* folder name */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={handleRenameChange}
              onKeyDown={handleRenameKeyDown}
              onBlur={confirmRename}
              className={`font-display font-bold text-sm text-gray-900 leading-tight w-full bg-transparent border-b-2 outline-none px-0 py-0 ${
                renameError ? 'border-red-500' : 'border-indigo-500'
              }`}
            />
          ) : (
            <p
              className="font-display font-bold text-sm text-gray-900 leading-tight truncate cursor-text"
              title={item.name}
              onDoubleClick={startRename}
            >
              {item.name}
            </p>
          )}

          {/* metadata – child count */}
          <p className="font-body text-xs text-gray-500 truncate">
            {childCount > 0
              ? `${childCount} archivo${childCount !== 1 ? 's' : ''}`
              : 'Vacía'}
            {' · '}Carpeta
          </p>
        </div>
      )}

      {/* ── source handle (bottom, invisible) ── */}
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!opacity-0 !pointer-events-auto"
      />

      {/* ── source handle (right, visible on hover, closed only) ── */}
      {!isExpanded && (
        <div
          className={`absolute right-[-5px] top-1/2 -translate-y-1/2 motion-safe:transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Handle
            type="source"
            id="right"
            position={Position.Right}
            className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-white !shadow-sm !relative !transform-none !top-auto !right-auto motion-safe:transition-transform motion-safe:hover:scale-125"
          />
        </div>
      )}

      {/* ── context menu ── */}
      {ctxMenu && !connectMenu && !isMultiSelected && createPortal(
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[190px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 motion-safe:animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={handleOpenInDrive}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              width="16"
              height="16"
              className="shrink-0 text-gray-400"
            >
              <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
              <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
            </svg>
            Abrir en Google Drive
          </button>
          <button
            onClick={handleCopyName}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              width="16"
              height="16"
              className="shrink-0 text-gray-400"
            >
              <path
                fillRule="evenodd"
                d="M13.324 3.517a2.517 2.517 0 012.66-.51l.996.38a2.517 2.517 0 011.523 2.264v7.698a2.517 2.517 0 01-1.523 2.264l-.996.38a2.517 2.517 0 01-2.66-.51l-4.39-4.39a2.517 2.517 0 010-3.562l4.39-4.39z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M2.75 3A.75.75 0 003 2.25H6.5a.75.75 0 010 1.5H3.75v6h3a.75.75 0 010 1.5h-3A1.5 1.5 0 012.25 9.75v-6A1.5 1.5 0 013.75 2.25z"
                clipRule="evenodd"
              />
            </svg>
            Copiar nombre
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleOpenInNewTab}
            className="w-full px-3 py-1.5 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              width="16"
              height="16"
              className="shrink-0 text-blue-500"
            >
              <path
                fillRule="evenodd"
                d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zm8.5 3.5a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0V7.56l-6.22 6.22a.75.75 0 11-1.06-1.06l6.22-6.22H8.75a.75.75 0 010-1.5h4.5z"
                clipRule="evenodd"
              />
            </svg>
            Abrir en nueva pestaña
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleTrash}
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
            Mover a papelera
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleConnectWith}
            className="w-full px-3 py-1.5 text-left text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              width="16"
              height="16"
              className="shrink-0 text-indigo-500"
            >
              <path d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.414A1.5 1.5 0 0016.328 6.2l-4.124-4.124A1.5 1.5 0 0011.172 2H4.5z" />
            </svg>
            Conectar con...
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => {
              useCanvasStore.getState().bringToFront(id);
              closeCtx();
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M5.23 2a4.23 4.23 0 00-4.23 4.23V13.5A2.5 2.5 0 003.5 16H5v1.25a.75.75 0 001.28.53l3.33-3.33a.75.75 0 000-1.06L6.28 10.1a.75.75 0 00-1.28.53v1.12H3.5a1 1 0 01-1-1V6.23A2.73 2.73 0 015.23 3.5H16.5a1 1 0 011 1v4.27a2.73 2.73 0 01-2.73 2.73H13a.75.75 0 000 1.5h1.77a4.23 4.23 0 004.23-4.23V4.5A2.5 2.5 0 0016.5 2H5.23z" clipRule="evenodd" />
            </svg>
            Traer al frente
          </button>
          <button
            onClick={() => {
              useCanvasStore.getState().sendToBack(id);
              closeCtx();
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M14.77 18a4.23 4.23 0 004.23-4.23V6.5A2.5 2.5 0 0016.5 4H15V2.75a.75.75 0 00-1.28-.53l-3.33 3.33a.75.75 0 000 1.06l3.33 3.33a.75.75 0 001.28-.53V7.5h1.5a1 1 0 011 1v6.27a2.73 2.73 0 01-2.73 2.73H3.5a1 1 0 01-1-1V10.23A2.73 2.73 0 015.23 7.5H7a.75.75 0 000-1.5H5.23A4.23 4.23 0 001 10.23v5.27A2.5 2.5 0 003.5 18h11.27z" clipRule="evenodd" />
            </svg>
            Enviar atrás
          </button>
        </div>,
        document.body,
      )}

      {/* ── batch context menu (multi-select) ── */}
      {ctxMenu && !connectMenu && isMultiSelected && createPortal(
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 motion-safe:animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {selectedNodeIds.length} seleccionados
          </div>
          <button
            onClick={handleBatchTrash}
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
            Mover a papelera ({selectedNodeIds.length})
          </button>
          <button
            onClick={handleBatchGridLayout}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
            </svg>
            Alinear a grilla
          </button>
          <button
            onClick={handleGroupInFolder}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
            </svg>
            Agrupar en carpeta
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleBatchBringToFront}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M5.23 2a4.23 4.23 0 00-4.23 4.23V13.5A2.5 2.5 0 003.5 16H5v1.25a.75.75 0 001.28.53l3.33-3.33a.75.75 0 000-1.06L6.28 10.1a.75.75 0 00-1.28.53v1.12H3.5a1 1 0 01-1-1V6.23A2.73 2.73 0 015.23 3.5H16.5a1 1 0 011 1v4.27a2.73 2.73 0 01-2.73 2.73H13a.75.75 0 000 1.5h1.77a4.23 4.23 0 004.23-4.23V4.5A2.5 2.5 0 0016.5 2H5.23z" clipRule="evenodd" />
            </svg>
            Traer al frente
          </button>
          <button
            onClick={handleBatchSendToBack}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M14.77 18a4.23 4.23 0 004.23-4.23V6.5A2.5 2.5 0 0016.5 4H15V2.75a.75.75 0 00-1.28-.53l-3.33 3.33a.75.75 0 000 1.06l3.33 3.33a.75.75 0 001.28-.53V7.5h1.5a1 1 0 011 1v6.27a2.73 2.73 0 01-2.73 2.73H3.5a1 1 0 01-1-1V10.23A2.73 2.73 0 015.23 7.5H7a.75.75 0 000-1.5H5.23A4.23 4.23 0 001 10.23v5.27A2.5 2.5 0 003.5 18h11.27z" clipRule="evenodd" />
            </svg>
            Enviar atrás
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleBatchClearSelection}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            Limpiar selección
          </button>
        </div>,
        document.body,
      )}

      {/* ── connect target list ── */}
      {ctxMenu && connectMenu && createPortal(
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[200px] max-h-[260px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1 motion-safe:animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Conectar con...
          </div>
          {connectTargets.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400 italic">
              No hay nodos disponibles
            </div>
          ) : (
            connectTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => handleConnectToNode(target.id)}
                className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-2 active:scale-[0.97] truncate cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="14"
                  height="14"
                  className="shrink-0 text-indigo-400"
                >
                  <path d="M5.75 2A1.75 1.75 0 004 3.75v12.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0016 16.25V3.75A1.75 1.75 0 0014.25 2h-5.5z" />
                </svg>
                <span className="truncate">{target.name}</span>
              </button>
            ))
          )}
          <div className="border-t border-gray-100 mt-1" />
          <button
            onClick={() => setConnectMenu(false)}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-50 active:scale-[0.97] cursor-pointer"
          >
            ← Volver
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(FolderNode);
