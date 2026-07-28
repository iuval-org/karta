/**
 * E2E bridge — activates only when `window.__KARTA_E2E__` is set.
 *
 * Injects initial auth state into Zustand stores so the app renders
 * the canvas instead of the login screen. Uses setTimeout(0/100) to
 * override Firebase's onAuthStateChanged callback (which fires async
 * and would otherwise set user to null).
 *
 * NOTE: gapi is NOT mocked here. The real gapi loads from CDN; all
 * API calls are intercepted by Playwright's page.route() in helpers.ts.
 */
import { useAuthStore } from './stores/authStore';
import { useRootStore } from './stores/rootStore';
import { useCanvasStore } from './stores/canvasStore';

if (typeof window !== 'undefined' && (window as any).__KARTA_E2E__) {
  const E2E_USER = {
    uid: 'e2e-user',
    email: 'test@example.com',
    displayName: 'Test User',
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
  };

  const applyE2eState = () => {
    useAuthStore.setState({
      user: E2E_USER as any,
      isLoading: false,
      error: null,
      oAuthAccessToken: 'fake-token',
    });
    useRootStore.setState({
      rootFolderId: 'root_mock',
      rootFolderName: 'Karta',
      isLoading: false,
      hydrated: true,
    });
  };

  applyE2eState();
  // Expose store controls for Playwright tests
  (window as any).__kartaStores = {
    setAuthUser: (user: unknown) => {
      useAuthStore.setState({ user: user as any, isLoading: false, error: null, oAuthAccessToken: 'fake-token' });
    },
    setRootFolder: (id: string, name: string) => {
      useRootStore.setState({ rootFolderId: id, rootFolderName: name, isLoading: false, hydrated: true });
    },
    setCanvasState: (state: any) => {
      useCanvasStore.setState(state);
    },
    getCanvasStore: () => useCanvasStore.getState(),
    getAuthStore: () => useAuthStore.getState(),
    getRootStore: () => useRootStore.getState(),
  };
}