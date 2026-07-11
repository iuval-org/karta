import { useCallback, useRef, useEffect } from 'react';
import { useNavigationStore } from '../stores/navigationStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useTabStore } from '../stores/tabStore';
import { useRootStore } from '../stores/rootStore';
// React Flow types - no unused imports needed here

/* ------------------------------------------------------------------ */
/*  Heroicons v2 solid 20×20 — inline SVGs                            */
/* ------------------------------------------------------------------ */

const BACK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Breadcrumb() {
  const history = useNavigationStore((s) => s.history);
  const currentFolderId = useNavigationStore((s) => s.currentFolderId);
  const currentFolderName = useNavigationStore((s) => s.currentFolderName);
  const canGoBack = useNavigationStore((s) => s.canGoBack);
  const goBack = useNavigationStore((s) => s.goBack);
  const goBackTo = useNavigationStore((s) => s.goBackTo);
  const resetToRoot = useNavigationStore((s) => s.resetToRoot);
  const rootFolderName = useRootStore((s) => s.rootFolderName);

  const loadItems = useCanvasStore((s) => s.loadItems);
  const setCurrentFolderId = useCanvasStore((s) => s.setCurrentFolderId);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Build path segments: always start with root
  interface Segment {
    folderId: string;
    folderName: string;
    isCurrent: boolean;
  }

  const segments: Segment[] = [
    {
      folderId: '',
      folderName: rootFolderName || 'Karta',
      isCurrent: !currentFolderId,
    },
    ...history.map((entry) => ({
      folderId: entry.folderId,
      folderName: entry.folderName,
      isCurrent: false,
    })),
    ...(currentFolderId
      ? [
          {
            folderId: currentFolderId,
            folderName: currentFolderName,
            isCurrent: true,
          },
        ]
      : []),
  ];

  const handleSegmentClick = useCallback(
    (folderId: string) => {
      if (!folderId) {
        // Root — reset navigation
        resetToRoot();
        setCurrentFolderId('');
        // Determine root folder ID from tabs or rootStore
        const activeTab = useTabStore.getState().getActiveTab();
        const rootId = useRootStore.getState().rootFolderId ?? 'root';
        const tabFolderId =
          activeTab?.folderId === 'root' ? rootId : activeTab?.folderId ?? rootId;
        loadItems(tabFolderId);
      } else if (folderId === currentFolderId) {
        // Already on this folder — no-op
        return;
      } else {
        // Navigate back to this folder in history
        goBackTo(folderId);
        const navState = useNavigationStore.getState();
        setCurrentFolderId(navState.currentFolderId);
        loadItems(folderId);
      }
    },
    [currentFolderId, resetToRoot, setCurrentFolderId, loadItems, goBackTo],
  );

  const handleBack = useCallback(() => {
    if (!canGoBack()) return;
    goBack();
    const navState = useNavigationStore.getState();
    setCurrentFolderId(navState.currentFolderId);
    loadItems(navState.currentFolderId || 'root');
  }, [canGoBack, goBack, setCurrentFolderId, loadItems]);

  // Scroll to end when segment count changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [segments.length]);

  const hasBack = canGoBack();

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      {/* Back button */}
      <button
        onClick={handleBack}
        disabled={!hasBack}
        className={[
          'flex items-center justify-center w-7 h-7 rounded-md motion-safe:transition-[color,background-color]',
          hasBack
            ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer active:scale-[0.97]'
            : 'text-gray-300 cursor-default',
        ].join(' ')}
        title="Volver (Alt+←)"
        aria-label="Volver"
      >
        <span dangerouslySetInnerHTML={{ __html: BACK_ICON }} />
      </button>

      <span className="w-px h-4 bg-gray-200 select-none" aria-hidden="true" />

      {/* Breadcrumb path — scrollable with fade edges */}
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Left fade */}
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        {/* Right fade */}
        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

        <div
          ref={scrollRef}
          className="flex items-center gap-0.5 overflow-x-auto scroll-smooth no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {segments.map((seg, idx) => (
            <div key={`${seg.folderId}-${idx}`} className="flex items-center gap-0.5 shrink-0">
              {/* Separator */}
              {idx > 0 && (
                <span className="text-gray-300 select-none text-sm font-body mx-0.5">›</span>
              )}

              {/* Segment button */}
              <button
                onClick={() => handleSegmentClick(seg.folderId)}
                disabled={seg.isCurrent}
                className={[
                  'px-1.5 py-0.5 rounded text-sm font-display truncate max-w-[140px] motion-safe:transition-[color,background-color]',
                  seg.isCurrent
                    ? 'font-bold text-gray-900 cursor-default'
                    : 'font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer active:scale-[0.97]',
                ].join(' ')}
                title={seg.folderName}
              >
                {seg.folderName}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
