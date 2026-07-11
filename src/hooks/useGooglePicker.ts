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
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(isPickerReady());
  const loadingRef = useRef(false);

  const showPicker = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setError('No hay sesión activa. Iniciá sesión de nuevo.');
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
  }, [getAccessToken, onFolderSelected]);

  return { showPicker, isReady, error };
}
