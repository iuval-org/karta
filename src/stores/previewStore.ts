import { create } from 'zustand';
import type { DriveItem } from '../types/drive';

interface PreviewState {
  file: DriveItem | null;
  isOpen: boolean;
  files: DriveItem[];
  currentIndex: number;

  open: (file: DriveItem, files: DriveItem[]) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  file: null,
  isOpen: false,
  files: [],
  currentIndex: -1,

  open: (file, files) => {
    const currentIndex = files.findIndex((f) => f.id === file.id);
    set({ file, isOpen: true, files, currentIndex });
  },

  close: () => set({ file: null, isOpen: false, files: [], currentIndex: -1 }),

  next: () => {
    const { currentIndex, files } = get();
    if (currentIndex < files.length - 1) {
      set({ file: files[currentIndex + 1], currentIndex: currentIndex + 1 });
    }
  },

  prev: () => {
    const { currentIndex, files } = get();
    if (currentIndex > 0) {
      set({ file: files[currentIndex - 1], currentIndex: currentIndex - 1 });
    }
  },
}));
