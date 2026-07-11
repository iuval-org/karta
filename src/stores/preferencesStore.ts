import { create } from 'zustand';
import { db } from '../services/db';

/* ── Types ──────────────────────────────────────────────────────────── */

export interface Preferences {
  snapToGrid: boolean;
  showMinimap: boolean;
  showBackground: boolean;
  zoomOnScroll: boolean;
  sidebarOpen: boolean;
  showBreadcrumb: boolean;
  locale: string;
}

export interface PreferencesState extends Preferences {
  loaded: boolean;
  load: () => Promise<void>;
  update: (prefs: Partial<Preferences>) => Promise<void>;
  reset: () => Promise<void>;
}

/* ── Defaults ────────────────────────────────────────────────────────── */

const DEFAULTS: Preferences = {
  snapToGrid: true,
  showMinimap: true,
  showBackground: true,
  zoomOnScroll: true,
  sidebarOpen: true,
  showBreadcrumb: true,
  locale: 'es',
};

/* ── Store ───────────────────────────────────────────────────────────── */

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const rows = await db.settings.bulkGet([
        'snapToGrid',
        'showMinimap',
        'showBackground',
        'zoomOnScroll',
        'sidebarOpen',
        'showBreadcrumb',
        'locale',
      ]);

      const prefs: Partial<Preferences> = {};
      for (const row of rows) {
        if (!row) continue;
        switch (row.key) {
          case 'snapToGrid':
          case 'showMinimap':
          case 'showBackground':
          case 'zoomOnScroll':
          case 'sidebarOpen':
          case 'showBreadcrumb':
            (prefs as Record<string, unknown>)[row.key] = row.value === 'true';
            break;
          case 'locale':
            prefs.locale = row.value;
            break;
        }
      }

      set({ ...DEFAULTS, ...prefs, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  update: async (prefs: Partial<Preferences>) => {
    set(prefs);

    // Persist each changed key to Dexie
    for (const [key, value] of Object.entries(prefs)) {
      const stringVal = typeof value === 'boolean' ? String(value) : String(value ?? '');
      await db.settings.put({ key, value: stringVal });
    }
  },

  reset: async () => {
    set({ ...DEFAULTS });

    // Persist all defaults
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const stringVal = typeof value === 'boolean' ? String(value) : String(value ?? '');
      await db.settings.put({ key, value: stringVal });
    }
  },
}));
