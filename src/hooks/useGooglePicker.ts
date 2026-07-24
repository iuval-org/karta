import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { loadPicker, isPickerReady } from '../services/picker';

interface UseGooglePickerReturn {
  showPicker: () => Promise<void>;
  isReady: boolean;
  error: string | null;
}

export function useGooglePicker(
  onFolderSelected: (folderId: string, folderName: string) => void,
): UseGooglePickerReturn {
  const getAccessToken = useAuthStore((s) => s.getAccessToken);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const clearAccessToken = useAuthStore((s) => s.clearAccessToken);
  const logout = useAuthStore((s) => s.logout);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(isPickerReady());
  const loadingRef = useRef(false);

  const showPicker = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);

    try {
      let token = await getAccessToken();

      // If no token, try silent refresh first
      if (!token) {
        token = await refreshAccessToken();
      }

      // If still no token, redirect to login
      if (!token) {
        localStorage.setItem(
          'karta_redirect_after_login',
          window.location.href,
        );
        clearAccessToken();
        await logout();
        return;
      }

      loadPicker(
        token,
        (result) => {
          onFolderSelected(result.folderId, result.folderName);
        },
        (errMsg) => {
          setError(errMsg);
        },
      );

      // Poll for ready state
      const check = setInterval(() => {
        if (isPickerReady()) {
          setIsReady(true);
          clearInterval(check);
        }
      }, 200);
      setTimeout(() => clearInterval(check), 10000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al abrir el selector';
      setError(message);
    } finally {
      loadingRef.current = false;
    }
  }, [getAccessToken, refreshAccessToken, clearAccessToken, logout, onFolderSelected]);

  return { showPicker, isReady, error };
}
