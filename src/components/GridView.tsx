import { useCallback, useState, useRef, useEffect } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useNavigationStore } from '../stores/navigationStore';
import { usePreviewStore } from '../stores/previewStore';
import { getFileTypeIcon, getFileTypeLabel } from '../types/mime';
import { FILE_ICONS } from '../utils/icons';
import { downloadFile } from '../services/download';
import EmptyState from './EmptyState';
import type { DriveItem } from '../types/drive';

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

export default function GridView() {
  const allItems = useCanvasStore((s) => s.allItems);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const setSelectedNodeIds = useCanvasStore((s) => s.setSelectedNodeIds);
  const currentFolderId = useNavigationStore((s) => s.currentFolderId);
  const navigateTo = useNavigationStore((s) => s.navigateTo);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: DriveItem } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const items = (() => {
    const folderItems: DriveItem[] = [];
    const fileItems: DriveItem[] = [];

    for (const item of allItems) {
      const isCurrentLevel = currentFolderId
        ? item.parentId === currentFolderId
        : !item.parentId;
      if (!isCurrentLevel) continue;
      if (item.isFolder) {
        folderItems.push(item);
      } else {
        fileItems.push(item);
      }
    }

    folderItems.sort((a, b) => a.name.localeCompare(b.name));
    fileItems.sort((a, b) => a.name.localeCompare(b.name));
    return [...folderItems, ...fileItems];
  })();

  const openPreview = useCallback((item: DriveItem) => {
    if (item.isFolder) return;
    const fileItems = allItems.filter((i) => !i.isFolder);
    usePreviewStore.getState().open(item, fileItems);
  }, [allItems]);

  const handleClick = useCallback((item: DriveItem) => {
    setSelectedNodeIds([item.id]);
  }, [setSelectedNodeIds]);

  const handleDoubleClick = useCallback((item: DriveItem) => {
    if (item.isFolder) {
      navigateTo(item.id, item.name);
    } else {
      openPreview(item);
    }
  }, [navigateTo, openPreview]);

  const handleContextMenu = useCallback((e: React.MouseEvent, item: DriveItem) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
    setSelectedNodeIds([item.id]);
  }, [setSelectedNodeIds]);

  const closeCtx = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) closeCtx();
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

  const handleOpenInDrive = useCallback((item: DriveItem) => {
    if (item.webViewLink && item.webViewLink !== '#') window.open(item.webViewLink, '_blank');
    closeCtx();
  }, [closeCtx]);

  const handleDownload = useCallback((item: DriveItem) => {
    downloadFile(item);
    closeCtx();
  }, [closeCtx]);

  const handleCopyName = useCallback((item: DriveItem) => {
    navigator.clipboard.writeText(item.name).catch(() => {});
    closeCtx();
  }, [closeCtx]);

  const setPendingTrash = useCanvasStore((s) => s.setPendingTrash);
  const handleTrash = useCallback((item: DriveItem) => {
    setPendingTrash([item.id]);
    closeCtx();
  }, [setPendingTrash, closeCtx]);

  if (items.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <EmptyState
          icon="folder-open"
          title="No hay archivos en esta carpeta"
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
    <div className="w-full h-full overflow-auto p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {items.map((item) => {
          const isSelected = selectedNodeIds.includes(item.id);
          const iconKey = getFileTypeIcon(item.mimeType);
          const svgHtml = FILE_ICONS[iconKey] ?? FILE_ICONS.file;

          return (
            <div
              key={item.id}
              onClick={() => handleClick(item)}
              onDoubleClick={() => handleDoubleClick(item)}
              onContextMenu={(e) => handleContextMenu(e, item)}
              className={`bg-white border rounded-2xl shadow-sm motion-safe:transition-all select-none p-3 cursor-pointer active:scale-[0.97] ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-gray-200 hover:border-gray-300 hover:-translate-y-0.5 hover:shadow-md'
              }`}
            >
              <div className="w-full aspect-[16/10] rounded-lg bg-gray-50 flex items-center justify-center mb-2">
                <span
                  className={item.isFolder ? 'text-amber-500' : 'text-gray-400'}
                  dangerouslySetInnerHTML={{ __html: svgHtml }}
                />
              </div>
              <p className="font-display font-bold text-sm text-gray-900 leading-tight truncate" title={item.name}>
                {item.name}
              </p>
              <p className="font-body text-xs text-gray-500 truncate mt-1">
                {getFileTypeLabel(item.mimeType)}
                {item.size ? ` · ${formatSize(item.size)}` : ''}
              </p>
            </div>
          );
        })}
      </div>

      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 motion-safe:animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={() => handleOpenInDrive(ctxMenu.item)}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
              <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
            </svg>
            Abrir en Google Drive
          </button>
          <button
            onClick={() => handleDownload(ctxMenu.item)}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Descargar
          </button>
          <button
            onClick={() => handleCopyName(ctxMenu.item)}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-gray-400">
              <path fillRule="evenodd" d="M13.324 3.517a2.517 2.517 0 012.66-.51l.996.38a2.517 2.517 0 011.523 2.264v7.698a2.517 2.517 0 01-1.523 2.264l-.996.38a2.517 2.517 0 01-2.66-.51l-4.39-4.39a2.517 2.517 0 010-3.562l4.39-4.39z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M2.75 3A.75.75 0 003 2.25H6.5a.75.75 0 010 1.5H3.75v6h3a.75.75 0 010 1.5h-3A1.5 1.5 0 012.25 9.75v-6A1.5 1.5 0 013.75 2.25z" clipRule="evenodd" />
            </svg>
            Copiar nombre
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => handleTrash(ctxMenu.item)}
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="shrink-0 text-red-400">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
            Mover a papelera
          </button>
        </div>
      )}
    </div>
  );
}
