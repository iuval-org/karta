import { useCallback, useMemo, useRef, useState } from 'react';
import { useSidebarStore } from '../stores/sidebarStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useNavigationStore } from '../stores/navigationStore';
import { useSearchStore } from '../stores/searchStore';
import type { SearchResult } from '../stores/searchStore';
import { debounce } from '../utils/debounce';
import { getFileTypeIcon } from '../types/mime';
import { CREATE_MIME_TYPES } from '../services/drive';

/* ------------------------------------------------------------------ */
/*  Heroicons v2 solid 20×20 — inline SVGs                            */
/* ------------------------------------------------------------------ */

const SEARCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/></svg>`;

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z"/></svg>`;

const PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>`;

const GRID_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd"/></svg>`;

const FOLDER_OPEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M4.75 3A1.75 1.75 0 003 4.75v2.752l.104-.002h13.792c.035 0 .07 0 .104.002V6.75A1.75 1.75 0 0015.25 5h-3.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H4.75zM3.104 9a1.75 1.75 0 00-1.673 2.265l1.385 4.5A1.75 1.75 0 004.488 17h11.023a1.75 1.75 0 001.673-1.235l1.384-4.5A1.75 1.75 0 0016.896 9H3.104z"/></svg>`;

const DOCUMENT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l4.122 4.12A1.5 1.5 0 0117 7.622V16.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-13z"/></svg>`;

/* ── drag item helpers ──────────────────────────────────────────── */

interface DragItem {
  label: string;
  mimeType: string;
  icon: string;
  color: string;
}

const DRAG_ITEMS: DragItem[] = [
  {
    label: 'Carpeta',
    mimeType: CREATE_MIME_TYPES.folder,
    color: 'text-amber-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z"/></svg>`,
  },
  {
    label: 'Documento',
    mimeType: CREATE_MIME_TYPES.document,
    color: 'text-blue-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.414A1.5 1.5 0 0016.328 6.2l-4.124-4.124A1.5 1.5 0 0011.172 2H4.5zm4.75 4.5a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm0 3a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zm0 3a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" clipRule="evenodd"/></svg>`,
  },
  {
    label: 'Planilla',
    mimeType: CREATE_MIME_TYPES.spreadsheet,
    color: 'text-green-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M3 3.5A1.5 1.5 0 014.5 2h11A1.5 1.5 0 0117 3.5v13A1.5 1.5 0 0115.5 18h-11A1.5 1.5 0 013 16.5v-13zM5 5a1 1 0 011-1h8a1 1 0 011 1v2a1 1 0 01-1 1H6a1 1 0 01-1-1V5zm0 5a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H6a1 1 0 01-1-1v-5z" clipRule="evenodd"/></svg>`,
  },
  {
    label: 'Slides',
    mimeType: CREATE_MIME_TYPES.presentation,
    color: 'text-orange-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M2 3.75A.75.75 0 012.75 3h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd"/></svg>`,
  },
  {
    label: 'Nota adhesiva',
    mimeType: 'application/x-karta-sticky-note',
    color: 'text-yellow-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><rect x="3" y="3" width="14" height="14" rx="2" fill="#FEF08A" stroke="#EAB308" strokeWidth="1"/><path d="M3 8h14M8 3v14" stroke="#EAB308" strokeWidth="0.5" fill="none"/></svg>`,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SidebarProps {
  rootFolderName?: string;
  onNewTab?: () => void;
  onReorganize?: () => void;
  onChangeRoot?: () => void;
  onOpenSettings?: () => void;
}

export default function Sidebar({
  rootFolderName = '',
  onNewTab,
  onReorganize,
  onChangeRoot,
  onOpenSettings,
}: SidebarProps) {
  const isOpen = useSidebarStore((s) => s.isOpen);

  const nodes = useCanvasStore((s) => s.nodes);
  const allItems = useCanvasStore((s) => s.allItems);

  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const isSearching = useSearchStore((s) => s.isSearching);
  const isLocalSearch = useSearchStore((s) => s.isLocalSearch);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);
  const clearSearch = useSearchStore((s) => s.clearSearch);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootFolderId = useCanvasStore((s) => s.allItems[0]?.id ?? 'root');

  const hasActiveSearch = query.trim().length > 0;

  const fileCount = useMemo(
    () => nodes.filter((n) => n.type === 'fileNode').length,
    [nodes],
  );
  const folderCount = useMemo(() => {
    // Count unique folders that have children in allItems
    const parentIds = new Set(allItems.filter((i) => i.parentId).map((i) => i.parentId));
    return parentIds.size;
  }, [allItems]);

  const usagePercent = useMemo(() => {
    if (allItems.length === 0) return 0;
    return Math.min(Math.round((nodes.length / Math.max(allItems.length, 1)) * 100), 100);
  }, [allItems, nodes]);

  /* ── Folder tree state ─────────────────────────────────────── */
  const [expandedTreeFolders, setExpandedTreeFolders] = useState<Set<string>>(new Set());

  const navigateToFolder = useNavigationStore((s) => s.navigateTo);
  const navCurrentFolderId = useNavigationStore((s) => s.currentFolderId);
  const currentFolderIdCanvas = useCanvasStore((s) => s.currentFolderId);
  const loadItems = useCanvasStore((s) => s.loadItems);
  const setCurrentFolderId = useCanvasStore((s) => s.setCurrentFolderId);

  /** Build tree: all folders, organized by parentId */
  const folderTree = useMemo(() => {
    const folders = allItems.filter((i) => i.isFolder);
    const rootFolderId = allItems[0]?.id ?? 'root';

    const childrenOf = new Map<string, typeof folders>();
    for (const f of folders) {
      const parent = f.parentId || rootFolderId;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(f);
    }
    // Sort by name
    for (const [, kids] of childrenOf) {
      kids.sort((a, b) => a.name.localeCompare(b.name));
    }

    return { childrenOf, rootFolderId };
  }, [allItems]);

  const toggleTreeFolder = useCallback((folderId: string) => {
    setExpandedTreeFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleNavigateToFolder = useCallback(
    (folderId: string, folderName: string) => {
      // Navigate via navigation store
      navigateToFolder(folderId, folderName);
      setCurrentFolderId(folderId);
      loadItems(folderId);
    },
    [navigateToFolder, setCurrentFolderId, loadItems],
  );

  /** Recursively render folder tree nodes */
  const renderTreeNodes = useCallback(
    (parentId: string, depth: number): React.ReactNode[] => {
      const { childrenOf } = folderTree;
      const kids = childrenOf.get(parentId);
      if (!kids || kids.length === 0) return [];

      return kids.flatMap((folder) => {
        const hasChildren = childrenOf.has(folder.id);
        const isExpanded = expandedTreeFolders.has(folder.id);
        const isCurrent = folder.id === currentFolderIdCanvas || folder.id === navCurrentFolderId;

        return [
          <div
            key={folder.id}
            className={[
              'flex items-center gap-1 w-full pl-2 py-1 text-xs rounded-md motion-safe:transition-colors',
              'cursor-pointer select-none',
              isCurrent
                ? 'bg-blue-100 text-blue-800 font-semibold'
                : 'text-gray-700 hover:bg-gray-100',
            ].join(' ')}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => handleNavigateToFolder(folder.id, folder.name)}
            title={folder.name}
          >
            {/* Expand/collapse arrow */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTreeFolder(folder.id);
                }}
                className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded"
                aria-label={isExpanded ? 'Colapsar' : 'Expandir'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="12"
                  height="12"
                  className={`motion-safe:transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                >
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            ) : (
              <span className="shrink-0 w-4" />
            )}

            {/* Folder icon */}
            <span
              className={`shrink-0 ${isCurrent ? 'text-blue-600' : 'text-amber-500'}`}
              dangerouslySetInnerHTML={{
                __html: isExpanded ? FOLDER_OPEN_ICON : FOLDER_ICON,
              }}
            />

            {/* Folder name */}
            <span className="truncate flex-1">{folder.name}</span>
          </div>,
          ...(isExpanded ? renderTreeNodes(folder.id, depth + 1) : []),
        ];
      });
    },
    [
      folderTree,
      expandedTreeFolders,
      currentFolderIdCanvas,
      navCurrentFolderId,
      handleNavigateToFolder,
      toggleTreeFolder,
    ],
  );

  /* ── debounced local search ──────────────────────────────── */
  const debouncedSearchRef = useRef(
    debounce((q: string) => {
      if (q.trim()) {
        useSearchStore.getState().search(q, rootFolderId);
      }
    }, 300),
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setQuery(q);
      if (q.trim()) {
        debouncedSearchRef.current(q);
      } else {
        clearSearch();
      }
    },
    [setQuery, clearSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        // Execute full search immediately
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

  const handleKeyDownAction = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onReorganize?.();
      }
    },
    [onReorganize],
  );

  /* ── render MIME icon helper ─────────────────────────────── */
  const mimeIconHtml = useCallback(
    (result: SearchResult) => {
      const cat = getFileTypeIcon(result.mimeType);
      const map: Record<string, string> = {
        folder: FOLDER_OPEN_ICON,
        document: DOCUMENT_ICON,
        sheet: DOCUMENT_ICON,
        pdf: DOCUMENT_ICON,
        image: DOCUMENT_ICON,
      };
      return map[cat] ?? DOCUMENT_ICON;
    },
    [],
  );

  /* ── highlight match in name ─────────────────────────────── */
  const highlightedName = useCallback(
    (result: SearchResult) => {
      const { name, matchStart, matchEnd } = result;
      if (matchStart === undefined || matchEnd === undefined) {
        return <span>{name}</span>;
      }
      return (
        <>
          <span>{name.slice(0, matchStart)}</span>
          <span className="bg-blue-100 text-blue-800 rounded px-0.5 font-medium">
            {name.slice(matchStart, matchEnd)}
          </span>
          <span>{name.slice(matchEnd)}</span>
        </>
      );
    },
    [],
  );

  return (
    <aside
      className={[
        'flex flex-col bg-gray-50 border-r border-gray-200 overflow-hidden',
        'motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-in-out',
        'motion-reduce:transition-none',
        isOpen ? 'w-60 min-w-[240px]' : 'w-0 min-w-0',
      ].join(' ')}
      aria-label="Barra lateral"
      aria-hidden={!isOpen}
    >
      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* ── Search ──────────────────────────────────────── */}
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <span
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                dangerouslySetInnerHTML={{ __html: SEARCH_ICON }}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar archivos..."
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="w-full pl-8 pr-8 py-1.5 text-xs font-body text-gray-700 bg-white border border-gray-200 rounded-md placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 motion-safe:transition-shadow"
                aria-label="Buscar archivos"
              />
              {query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 active:scale-[0.97]"
                  aria-label="Limpiar búsqueda"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {hasActiveSearch ? (
            /* ═══════════════════════════════════════════════════ */
            /*  SEARCH RESULTS                                     */
            /* ═══════════════════════════════════════════════════ */
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div
                    className="text-gray-300 mb-2"
                    dangerouslySetInnerHTML={{ __html: SEARCH_ICON }}
                  />
                  <p className="text-xs text-gray-500">No se encontraron archivos</p>
                  {isLocalSearch && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Presiona Enter para buscar en Drive
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">
                    Resultados ({results.length})
                    {!isLocalSearch && results.length > 0 && (
                      <span className="font-normal normal-case text-gray-400 ml-1">
                        (Drive)
                      </span>
                    )}
                  </p>
                  <div className="space-y-0.5">
                    {results.map((result) => (
                      <div
                        key={result.id}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-md motion-safe:transition-colors active:scale-[0.97"
                      >
                        <span
                          className="shrink-0 text-gray-400"
                          dangerouslySetInnerHTML={{ __html: mimeIconHtml(result) }}
                        />
                        <span className="truncate flex-1">
                          {highlightedName(result)}
                        </span>
                        {!result.inCanvas && (
                          <button
                            onClick={() => {
                              // Placeholder for "Agregar al canvas" — logs for now
                              console.log('Agregar al canvas:', result.name);
                            }}
                            className="shrink-0 text-[10px] text-blue-600 hover:text-blue-800 hover:underline active:scale-[0.97]"
                            title="Agregar al canvas"
                          >
                            + Canvas
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ═══════════════════════════════════════════════════ */
            /*  NORMAL SIDEBAR CONTENT                             */
            /* ═══════════════════════════════════════════════════ */
            <div className="flex-1 overflow-y-auto px-3 space-y-4 pb-4">
              {/* ── Carpetas ──────────────────────────────────── */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">
                  Carpetas
                </h3>
                {/* Root folder */}
                <button
                  onClick={() => {
                    navigateToFolder('', '');
                    setCurrentFolderId('');
                    const rootId = allItems[0]?.id || 'root';
                    loadItems(rootId);
                  }}
                  className={[
                    'flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md motion-safe:transition-colors cursor-pointer text-left',
                    (!navCurrentFolderId && !currentFolderIdCanvas)
                      ? 'bg-blue-100 text-blue-800 font-semibold'
                      : 'text-gray-700 hover:bg-gray-100',
                  ].join(' ')}
                  title="Carpeta raíz"
                >
                  <span
                    className="shrink-0 text-blue-500"
                    dangerouslySetInnerHTML={{ __html: FOLDER_OPEN_ICON }}
                  />
                  <span className="truncate font-body">{rootFolderName || 'Raíz'}</span>
                </button>
                {/* Folder tree (children of root) */}
                {renderTreeNodes(folderTree.rootFolderId, 0)}
              </section>

              {/* ── Acciones ──────────────────────────────────── */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">
                  Acciones
                </h3>
                <div className="space-y-0.5">
                  <button
                    onClick={onNewTab}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer motion-safe:transition-colors text-left"
                  >
                    <span
                      className="shrink-0 text-gray-500"
                      dangerouslySetInnerHTML={{ __html: PLUS_ICON }}
                    />
                    <span className="font-body">Nueva pestaña</span>
                  </button>
                  <button
                    onClick={onReorganize}
                    onKeyDown={handleKeyDownAction}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer motion-safe:transition-colors text-left"
                  >
                    <span
                      className="shrink-0 text-gray-500"
                      dangerouslySetInnerHTML={{ __html: GRID_ICON }}
                    />
                    <span className="font-body">Reorganizar</span>
                  </button>
                  <button
                    onClick={onChangeRoot}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer motion-safe:transition-colors text-left"
                  >
                    <span
                      className="shrink-0 text-gray-500"
                      dangerouslySetInnerHTML={{ __html: FOLDER_ICON }}
                    />
                    <span className="font-body">Cambiar raíz</span>
                  </button>
                </div>
              </section>

              {/* ── Componentes (drag & drop al canvas) ──────────── */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">
                  Componentes
                </h3>
                <div className="space-y-0.5">
                  {DRAG_ITEMS.map((item) => (
                    <div
                      key={item.mimeType}
                      draggable
                      onDragStart={(e) => {
                        if (item.mimeType === 'application/x-karta-sticky-note') {
                          e.dataTransfer.setData('application/x-karta-sticky-note', 'true');
                        } else {
                          e.dataTransfer.setData('application/karta-type', item.mimeType);
                        }
                        e.dataTransfer.effectAllowed = 'copy';

                        // Color de acento por tipo
                        const ACCENT: Record<string, string> = {
                          'application/vnd.google-apps.folder': '#3B82F6',
                          'application/vnd.google-apps.document': '#2563EB',
                          'application/vnd.google-apps.spreadsheet': '#059669',
                          'application/vnd.google-apps.presentation': '#EA580C',
                          'application/x-karta-sticky-note': '#EAB308',
                        };
                        const accentKey = item.mimeType;
                        const accent = ACCENT[accentKey] ?? '#3B82F6';

                        // Preview realista del nodo como se verá en el canvas
                        const ghost = document.createElement('div');
                        ghost.style.cssText = [
                          'position:absolute',
                          'top:-1000px',
                          'left:-1000px',
                          'display:flex',
                          'align-items:center',
                          'gap:8px',
                          'padding:8px 12px',
                          'background:white',
                          'border:1px solid #e5e7eb',
                          `border-left:3px solid ${accent}`,
                          'border-radius:8px',
                          'box-shadow:0 4px 12px rgba(0,0,0,0.1)',
                          'font-family:Nunito,system-ui,sans-serif',
                          'font-size:13px',
                          'font-weight:600',
                          'color:#1f2937',
                          'white-space:nowrap',
                          'pointer-events:none',
                          'line-height:1',
                        ].join(';');

                        ghost.innerHTML = `<span style="display:inline-flex;align-items:center;color:${accent}">${item.icon}</span><span>${item.label}</span>`;
                        document.body.appendChild(ghost);

                        // Centrado bajo el cursor (mitad del ancho y alto)
                        const rect = ghost.getBoundingClientRect();
                        e.dataTransfer.setDragImage(ghost, Math.round(rect.width / 2), Math.round(rect.height / 2));

                        setTimeout(() => document.body.removeChild(ghost), 0);
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-md cursor-grab active:cursor-grabbing motion-safe:transition-colors select-none"
                      title={`Arrastrar al canvas para crear ${item.label}`}
                    >
                      <span
                        className={`shrink-0 ${item.color}`}
                        dangerouslySetInnerHTML={{ __html: item.icon }}
                      />
                      <span className="truncate flex-1 font-body">{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Información ───────────────────────────────── */}
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">
                  Información
                </h3>
                <div className="space-y-1 px-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span
                      className="shrink-0 text-gray-400"
                      dangerouslySetInnerHTML={{ __html: DOCUMENT_ICON }}
                    />
                    <span className="font-body">
                      {fileCount} archivo{fileCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span
                      className="shrink-0 text-gray-400"
                      dangerouslySetInnerHTML={{ __html: FOLDER_ICON }}
                    />
                    <span className="font-body">
                      {folderCount} carpeta{folderCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="text-gray-400">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="font-body">{usagePercent}% usado</span>
                  </div>
                  <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-2 w-full px-0 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-md cursor-pointer motion-safe:transition-colors text-left active:scale-[0.97]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="text-gray-400 shrink-0">
                      <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.25l-1.18 2.045a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.331 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.205-1.25l1.18-2.045a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.456l.331-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    <span className="font-body">Configuración</span>
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
