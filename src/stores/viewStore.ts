import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type ViewMode = 'canvas' | 'list' | 'grid';

interface ViewState {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggle: () => void;
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortDir: 'asc' | 'desc';
  setSort: (by: string, dir?: string) => void;
}

const ORDER: ViewMode[] = ['canvas', 'list', 'grid'];

export const useViewStore = create<ViewState>()(
  devtools(
    persist(
      (set, get) => ({
        mode: 'canvas',

        setMode: (mode: ViewMode) => set({ mode }),

        toggle: () => {
          const { mode } = get();
          const idx = ORDER.indexOf(mode);
          const next = ORDER[(idx + 1) % ORDER.length];
          set({ mode: next });
        },

        sortBy: 'name',
        sortDir: 'asc',

        setSort: (by: string, dir?: string) => {
          if (by === get().sortBy) {
            set({ sortDir: get().sortDir === 'asc' ? 'desc' : 'asc' });
          } else {
            set({
              sortBy: by as ViewState['sortBy'],
              sortDir: (dir as ViewState['sortDir']) ?? 'asc',
            });
          }
        },
      }),
      {
        name: 'karta:viewMode',
        partialize: (state) => ({ mode: state.mode }),
      },
    ),
  ),
);
