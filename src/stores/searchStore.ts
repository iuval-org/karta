import { create } from 'zustand';
import { searchFiles } from '../services/drive';
import { useCanvasStore } from './canvasStore';
import type { DriveItem } from '../types/drive';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SearchResult {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  /** Whether this result is already in the canvas. */
  inCanvas: boolean;
  /** Character offsets for highlight in results. */
  matchStart?: number;
  matchEnd?: number;
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  isLocalSearch: boolean;

  setQuery: (q: string) => void;
  search: (query: string, folderId: string) => Promise<void>;
  clearSearch: () => void;
}

/* ── helpers ────────────────────────────────────────────────────────── */

/** Find match offsets (case-insensitive) for highlighting. */
function findMatchOffsets(
  name: string,
  query: string,
): { matchStart: number; matchEnd: number } | undefined {
  const lower = name.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return undefined;
  return { matchStart: idx, matchEnd: idx + q.length };
}

/* ── store ──────────────────────────────────────────────────────────── */

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  isLocalSearch: true,

  setQuery: (q: string) => {
    set({ query: q });

    // If empty, clear everything
    if (!q.trim()) {
      get().clearSearch();
      return;
    }
  },

  search: async (query: string, _folderId: string) => {
    if (!query.trim()) {
      get().clearSearch();
      return;
    }

    set({ isSearching: true, query, isLocalSearch: true });

    const lower = query.toLowerCase();
    const canvasStore = useCanvasStore.getState();
    const allNodes = canvasStore.nodes;

    /* ── Local search (in canvas) ──────────────────────────────── */
    const localMatches: SearchResult[] = [];
    const matchedIds: string[] = [];

    for (const node of allNodes) {
      const item = node.data.driveItem as DriveItem;
      if (item.name.toLowerCase().includes(lower)) {
        const offsets = findMatchOffsets(item.name, query);
        localMatches.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          isFolder: item.isFolder,
          inCanvas: true,
          ...(offsets ? { matchStart: offsets.matchStart, matchEnd: offsets.matchEnd } : {}),
        });
        matchedIds.push(item.id);
      }
    }

    /* ── Update canvas highlighting ─────────────────────────────── */
    useCanvasStore.getState().setSearchHighlightedNodeIds(matchedIds);

    /* ── If we have local results, show them and stop ──────────── */
    if (localMatches.length > 0) {
      set({ results: localMatches, isSearching: false, isLocalSearch: true });
      return;
    }

    /* ── Drive search (fallback) ──────────────────────────────── */
    set({ isLocalSearch: false });

    try {
      let driveItems: DriveItem[];

      driveItems = await searchFiles(query);
      // Filter out items already in canvas
      const canvasIds = new Set(canvasStore.nodes.map((n) => n.id));
      driveItems = driveItems.filter((item) => !canvasIds.has(item.id));

      const driveResults: SearchResult[] = driveItems.map((item) => {
        const offsets = findMatchOffsets(item.name, query);
        return {
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          isFolder: item.isFolder,
          inCanvas: false,
          ...(offsets ? { matchStart: offsets.matchStart, matchEnd: offsets.matchEnd } : {}),
        };
      });

      set({ results: driveResults, isSearching: false });
    } catch {
      set({ results: [], isSearching: false });
    }
  },

  clearSearch: () => {
    // Restore opacity on all nodes
    useCanvasStore.getState().setSearchHighlightedNodeIds([]);
    set({ query: '', results: [], isSearching: false, isLocalSearch: true });
  },
}));
