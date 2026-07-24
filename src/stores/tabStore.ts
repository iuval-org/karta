import { create } from 'zustand';
import { db, type StoredTab } from '../services/db';
import { useCanvasStore } from './canvasStore';
import { useRootStore } from './rootStore';

export interface Tab {
  tabId: string;
  title: string;
  folderId: string;
  order: number;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string;
  hydrated: boolean;

  addTab: (folderId: string, title: string) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  reorderTabs: (fromIdx: number, toIdx: number) => void;

  loadTabs: () => Promise<void>;
  persistTabs: () => Promise<void>;

  getActiveTab: () => Tab | undefined;
  getTabById: (tabId: string) => Tab | undefined;
}

let nextIdCounter = Date.now();

function generateTabId(): string {
  nextIdCounter += 1;
  return `tab_${nextIdCounter}`;
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: '',
  hydrated: false,

  /* ── CRUD ──────────────────────────────────────────────────── */

  addTab: (folderId: string, title: string) => {
    const { tabs, persistTabs, switchTab } = get();
    const newTab: Tab = {
      tabId: generateTabId(),
      title,
      folderId,
      order: tabs.length,
    };
    const updatedTabs = [...tabs, newTab];
    set({ tabs: updatedTabs });
    persistTabs();
    // Switch to the new tab
    switchTab(newTab.tabId);
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId, persistTabs, switchTab } = get();
    const tab = tabs.find((t) => t.tabId === tabId);
    if (!tab) return;

    // Root tab cannot be closed
    if (tab.folderId === 'root') return;

    // Don't close the last tab
    if (tabs.length <= 1) return;

    const remaining = tabs.filter((t) => t.tabId !== tabId);
    set({ tabs: remaining });

    // If we closed the active tab, switch to another one
    if (activeTabId === tabId) {
      const idx = tabs.findIndex((t) => t.tabId === tabId);
      const nextIdx = Math.min(idx, remaining.length - 1);
      switchTab(remaining[nextIdx].tabId);
    }

    // Clean up persisted data for this tab
    db.positions.filter(p => p.tabId === tabId).delete();
    db.edges.filter(e => e.tabId === tabId).delete();
    db.folderState.filter(fs => fs.tabId === tabId).delete();

    persistTabs();
  },

  switchTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.tabId === tabId);
    if (!tab || tabId === activeTabId) return;

    // 1. Persist current canvas state
    useCanvasStore.getState().persistNow();

    // 2. Update active tab
    set({ activeTabId: tabId });

    // 3. Sync canvas store tab id
    useCanvasStore.getState().setActiveTabId(tabId);

    // 4. Resolve actual folder ID (root tab uses rootFolderId from rootStore)
    const folderId =
      tab.folderId === 'root'
        ? useRootStore.getState().rootFolderId ?? 'root'
        : tab.folderId;

    // 5. Reload items for the new folder
    useCanvasStore.getState().loadItems(folderId);
  },

  reorderTabs: (fromIdx: number, toIdx: number) => {
    const { tabs, persistTabs } = get();
    if (fromIdx === toIdx) return;
    const reordered = [...tabs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Update order values
    reordered.forEach((t, i) => {
      t.order = i;
    });
    set({ tabs: reordered });
    persistTabs();
  },

  /* ── Persistence ───────────────────────────────────────────── */

  loadTabs: async () => {
    const { hydrated } = get();
    if (hydrated) return;

    // Ensure rootStore is hydrated so we have the folder name
    const rootState = useRootStore.getState();
    if (!rootState.hydrated) {
      await rootState.hydrate();
    }

    try {
      const storedTabs: StoredTab[] = await db.tabs.toArray();

      if (storedTabs.length === 0) {
        // Create a default root tab with the selected root folder name
        const rootName = useRootStore.getState().rootFolderName || 'Karta';
        const rootTab: Tab = {
          tabId: 'root',
          title: rootName,
          folderId: 'root',
          order: 0,
        };
        set({
          tabs: [rootTab],
          activeTabId: 'root',
          hydrated: true,
        });
        await db.tabs.put(rootTab);
      } else {
        const tabs: Tab[] = storedTabs
          .sort((a, b) => a.order - b.order)
          .map((st) => ({
            tabId: st.tabId,
            title: st.title,
            folderId: st.folderId,
            order: st.order,
          }));
        set({
          tabs,
          activeTabId: tabs[0].tabId,
          hydrated: true,
        });
      }

      // Sync activeTabId to canvasStore
      useCanvasStore.getState().setActiveTabId(get().activeTabId);
    } catch {
      // Fallback: create root tab
      const rootName = useRootStore.getState().rootFolderName || 'Karta';
      set({
        tabs: [{ tabId: 'root', title: rootName, folderId: 'root', order: 0 }],
        activeTabId: 'root',
        hydrated: true,
      });
    }
  },

  persistTabs: async () => {
    const { tabs } = get();
    const storedTabs: StoredTab[] = tabs.map((t) => ({
      tabId: t.tabId,
      title: t.title,
      folderId: t.folderId,
      order: t.order,
    }));
    await db.tabs.clear();
    await db.tabs.bulkPut(storedTabs);
  },

  /* ── Getters ───────────────────────────────────────────────── */

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.tabId === activeTabId);
  },

  getTabById: (tabId: string) => {
    return get().tabs.find((t) => t.tabId === tabId);
  },
}));

export function isRootTab(tabId: string): boolean {
  return tabId === 'root';
}
