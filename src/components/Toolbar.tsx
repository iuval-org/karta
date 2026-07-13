import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../stores/canvasStore';
import { useSidebarStore } from '../stores/sidebarStore';
import { useSearchStore } from '../stores/searchStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useConnectivityStore } from '../stores/connectivityStore';
import UserMenu from './UserMenu';

/* ------------------------------------------------------------------ */
/*  Heroicons v2 solid 20×20 — inline SVGs                            */
/* ------------------------------------------------------------------ */

const HAMBURGER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd"/></svg>`;

const GRID_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd"/></svg>`;

const FIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5a.75.75 0 001.5 0v-2.5a.75.75 0 01.75-.75h2.5a.75.75 0 000-1.5h-2.5zm10.5 0a.75.75 0 000 1.5h2.5a.75.75 0 01.75.75v2.5a.75.75 0 001.5 0v-2.5A2.25 2.25 0 0015.75 2h-2.5zM3.5 15.75a.75.75 0 00-1.5 0v2.5A2.25 2.25 0 004.25 20h2.5a.75.75 0 000-1.5h-2.5a.75.75 0 01-.75-.75v-2.5zm14.5 0a.75.75 0 00-1.5 0v2.5a.75.75 0 01-.75.75h-2.5a.75.75 0 000 1.5h2.5A2.25 2.25 0 0018 18.25v-2.5z" clipRule="evenodd"/></svg>`;

const HAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10 1a1 1 0 01.993.883L11 2v6.5a.5.5 0 001 0V4.5a1 1 0 112 0v6.914a1.5 1.5 0 01-.44 1.06l-3.293 3.293a1 1 0 01-.707.293H8.5a3.5 3.5 0 01-3.5-3.5V7a1 1 0 012 0v4a.5.5 0 001 0V5a1 1 0 112 0v4.5a.5.5 0 001 0V2a1 1 0 112 0v4.5a.5.5 0 001 0V4.5a1 1 0 112 0v6.914a3 3 0 01-.879 2.12l-3.293 3.293A3 3 0 0111.672 18H8.5A5 5 0 013.5 13V7a1 1 0 012 0v4a.5.5 0 001 0V5a1 1 0 012 0v4.5a.5.5 0 001 0V2a1 1 0 012 0v4.5a.5.5 0 001 0V4.5a1 1 0 112 0v6.914a1.5 1.5 0 01-.44 1.06l-3.293 3.293a1 1 0 01-.707.293H8.5a3.5 3.5 0 01-3.5-3.5V7a1 1 0 012 0v4a.5.5 0 001 0V5a1 1 0 012 0v4.5a.5.5 0 001 0V2a1 1 0 012 0z"/></svg>`;

const SYNC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd"/></svg>`;

const SEARCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ToolbarProps {
  rootFolderName: string;
  onOpenSettings?: () => void;
}

export default function Toolbar({ rootFolderName, onOpenSettings }: ToolbarProps) {
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const resetLayout = useCanvasStore((s) => s.resetLayout);
  const panMode = useCanvasStore((s) => s.panMode);
  const togglePanMode = useCanvasStore((s) => s.togglePanMode);
  const syncFolder = useCanvasStore((s) => s.syncFolder);
  const isSyncing = useCanvasStore((s) => s.isSyncing);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const addStickyNote = useCanvasStore((s) => s.addStickyNote);
  const addTextBox = useCanvasStore((s) => s.addTextBox);
  const addShape = useCanvasStore((s) => s.addShape);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const showBreadcrumb = usePreferencesStore((s) => s.showBreadcrumb);

  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);
  const clearSearch = useSearchStore((s) => s.clearSearch);
  const inputRef = useRef<HTMLInputElement>(null);
  const allItems = useCanvasStore((s) => s.allItems);
  const rootFolderId = allItems[0]?.id ?? 'root';

  /* ── multi-selection counter ───────────────────────────────── */
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const selectionCount = selectedNodeIds.length;
  const showSelectionBadge = selectionCount > 1;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        if (query.trim()) {
          search(query.trim(), rootFolderId);
        }
      } else if (e.key === 'Escape') {
        clearSearch();
        inputRef.current?.blur();
      }
    },
    [query, rootFolderId, search, clearSearch],
  );

  const handleSync = useCallback(() => {
    if (isSyncing || !isOnline) return;
    const rootId = useCanvasStore.getState().currentFolderId || useCanvasStore.getState().allItems[0]?.id || 'root';
    syncFolder(rootId).catch(() => {});
  }, [isSyncing, isOnline, syncFolder]);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-gray-200">
      {/* Left group: toggle + actions */}
      <div className="flex items-center gap-1.5">
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer motion-safe:transition-[color,background-color]"
          title="Alternar barra lateral"
          aria-label="Alternar barra lateral"
        >
          <span dangerouslySetInnerHTML={{ __html: HAMBURGER_ICON }} />
        </button>

        <span className="w-px h-5 bg-gray-200 mx-0.5 select-none" aria-hidden="true" />

        <button
          onClick={resetLayout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer border border-gray-200 motion-safe:transition-[color,background-color]"
          title="Reorganizar nodos en grilla"
        >
          <span
            className="shrink-0 text-gray-500"
            dangerouslySetInnerHTML={{ __html: GRID_ICON }}
          />
          <span className="font-body">Reorganizar</span>
        </button>

        {/* Sticky note button */}
        <button
          onClick={() => {
            const el = document.querySelector('.react-flow__viewport');
            if (el) {
              const rect = el.getBoundingClientRect();
              const position = screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              addStickyNote(position);
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer border border-gray-200 motion-safe:transition-[color,background-color]"
          title="Agregar nota adhesiva"
        >
          <span className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: '#FEF08A', border: '1px solid #EAB308' }} />
          <span className="font-body">Nota</span>
        </button>

        {/* Text box button */}
        <button
          onClick={() => {
            const el = document.querySelector('.react-flow__viewport');
            if (el) {
              const rect = el.getBoundingClientRect();
              const position = screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              addTextBox(position);
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer border border-gray-200 motion-safe:transition-[color,background-color]"
          title="Agregar texto"
        >
          <span className="font-body font-bold text-sm leading-none shrink-0">T</span>
          <span className="font-body">Texto</span>
        </button>

        {/* Shape buttons */}
        <button
          onClick={() => {
            const el = document.querySelector('.react-flow__viewport');
            if (el) {
              const rect = el.getBoundingClientRect();
              const position = screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              addShape(position, 'rectangle');
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer border border-gray-200 motion-safe:transition-[color,background-color]"
          title="Agregar rectángulo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 shrink-0 text-gray-500">
            <rect x="2" y="3" width="16" height="14" rx="2" />
          </svg>
          <span className="font-body">Rect</span>
        </button>

        <button
          onClick={() => {
            const el = document.querySelector('.react-flow__viewport');
            if (el) {
              const rect = el.getBoundingClientRect();
              const position = screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              addShape(position, 'circle');
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer border border-gray-200 motion-safe:transition-[color,background-color]"
          title="Agregar círculo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 shrink-0 text-gray-500">
            <circle cx="10" cy="10" r="8" />
          </svg>
          <span className="font-body">Círculo</span>
        </button>

        <button
          onClick={() => {
            const el = document.querySelector('.react-flow__viewport');
            if (el) {
              const rect = el.getBoundingClientRect();
              const position = screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              addShape(position, 'arrow');
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer border border-gray-200 motion-safe:transition-[color,background-color]"
          title="Agregar flecha"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 shrink-0 text-gray-500">
            <line x1="1" y1="10" x2="15" y2="10" />
            <polyline points="11,5 16,10 11,15" fill="none" />
          </svg>
          <span className="font-body">Flecha</span>
        </button>

        <button
          onClick={() => {
            const el = document.querySelector('.react-flow__viewport');
            if (el) {
              const rect = el.getBoundingClientRect();
              const position = screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              addShape(position, 'line');
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer border border-gray-200 motion-safe:transition-[color,background-color]"
          title="Agregar línea"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 shrink-0 text-gray-500">
            <line x1="2" y1="10" x2="18" y2="10" />
          </svg>
          <span className="font-body">Línea</span>
        </button>

        <button
          onClick={() => fitView({ duration: 200 })}
          className="flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer motion-safe:transition-[color,background-color]"
          title="Ajustar vista"
          aria-label="Ajustar vista"
        >
          <span dangerouslySetInnerHTML={{ __html: FIT_ICON }} />
        </button>

        {/* Pan mode toggle */}
        <button
          onClick={togglePanMode}
          className={`flex items-center justify-center w-8 h-8 rounded-md cursor-pointer motion-safe:transition-[color,background-color] active:scale-[0.97] ${
            panMode
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          title={panMode ? 'Modo selección (S)' : 'Modo mover (M)'}
          aria-label={panMode ? 'Modo selección' : 'Modo mover'}
        >
          <span dangerouslySetInnerHTML={{ __html: HAND_ICON }} />
        </button>

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={isSyncing || !isOnline}
          className={`flex items-center justify-center w-8 h-8 rounded-md cursor-pointer motion-safe:transition-[color,background-color] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed ${
            isSyncing
              ? 'bg-indigo-600 text-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          title={isSyncing ? 'Sincronizando...' : 'Sincronizar con Google Drive'}
          aria-label="Sincronizar con Google Drive"
        >
          <span className={isSyncing ? 'animate-spin' : ''} dangerouslySetInnerHTML={{ __html: SYNC_ICON }} />
        </button>
      </div>

      {/* Center: breadcrumb */}
      {showBreadcrumb && (
        <div className="flex items-center gap-1.5 min-w-0 px-2">
          <span className="text-xs font-body text-gray-700 font-medium truncate">
            {rootFolderName || 'Karta'}
          </span>
        </div>
      )}

      {/* Selection badge */}
      {showSelectionBadge && (
        <button
          onClick={clearSelection}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-xs font-medium motion-safe:transition-all hover:bg-indigo-700 active:scale-[0.97] cursor-pointer"
          title="Limpiar selección"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
          </svg>
          {selectionCount} seleccionados
        </button>
      )}

      {/* Right group: search + user menu */}
      <div className="flex items-center gap-2">
        {/* Search bar */}
        <div className="relative hidden sm:block">
          <span
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            dangerouslySetInnerHTML={{ __html: SEARCH_ICON }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar archivos..."
            value={query}
            onChange={(e) => {
              const q = e.target.value;
              setQuery(q);
            }}
            onKeyDown={handleKeyDown}
            className="w-48 pl-8 pr-3 py-1.5 text-xs font-body text-gray-700 bg-gray-50 border border-gray-200 rounded-md placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 motion-safe:transition-shadow"
            aria-label="Buscar archivos"
          />
        </div>

        <UserMenu onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
