import { create } from 'zustand';

interface ConnectivityState {
  isOnline: boolean;
  lastOnlineAt: string | null;
  setOnline: (online: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isOnline: navigator.onLine,
  lastOnlineAt: navigator.onLine ? new Date().toISOString() : null,

  setOnline: (online: boolean) => {
    set({
      isOnline: online,
      ...(online ? { lastOnlineAt: new Date().toISOString() } : {}),
    });
  },
}));

/**
 * Register window event listeners for online/offline.
 * Call once at app bootstrap (in main.tsx or App.tsx).
 */
export function initConnectivityListeners(): () => void {
  const handleOnline = () => useConnectivityStore.getState().setOnline(true);
  const handleOffline = () => useConnectivityStore.getState().setOnline(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
