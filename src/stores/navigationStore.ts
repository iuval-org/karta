import { create } from 'zustand';

export interface NavEntry {
  folderId: string;
  folderName: string;
}

interface NavigationState {
  history: NavEntry[];
  currentFolderId: string;
  currentFolderName: string;
  isNavigating: boolean;

  navigateTo: (folderId: string, folderName: string) => void;
  goBack: () => void;
  goBackTo: (folderId: string) => void;
  canGoBack: () => boolean;
  resetToRoot: () => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  history: [],
  currentFolderId: '',
  currentFolderName: '',
  isNavigating: false,

  navigateTo: (folderId: string, folderName: string) => {
    const { currentFolderId, currentFolderName } = get();

    // If already on this folder, no-op
    if (currentFolderId === folderId) return;

    const newEntry: NavEntry = {
      folderId: currentFolderId,
      folderName: currentFolderName,
    };

    // Only push to history if we have a valid current folder
    const updatedHistory =
      currentFolderId
        ? [...get().history, newEntry]
        : get().history;

    set({
      history: updatedHistory,
      currentFolderId: folderId,
      currentFolderName: folderName,
      isNavigating: false,
    });
  },

  goBack: () => {
    const { history } = get();
    if (history.length === 0) return;

    const previous = history[history.length - 1];
    set({
      history: history.slice(0, -1),
      currentFolderId: previous.folderId,
      currentFolderName: previous.folderName,
      isNavigating: false,
    });
  },

  goBackTo: (folderId: string) => {
    const { history } = get();

    // Build the full path: root (implicit) + history + current
    // Find the folderId in the path
    const idx = history.findIndex((entry) => entry.folderId === folderId);
    if (idx >= 0) {
      // Found in history — truncate after this entry
      const truncated = history.slice(0, idx + 1);
      const target = truncated[truncated.length - 1];
      set({
        history: truncated.slice(0, -1),
        currentFolderId: target.folderId,
        currentFolderName: target.folderName,
        isNavigating: false,
      });
    }
  },

  canGoBack: () => {
    return get().history.length > 0;
  },

  resetToRoot: () => {
    set({
      history: [],
      currentFolderId: '',
      currentFolderName: '',
      isNavigating: false,
    });
  },
}));
