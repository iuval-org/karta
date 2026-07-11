import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  reauthenticateWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';

const OAUTH_TOKEN_KEY = 'karta_oauth_token';

function loadOAuthToken(): string | null {
  return sessionStorage.getItem(OAUTH_TOKEN_KEY);
}

function saveOAuthToken(token: string | null) {
  if (token) {
    sessionStorage.setItem(OAUTH_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(OAUTH_TOKEN_KEY);
  }
}

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

      try {
        // Re-authenticate with popup to get fresh OAuth access token
        const result = await reauthenticateWithPopup(user, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken ?? null;
        saveOAuthToken(token);
        set({ oAuthAccessToken: token });
        return token;
      } catch {
        return null;
      }
    },
  };
});
