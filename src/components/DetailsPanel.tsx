import { useEffect, useCallback } from 'react';
import { useDetailsStore } from '../stores/detailsStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { getFileTypeLabel } from '../types/mime';

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>`;

const EXTERNAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z"/><path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z"/></svg>`;

const DOWNLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg>`;

const RENAME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z"/><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z"/></svg>`;

const TRASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd"/></svg>`;

const FILE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="40" height="40"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>`;

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="40" height="40"><path d="M3.75 3A1.75 1.75 0 002 4.75v2.5h6.086a1 1 0 01.707.293l.914.914a3 3 0 002.12.879H18V7.75A1.75 1.75 0 0016.25 6h-4.836a.25.25 0 01-.177-.073L9.56 4.268A1.75 1.75 0 008.336 4H3.75z"/><path d="M18 10.5h-6.172a1 1 0 01-.707-.293l-.914-.914A3 3 0 008.172 8.5H2v6.75A1.75 1.75 0 003.75 17h12.5A1.75 1.75 0 0018 15.25V10.5z"/></svg>`;

export default function DetailsPanel() {
  const isOpen = useDetailsStore((s) => s.isOpen);
  const close = useDetailsStore((s) => s.close);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const nodes = useCanvasStore((s) => s.nodes);
  const allItems = useCanvasStore((s) => s.allItems);

  const selectedId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const driveItem = selectedNode?.data?.driveItem ?? null;

  const parentFolder = driveItem?.parentId
    ? allItems.find((i) => i.id === driveItem.parentId)
    : null;

  const mimeLabel = driveItem ? getFileTypeLabel(driveItem.mimeType) : '';
  const showPreview = driveItem && driveItem.mimeType.startsWith('image/');

  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    },
    [close],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const openInDrive = useCallback(() => {
    if (driveItem?.webViewLink && driveItem.webViewLink !== '#') {
      window.open(driveItem.webViewLink, '_blank');
    }
  }, [driveItem]);

  const handleDownload = useCallback(() => {
    if (driveItem?.webContentLink && driveItem.webContentLink !== '#') {
      window.open(driveItem.webContentLink, '_blank');
    }
  }, [driveItem]);

  const handleRename = useCallback(() => {
    if (selectedId) {
      useShortcutStore.getState().triggerRenameNode(selectedId);
    }
  }, [selectedId]);

  const handleTrash = useCallback(() => {
    if (selectedId) {
      useCanvasStore.getState().setPendingTrash([selectedId]);
    }
  }, [selectedId]);

  if (!isOpen || !driveItem) return null;

  return (
    <div
      className="fixed right-0 top-0 h-full w-72 bg-white border-l border-[#E5E7EB] z-40 shadow-sm flex flex-col motion-safe:transition-transform motion-safe:duration-200"
      style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#E5E7EB] shrink-0">
        <h3 className="text-sm font-semibold text-[#1F2937] truncate pr-2">
          {driveItem.name}
        </h3>
        <button
          onClick={close}
          className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg motion-safe:transition-[color,background-color] active:scale-[0.97] cursor-pointer shrink-0"
          aria-label="Cerrar panel"
        >
          <span dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Preview ── */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-center w-full h-28 bg-[#F7F9FA] rounded-xl">
            {showPreview && driveItem.thumbnailLink ? (
              <img
                src={driveItem.thumbnailLink.replace(/=s\d+/, '=s200')}
                alt={driveItem.name}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <span
                className="text-gray-300"
                dangerouslySetInnerHTML={{
                  __html: driveItem.isFolder ? FOLDER_ICON : FILE_ICON,
                }}
              />
            )}
          </div>
        </div>

        {/* ── Info section ── */}
        <div className="px-4 pb-3">
          <h4 className="text-xs uppercase tracking-wider text-[#6B7280] font-semibold mb-2">
            Información
          </h4>
          <div className="space-y-1.5">
            <InfoRow label="Tipo" value={mimeLabel} />
            {driveItem.size && (
              <InfoRow label="Tamaño" value={formatSize(driveItem.size)} />
            )}
            <InfoRow label="Modificado" value={formatDate(driveItem.modifiedTime)} />
            <InfoRow
              label="Ubicación"
              value={parentFolder ? parentFolder.name : 'Raíz'}
            />
          </div>
        </div>

        <hr className="mx-4 border-gray-100" />

        {/* ── Actions section ── */}
        <div className="px-4 py-3">
          <h4 className="text-xs uppercase tracking-wider text-[#6B7280] font-semibold mb-2">
            Acciones
          </h4>
          <div className="space-y-1">
            <ActionButton
              label="Abrir en Drive"
              icon={EXTERNAL_ICON}
              onClick={openInDrive}
            />
            {!driveItem.isFolder && (
              <ActionButton
                label="Descargar"
                icon={DOWNLOAD_ICON}
                onClick={handleDownload}
              />
            )}
            <ActionButton
              label="Renombrar"
              icon={RENAME_ICON}
              onClick={handleRename}
            />
            <ActionButton
              label="Mover a papelera"
              icon={TRASH_ICON}
              onClick={handleTrash}
              danger
            />
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-[#E5E7EB] px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="shrink-0 text-gray-400"
            dangerouslySetInnerHTML={{
              __html: driveItem.isFolder ? FOLDER_ICON : FILE_ICON,
            }}
          />
          <div className="min-w-0">
            <p className="text-sm text-[#1F2937] truncate">{driveItem.name}</p>
            <p className="text-xs text-[#6B7280]">
              {driveItem.size ? formatSize(driveItem.size) : ''}
              {driveItem.size && mimeLabel ? ' · ' : ''}
              {mimeLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-[#6B7280] shrink-0">{label}</span>
      <span className="text-sm text-[#1F2937] text-right truncate">{value}</span>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-lg motion-safe:transition-[color,background-color] active:scale-[0.97] cursor-pointer ${
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-[#1F2937] hover:bg-gray-100'
      }`}
    >
      <span
        className={`shrink-0 ${danger ? 'text-red-400' : 'text-gray-400'}`}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      {label}
    </button>
  );
}
