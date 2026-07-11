import { useCallback, useRef, useState } from 'react';
import { useTabStore } from '../stores/tabStore';
import { useGooglePicker } from '../hooks/useGooglePicker';

/* ------------------------------------------------------------------ */
/*  Heroicons v2 solid 20×20 — inline SVGs                            */
/* ------------------------------------------------------------------ */

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z"/></svg>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>`;

const PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const switchTab = useTabStore((s) => s.switchTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const reorderTabs = useTabStore((s) => s.reorderTabs);
  const addTab = useTabStore((s) => s.addTab);
  const isRootTab = (tabId: string) =>
    tabId === 'root' || tabs.find((t) => t.tabId === tabId)?.folderId === 'root';

  const [showNewMenu, setShowNewMenu] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleFolderSelected = useCallback(
    (folderId: string, folderName: string) => {
      addTab(folderId, folderName);
      setShowNewMenu(false);
    },
    [addTab],
  );

  const { showPicker, error: pickerError } = useGooglePicker(handleFolderSelected);

  const handleNewTab = useCallback(() => {
    if (tabs.length <= 1) {
      // Show dropdown menu
      setShowNewMenu((prev) => !prev);
    } else {
      // Open Google Picker directly
      showPicker();
    }
  }, [tabs.length, showPicker]);

  const handleMenuOpenFolder = useCallback(() => {
    setShowNewMenu(false);
    showPicker();
  }, [showPicker]);

  const handleClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeTab(tabId);
    },
    [closeTab],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      setDragIdx(idx);
      e.dataTransfer.effectAllowed = 'move';
      // Required for Firefox
      e.dataTransfer.setData('text/plain', String(idx));
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIdx: number) => {
      e.preventDefault();
      if (dragIdx !== null && dragIdx !== toIdx) {
        reorderTabs(dragIdx, toIdx);
      }
      setDragIdx(null);
    },
    [dragIdx, reorderTabs],
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
  }, []);

  return (
    <div className="flex items-end w-full bg-gray-100 border-b border-gray-200 select-none">
      {/* Tab list — horizontally scrollable */}
      <div
        className="flex items-end overflow-x-auto scrollbar-none flex-1 gap-0 px-2 pt-1"
        role="tablist"
        aria-label="Pestañas"
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.tabId === activeTabId;
          const canClose = !isRootTab(tab.tabId) && tabs.length > 1;

          return (
            <div
              key={tab.tabId}
              role="tab"
              aria-selected={isActive}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => switchTab(tab.tabId)}
              className={[
                'group flex items-center gap-1.5 min-w-0 max-w-[200px] h-9 px-3',
                'rounded-t-lg cursor-pointer motion-safe:transition-[background-color,color,box-shadow]',
                'motion-reduce:transition-none',
                isActive
                  ? 'bg-white text-gray-900 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                dragIdx === idx ? 'opacity-50' : '',
              ].join(' ')}
              style={
                isActive
                  ? { borderBottom: '2px solid #1E40AF' }
                  : undefined
              }
            >
              {/* Folder icon */}
              <span
                className="shrink-0 text-blue-500"
                dangerouslySetInnerHTML={{ __html: FOLDER_ICON }}
              />

              {/* Tab title */}
              <span className="font-body text-xs truncate min-w-0 leading-tight font-medium">
                {tab.title}
              </span>

              {/* Close button — visible on hover, not for root */}
              {canClose && (
                <button
                  onClick={(e) => handleClose(e, tab.tabId)}
                  className={[
                    'shrink-0 p-0.5 rounded motion-safe:transition-[opacity,transform]',
                    'motion-reduce:transition-none',
                    'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                    'text-gray-400 hover:text-gray-700 hover:bg-gray-200',
                    'active:scale-[0.97]',
                    isActive ? 'text-gray-500' : '',
                  ].join(' ')}
                  title="Cerrar pestaña"
                  aria-label={`Cerrar ${tab.title}`}
                >
                  <span dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* New tab [+] button */}
      <div className="relative flex items-center pr-2 pb-0.5">
        <button
          onClick={handleNewTab}
          className={[
            'flex items-center justify-center w-7 h-7 rounded-md',
            'text-gray-500 hover:text-gray-700 hover:bg-gray-200',
            'motion-safe:transition-[color,background-color,transform]',
            'motion-reduce:transition-none',
            'active:scale-[0.97] cursor-pointer',
          ].join(' ')}
          title="Nueva pestaña"
          aria-label="Nueva pestaña"
          aria-haspopup={tabs.length <= 1 ? 'menu' : undefined}
          aria-expanded={tabs.length <= 1 ? showNewMenu : undefined}
        >
          <span dangerouslySetInnerHTML={{ __html: PLUS_ICON }} />
        </button>

        {/* Dropdown menu for [+] when only root tab */}
        {showNewMenu && tabs.length <= 1 && (
          <>
            {/* Backdrop to close menu */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowNewMenu(false)}
            />
            <div
              ref={menuRef}
              className="absolute top-full right-0 mt-1 z-20 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 motion-safe:animate-fade-in"
              role="menu"
            >
              <button
                onClick={handleMenuOpenFolder}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer text-left motion-safe:transition-colors"
                role="menuitem"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width={16}
                  height={16}
                  className="shrink-0 text-blue-500"
                >
                  <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
                </svg>
                Abrir carpeta...
              </button>
            </div>
          </>
        )}

        {/* Error toast for picker errors */}
        {pickerError && (
          <div className="absolute top-full right-0 mt-2 z-30 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 shadow-md max-w-[250px]">
            {pickerError}
          </div>
        )}
      </div>
    </div>
  );
}
