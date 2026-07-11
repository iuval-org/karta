import { create } from 'zustand';
import { db } from '../services/db';

interface SidebarState {
  isOpen: boolean;
  hydrated: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  isOpen: true,
  hydrated: false,

  toggle: () => {
    const next = !get().isOpen;
    set({ isOpen: next });
    db.settings.put({ key: 'sidebarOpen', value: String(next) });
  },

  setOpen: (open: boolean) => {
    set({ isOpen: open });
    db.settings.put({ key: 'sidebarOpen', value: String(open) });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const setting = await db.settings.get('sidebarOpen');
      if (setting) {
        set({ isOpen: setting.value === 'true', hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));
