import {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import type { CanvasNodeData } from '../stores/canvasStore';
import { useCanvasStore } from '../stores/canvasStore';
import { usePreviewStore } from '../stores/previewStore';
import { useCommentStore } from '../stores/commentStore';
import CommentBadge from '../components/CommentBadge';
import { getFileTypeIcon } from '../types/mime';
import { validateFileName } from '../utils/validation';
import { downloadFile } from '../services/download';
import { FILE_ICONS } from '../utils/icons';

const ICONS = FILE_ICONS as Record<string, string>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Remove file extension (the MIME icon already conveys type). */
function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return name.slice(0, dot);
  return name;
}

/** Truncate text past maxLen with ellipsis. */
function truncate(text: string, maxLen = 20): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/** Format a Drive `size` string (bytes) into a human-readable label. */
function formatSize(size?: string): string {
  if (!size) return '';
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const scaled = bytes / Math.pow(1024, i);
  return i === 0 ? `${scaled} B` : `${scaled.toFixed(i === 1 ? 0 : 1)} ${units[i]}`;
}

/** Format ISO date string to a short localised label. */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function FileNode({ id, data, selected }: NodeProps) {
  const item = (data as unknown as CanvasNodeData).driveItem;

  const mimeIcon = getFileTypeIcon(item.mimeType);
  const svgHtml = ICONS[mimeIcon] ?? ICONS.file;

  /* ── store ──────────────────────────────────────────────────── */
  const nodes = useCanvasStore((s) => s.nodes);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const searchHighlightedNodeIds = useCanvasStore((s) => s.searchHighlightedNodeIds);
  const removingNodeIds = useCanvasStore((s) => s.removingNodeIds);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const applyGridLayout = useCanvasStore((s) => s.applyGridLayout);
  const isSearchActive = searchHighlightedNodeIds.length > 0;
  const isSearchMatch = searchHighlightedNodeIds.includes(id);
  const isRemoving = removingNodeIds.includes(id);
  const isMultiSelected = selected && selectedNodeIds.length > 1;

  /* ── comment store ──────────────────────────────────────────── */
  const commentCount = useCommentStore((s) => s.getCommentsForNode(id).length);
  const openThread = useCommentStore((s) => s.openThread);

  /* ── local state ─────────────────────────────────────────────── */
  const [thumbFailed, setThumbFailed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [connectMenu, setConnectMenu] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  /* ── inline rename state ───────────────────────────────────── */
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameNodeItem = useCanvasStore((s) => s.renameNodeItem);

  const hasThumb = !!item.thumbnailLink && !thumbFailed;
  const cleanName = stripExtension(item.name);
  const displayName = truncate(cleanName);

  /* ── event handlers ──────────────────────────────────────────── */

  const openInDrive = useCallback(() => {
    if (item.webViewLink && item.webViewLink !== '#') {
      window.open(item.webViewLink, '_blank');
    }
  }, [item.webViewLink]);

  const openPreview = useCallback(() => {
    const allItems = useCanvasStore.getState().allItems;
    const fileItems = allItems.filter((i) => !i.isFolder);
    usePreviewStore.getState().open(item, fileItems);
  }, [item]);

  /* ── inline rename ──────────────────────────────────────────── */

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
      // renameNodeItem already shows its own toast
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

  /* ── old double-click on name text opens Drive ──────────────── */

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
      setConnectMenu(false);
    },
    [],
  );

  const closeCtx = useCallback(() => {
    setCtxMenu(null);
    setConnectMenu(false);
  }, []);

  const handleCopyName = useCallback(() => {
    navigator.clipboard.writeText(item.name).catch(() => {});
    closeCtx();
  }, [item.name, closeCtx]);

  const handleDownload = useCallback(() => {
    downloadFile(item);
    closeCtx();
  }, [item, closeCtx]);

  const handleOpenDriveFromMenu = useCallback(() => {
    openInDrive();
    closeCtx();
  }, [openInDrive, closeCtx]);

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
    useCanvasStore.getState().bringToFront();
    closeCtx();
  }, [closeCtx]);

  const handleBatchSendToBack = useCallback(() => {
    useCanvasStore.getState().sendToBack();
    closeCtx();
  }, [closeCtx]);

  const handleBatchBringForward = useCallback(() => {
    useCanvasStore.getState().bringForward();
    closeCtx();
  }, [closeCtx]);

  const handleBatchSendBackward = useCallback(() => {
    useCanvasStore.getState().sendBackward();
    closeCtx();
  }, [closeCtx]);

  const handleGroupInFolder = useCallback(() => {
    const name = window.prompt('Nombre de la carpeta:', 'Grupo');
    if (!name || !name.trim()) return;
    const state = useCanvasStore.getState();
    state.groupInFolder(state.selectedNodeIds, name.trim());
    closeCtx();
  }, [closeCtx]);

  const handleBatchDownload = useCallback(() => {
    const state = useCanvasStore.getState();
    const ids = state.selectedNodeIds.filter((sid) => sid !== 'root');
    const allItems = state.allItems;
    for (const sid of ids) {
      const file = allItems.find((i) => i.id === sid);
      if (file) downloadFile(file);
    }
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

  /* ── available connection targets ───────────────────────────── */
  const connectTargets = nodes
    .filter((n) => n.id !== id)
    .map((n) => ({
      id: n.id,
      name: (n.data as unknown as CanvasNodeData).driveItem.name,
    }));

  /* ── class / style composition ───────────────────────────────── */

  const borderClass = selected
    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
    : isSearchActive && isSearchMatch
      ? 'border-[#1E40AF] ring-2 ring-[#1E40AF]/30'
      : 'border-gray-200 motion-safe:hover:border-indigo-500/30 motion-safe:hover:shadow-md motion-safe:hover:-translate-y-0.5';

  const opacityClass =
    isSearchActive && !isSearchMatch ? 'opacity-30' : '';

  const removingClass = isRemoving ? 'animate-fade-out' : '';

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div
      className={`relative w-[180px] bg-white border rounded-xl shadow-sm motion-safe:transition-all select-none ${borderClass} ${opacityClass} ${removingClass}`}
      onDoubleClick={openPreview}
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

      {/* ── left target handle (visible on hover) ── */}
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

      {/* ── body ── */}
      <div className="p-2.5 space-y-1.5">
        {/* thumbnail or MIME icon */}
        <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
          {hasThumb ? (
            <img
              src={item.thumbnailLink}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <div
              className="text-gray-400"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          )}
          {/* preview button — visible on hover */}
          <button
            onClick={(e) => { e.stopPropagation(); openPreview(); }}
            className={`absolute top-1.5 right-1.5 flex items-center justify-center w-7 h-7 bg-white/90 rounded-lg shadow motion-safe:transition-opacity ${
              isHovered ? 'opacity-100' : 'opacity-0'
            } hover:bg-white active:scale-[0.97] cursor-pointer`}
            title="Vista previa"
            aria-label="Vista previa"
          >
            <span
              className="text-gray-600"
              dangerouslySetInnerHTML={{ __html: ICONS.eye }}
            />
          </button>
        </div>

        {/* file name — Nunito 700 — double-click to rename */}
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
            title={cleanName}
            onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}
          >
            {displayName}
          </p>
        )}

        {/* metadata — Inter 400 */}
        <p className="font-body text-xs text-gray-500 truncate">
          {formatSize(item.size)}
          {item.size ? ' · ' : ''}
          {formatDate(item.modifiedTime)}
        </p>
      </div>

      {/* ── source handle (bottom, invisible) ── */}
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className="!opacity-0 !pointer-events-auto"
      />

      {/* ── source handle (right, visible on hover) ── */}
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

      {/* ── comment badge ── */}
      <CommentBadge count={commentCount} onClick={() => openThread(id)} />

      {/* ── context menu ── */}
      {ctxMenu && !connectMenu && !isMultiSelected && createPortal(
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 motion-safe:animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={handleOpenDriveFromMenu}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
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
            onClick={handleDownload}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Descargar
          </button>
          <button
            onClick={handleCopyName}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
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
            onClick={handleTrash}
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 active:scale-[0.97]"
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
            className="w-full px-3 py-1.5 text-left text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 active:scale-[0.97]"
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
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Orden
          </div>
          <button
            onClick={() => {
              useCanvasStore.getState().bringToFront([id]);
              closeCtx();
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M5.23 2a4.23 4.23 0 00-4.23 4.23V13.5A2.5 2.5 0 003.5 16H5v1.25a.75.75 0 001.28.53l3.33-3.33a.75.75 0 000-1.06L6.28 10.1a.75.75 0 00-1.28.53v1.12H3.5a1 1 0 01-1-1V6.23A2.73 2.73 0 015.23 3.5H16.5a1 1 0 011 1v4.27a2.73 2.73 0 01-2.73 2.73H13a.75.75 0 000 1.5h1.77a4.23 4.23 0 004.23-4.23V4.5A2.5 2.5 0 0016.5 2H5.23z" clipRule="evenodd" />
            </svg>
            Traer al frente
          </button>
          <button
            onClick={() => {
              useCanvasStore.getState().sendToBack([id]);
              closeCtx();
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M14.77 18a4.23 4.23 0 004.23-4.23V6.5A2.5 2.5 0 0016.5 4H15V2.75a.75.75 0 00-1.28-.53l-3.33 3.33a.75.75 0 000 1.06l3.33 3.33a.75.75 0 001.28-.53V7.5h1.5a1 1 0 011 1v6.27a2.73 2.73 0 01-2.73 2.73H3.5a1 1 0 01-1-1V10.23A2.73 2.73 0 015.23 7.5H7a.75.75 0 000-1.5H5.23A4.23 4.23 0 001 10.23v5.27A2.5 2.5 0 003.5 18h11.27z" clipRule="evenodd" />
            </svg>
            Enviar atrás
          </button>
          <button
            onClick={() => {
              useCanvasStore.getState().bringForward([id]);
              closeCtx();
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.22-9.22a.75.75 0 00-1.06-1.06l-1.97 1.97V5.75a.75.75 0 00-1.5 0v3.94l-1.97-1.97a.75.75 0 10-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25z" clipRule="evenodd" />
            </svg>
            Traer adelante
          </button>
          <button
            onClick={() => {
              useCanvasStore.getState().sendBackward([id]);
              closeCtx();
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-3.22-8.78a.75.75 0 011.06-1.06l1.97 1.97V5.75a.75.75 0 011.5 0v3.94l1.97-1.97a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L6.78 9.22z" clipRule="evenodd" />
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
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 active:scale-[0.97]"
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
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
            </svg>
            Alinear a grilla
          </button>
          <button
            onClick={handleGroupInFolder}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
            </svg>
            Agrupar en carpeta
          </button>
          <button
            onClick={handleBatchDownload}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Descargar {selectedNodeIds.length} archivos
          </button>
          <div className="border-t border-gray-100 my-1" />
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Orden
          </div>
          <button
            onClick={handleBatchBringToFront}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M5.23 2a4.23 4.23 0 00-4.23 4.23V13.5A2.5 2.5 0 003.5 16H5v1.25a.75.75 0 001.28.53l3.33-3.33a.75.75 0 000-1.06L6.28 10.1a.75.75 0 00-1.28.53v1.12H3.5a1 1 0 01-1-1V6.23A2.73 2.73 0 015.23 3.5H16.5a1 1 0 011 1v4.27a2.73 2.73 0 01-2.73 2.73H13a.75.75 0 000 1.5h1.77a4.23 4.23 0 004.23-4.23V4.5A2.5 2.5 0 0016.5 2H5.23z" clipRule="evenodd" />
            </svg>
            Traer al frente
          </button>
          <button
            onClick={handleBatchSendToBack}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M14.77 18a4.23 4.23 0 004.23-4.23V6.5A2.5 2.5 0 0016.5 4H15V2.75a.75.75 0 00-1.28-.53l-3.33 3.33a.75.75 0 000 1.06l3.33 3.33a.75.75 0 001.28-.53V7.5h1.5a1 1 0 011 1v6.27a2.73 2.73 0 01-2.73 2.73H3.5a1 1 0 01-1-1V10.23A2.73 2.73 0 015.23 7.5H7a.75.75 0 000-1.5H5.23A4.23 4.23 0 001 10.23v5.27A2.5 2.5 0 003.5 18h11.27z" clipRule="evenodd" />
            </svg>
            Enviar atrás
          </button>
          <button
            onClick={handleBatchBringForward}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.22-9.22a.75.75 0 00-1.06-1.06l-1.97 1.97V5.75a.75.75 0 00-1.5 0v3.94l-1.97-1.97a.75.75 0 10-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25z" clipRule="evenodd" />
            </svg>
            Traer adelante
          </button>
          <button
            onClick={handleBatchSendBackward}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-3.22-8.78a.75.75 0 011.06-1.06l1.97 1.97V5.75a.75.75 0 011.5 0v3.94l1.97-1.97a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L6.78 9.22z" clipRule="evenodd" />
            </svg>
            Enviar atrás
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleBatchClearSelection}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97]"
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
                className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-2 active:scale-[0.97] truncate"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="14"
                  height="14"
                  className="shrink-0 text-indigo-400"
                >
                  <path d="M5.75 2A1.75 1.75 0 004 3.75v12.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0016 16.25V3.75A1.75 1.75 0 0014.25 2h-8.5z" />
                </svg>
                <span className="truncate">{target.name}</span>
              </button>
            ))
          )}
          <div className="border-t border-gray-100 mt-1" />
          <button
            onClick={() => setConnectMenu(false)}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-50 active:scale-[0.97]"
          >
            ← Volver
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(FileNode);
