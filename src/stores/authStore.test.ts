import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

const OAUTH_TOKEN_KEY = 'karta_oauth_token';

// ---------------------------------------------------------------------------
// Use vi.hoisted() to create mock functions before vi.mock() hoisting
// ---------------------------------------------------------------------------

const mockSignInWithPopup = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());
const mockOnAuthStateChanged = vi.hoisted(() =>
  vi.fn((_auth: any, callback: (user: any) => void) => {
    callback(null);
    return vi.fn();
  }),
);
const mockCredentialFromResult = vi.hoisted(() =>
  vi.fn(() => ({ accessToken: 'google-oauth-token-123' })),
);

// Mock firebase module
vi.mock('../services/firebase', () => ({
  auth: {},
  googleProvider: { addScope: vi.fn(), scopes: [] },
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth: any, callback: (user: any) => void) =>
    mockOnAuthStateChanged(auth, callback),
  signInWithPopup: (arg: any) => mockSignInWithPopup(arg),
  signOut: (arg: any) => mockSignOut(arg),
  GoogleAuthProvider: {
    credentialFromResult: () => mockCredentialFromResult(),
  },
}));

beforeEach(() => {
  localStorage.clear();
  // Reset the store state
  useAuthStore.setState({
    user: null,
    isLoading: false,
    error: null,
    oAuthAccessToken: null,
  });
  vi.clearAllMocks();
});

describe('Auth store', () => {
  it('guarda oAuthAccessToken en localStorage al loguearse', async () => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: 'user-1', email: 'test@test.com' } });

    await useAuthStore.getState().loginWithGoogle();

    expect(localStorage.getItem(OAUTH_TOKEN_KEY)).toBe('google-oauth-token-123');
    expect(useAuthStore.getState().oAuthAccessToken).toBe('google-oauth-token-123');
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('limpia localStorage al cerrar sesión', async () => {
    localStorage.setItem(OAUTH_TOKEN_KEY, 'some-token');
    useAuthStore.setState({
      user: { uid: 'user-1' } as any,
      oAuthAccessToken: 'some-token',
    });
    mockSignOut.mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(localStorage.getItem(OAUTH_TOKEN_KEY)).toBeNull();
    expect(useAuthStore.getState().oAuthAccessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('getAccessToken devuelve Google OAuth token desde estado en memoria', async () => {
    useAuthStore.setState({ oAuthAccessToken: 'oauth-token-from-memory' });

    const token = await useAuthStore.getState().getAccessToken();
    expect(token).toBe('oauth-token-from-memory');
  });

  it('getAccessToken revisa localStorage si no hay token en memoria', async () => {
    localStorage.setItem(OAUTH_TOKEN_KEY, 'stored-token');

    const token = await useAuthStore.getState().getAccessToken();
    expect(token).toBe('stored-token');
    expect(useAuthStore.getState().oAuthAccessToken).toBe('stored-token');
  });

  it('getAccessToken devuelve null si no hay sesión', async () => {
    const token = await useAuthStore.getState().getAccessToken();
    expect(token).toBeNull();
  });

  it('loginWithGoogle maneja errores', async () => {
    mockSignInWithPopup.mockRejectedValue(new Error('Popup closed'));

    await useAuthStore.getState().loginWithGoogle();

    const state = useAuthStore.getState();
    expect(state.error).toBe('Popup closed');
    expect(state.oAuthAccessToken).toBeNull();
  });

  it('logout maneja errores', async () => {
    mockSignOut.mockRejectedValue(new Error('Network error'));

    useAuthStore.setState({ user: { uid: 'u1' } as any, oAuthAccessToken: 'tok' });
    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.error).toBe('Network error');
  });
});
