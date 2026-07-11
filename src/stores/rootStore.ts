import { create } from 'zustand';
import { db } from '../services/db';

interface RootState {
  rootFolderId: string | null;
  rootFolderName: string;
  isLoading: boolean;
  hydrated: boolean;
  setRoot: (id: string, name: string) => void;
  changeRoot: () => void;
  hydrate: () => Promise<void>;
}

export const useRootStore = create<RootState>((set, get) => ({
  rootFolderId: null,
  rootFolderName: '',
  isLoading: true,
  hydrated: false,

  setRoot: (id: string, name: string) => {
    set({ rootFolderId: id, rootFolderName: name });
    db.settings.bulkPut([
      { key: 'rootFolderId', value: id },
      { key: 'rootFolderName', value: name },
    ]);
  },

  changeRoot: () => {
    set({ rootFolderId: null });
    db.settings.bulkDelete(['rootFolderId', 'rootFolderName']);
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [idSetting, nameSetting] = await Promise.all([
        db.settings.get('rootFolderId'),
        db.settings.get('rootFolderName'),
      ]);
      set({
        rootFolderId: idSetting?.value ?? null,
        rootFolderName: nameSetting?.value ?? '',
        isLoading: false,
        hydrated: true,
      });
    } catch {
      set({ isLoading: false, hydrated: true });
    }
  },
}));
