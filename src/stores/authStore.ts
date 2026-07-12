import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';

const OAUTH_TOKEN_KEY = 'karta_oauth_token';

function loadOAuthToken(): string | null {
  return localStorage.getItem(OAUTH_TOKEN_KEY);
}

function saveOAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(OAUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(OAUTH_TOKEN_KEY);
  }
}

// ---------------------------------------------------------------------------
// Google Identity Services (GIS) — silent OAuth token refresh
// ---------------------------------------------------------------------------

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

let gisLoadPromise: Promise<void> | null = null;

/**
 * Lazy-loads the Google Identity Services script on demand.
 * Idempotent — only loads once regardless of how many times it's called.
 */
function loadGisScript(): Promise<void> {
  if (typeof window.google !== 'undefined' && window.google.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new Error('No se pudo cargar Google Identity Services'));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

/**
 * Solicita un nuevo access token OAuth de forma silenciosa (sin popup).
 * Solo funciona cuando el usuario aún tiene una sesión de Google válida
 * (el navegador tiene cookies de Google). No abre ventanas emergentes.
 */
async function requestSilentToken(): Promise<string | null> {
  try {
    await loadGisScript();

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn('[authStore] VITE_GOOGLE_CLIENT_ID no está configurado');
      return null;
    }

    return new Promise<string | null>((resolve) => {
      let resolved = false;

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_OAUTH_SCOPES,
        callback: (response) => {
          if (resolved) return;
          resolved = true;

          if (response.access_token) {
            resolve(response.access_token);
          } else {
            console.warn(
              '[authStore] Silent token refresh falló:',
              response.error ?? 'sin access_token',
            );
            resolve(null);
          }
        },
        error_callback: () => {
          if (resolved) return;
          resolved = true;
          resolve(null);
        },
      });

      // prompt: '' = silent mode — solo funciona si Google tiene sesión activa
      tokenClient.requestAccessToken({ prompt: '' });
    });
  } catch (err) {
    console.warn('[authStore] Error en refresh silencioso:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth store
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  oAuthAccessToken: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  clearAccessToken: () => void;
  refreshAccessToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  onAuthStateChanged(auth, (user) => {
    set({ user, isLoading: false });
  });

  return {
    user: null,
    isLoading: true,
    error: null,
    oAuthAccessToken: loadOAuthToken(),

    loginWithGoogle: async () => {
      set({ error: null });
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken ?? null;
        saveOAuthToken(token);
        set({
          user: result.user,
          error: null,
          oAuthAccessToken: token,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error al iniciar sesión';
        set({ error: message });
      }
    },

    logout: async () => {
      try {
        await signOut(auth);
        saveOAuthToken(null);
        set({ user: null, error: null, oAuthAccessToken: null });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error al cerrar sesión';
        set({ error: message });
      }
    },

    getAccessToken: async () => {
      const { oAuthAccessToken } = get();
      if (oAuthAccessToken) return oAuthAccessToken;

      const stored = loadOAuthToken();
      if (stored) {
        set({ oAuthAccessToken: stored });
        return stored;
      }

      return null;
    },

    clearAccessToken: () => {
      saveOAuthToken(null);
      set({ oAuthAccessToken: null });
    },

    refreshAccessToken: async () => {
      const { user } = get();
      if (!user) return null;

      // Clear stale token first
      saveOAuthToken(null);
      set({ oAuthAccessToken: null });

      // Silent refresh via Google Identity Services — no popup
      const token = await requestSilentToken();
      if (token) {
        saveOAuthToken(token);
        set({ oAuthAccessToken: token });
        return token;
      }

      return null;
    },
  };
});
