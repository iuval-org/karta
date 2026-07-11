import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  oAuthAccessToken: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  onAuthStateChanged(auth, (user) => {
    set({ user, isLoading: false });
  });

  return {
    user: null,
    isLoading: true,
    error: null,
    oAuthAccessToken: null,

    loginWithGoogle: async () => {
      set({ error: null });
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        set({
          user: result.user,
          error: null,
          oAuthAccessToken: credential?.accessToken ?? null,
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
        set({ user: null, error: null, oAuthAccessToken: null });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error al cerrar sesión';
        set({ error: message });
      }
    },

    getAccessToken: async () => {
      const { user, oAuthAccessToken } = get();
      if (oAuthAccessToken) return oAuthAccessToken;
      if (!user) return null;
      try {
        return await user.getIdToken();
      } catch {
        return null;
      }
    },
  };
});
