import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// ---------------------------------------------------------------------------
// Helper: creates a Zustand-like mock store whose state is built fresh each
// time getState is called (so closures over mutable objects like authState
// always return the current values).
// ---------------------------------------------------------------------------
function createMockStore(factory: () => Record<string, any>) {
  const getState = vi.fn(() => factory());
  const subscribe = vi.fn(() => vi.fn());

  const useStore = Object.assign(
    vi.fn((selector?: (s: any) => any) => {
      const current = getState();
      return selector ? selector(current) : current;
    }),
    { getState, subscribe },
  );

  return { useStore, getState, subscribe };
}

// ---------------------------------------------------------------------------
// Mutable references that tests can modify; mocks read them lazily via factory
// ---------------------------------------------------------------------------
const authState = vi.hoisted(() => ({ user: null as any, isLoading: false }));
const rootState = vi.hoisted(() => ({ rootFolderId: null as string | null, isLoading: false }));
const tabsHydratedRef = vi.hoisted(() => ({ value: true }));

// ---------------------------------------------------------------------------
// Mock every module that App.tsx imports
// ---------------------------------------------------------------------------

vi.mock('./services/firebase', () => ({
  auth: {},
  googleProvider: { addScope: vi.fn(), scopes: [] },
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth: any, callback: (user: any) => void) => {
    callback(null);
    return vi.fn();
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(function MockGoogleAuthProvider() {
    return { addScope: vi.fn(), scopes: [] };
  }),
}));

vi.mock('./stores/authStore', () => {
  const { useStore } = createMockStore(() => ({
    user: authState.user,
    isLoading: authState.isLoading,
    oAuthAccessToken: authState.user ? 'token' : null,
    error: null,
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(authState.user ? 'token' : null)),
  }));
  return { useAuthStore: useStore };
});

vi.mock('./stores/rootStore', () => {
  const mockHydrate = vi.fn().mockResolvedValue(undefined);
  const mockSetRoot = vi.fn();
  const mockChangeRoot = vi.fn();

  const { useStore } = createMockStore(() => ({
    rootFolderId: rootState.rootFolderId,
    rootFolderName: rootState.rootFolderId ? 'Mi Unidad' : '',
    isLoading: rootState.isLoading,
    hydrated: true,
    setRoot: mockSetRoot,
    changeRoot: mockChangeRoot,
    hydrate: mockHydrate,
  }));

  return { useRootStore: useStore };
});

const mockLoadItems = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockResetLayout = vi.hoisted(() => vi.fn());

vi.mock('./stores/canvasStore', () => {
  const { useStore } = createMockStore(() => ({
    nodes: [],
    edges: [],
    allItems: [],
    isLoading: false,
    error: null,
    errorType: null,
    layout: 'grid',
    loadItems: mockLoadItems,
    resetLayout: mockResetLayout,
  }));

  return { useCanvasStore: useStore };
});

vi.mock('./stores/tabStore', () => {
  const mockLoadTabs = vi.fn().mockResolvedValue(undefined);
  const mockAddTab = vi.fn();
  const mockPersistTabs = vi.fn().mockResolvedValue(undefined);
  const mockSwitchTab = vi.fn();

  const { useStore } = createMockStore(() => ({
    tabs: [{ tabId: 'root', title: 'Karta', folderId: 'root', order: 0 }],
    activeTabId: 'root',
    hydrated: tabsHydratedRef.value,
    loadTabs: mockLoadTabs,
    addTab: mockAddTab,
    persistTabs: mockPersistTabs,
    switchTab: mockSwitchTab,
  }));

  return { useTabStore: useStore, isRootTab: vi.fn((id: string) => id === 'root') };
});

vi.mock('./stores/sidebarStore', () => {
  const mockHydrate = vi.fn();

  const { useStore } = createMockStore(() => ({
    isOpen: true,
    hydrated: false,
    toggle: vi.fn(),
    setOpen: vi.fn(),
    hydrate: mockHydrate,
  }));

  return { useSidebarStore: useStore };
});

const mockLoadPreferences = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('./stores/preferencesStore', () => {
  const { useStore } = createMockStore(() => ({
    snapToGrid: true,
    showMinimap: true,
    showBackground: true,
    zoomOnScroll: true,
    sidebarOpen: true,
    showBreadcrumb: true,
    locale: 'es',
    loaded: false,
    load: mockLoadPreferences,
  }));

  return { usePreferencesStore: useStore };
});

vi.mock('./stores/connectivityStore', () => ({
  initConnectivityListeners: vi.fn(() => vi.fn()),
}));

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

// Layout components
vi.mock('./layouts/AuthLayout', () => ({
  default: () => <div data-testid="auth-layout">Auth Layout</div>,
}));

vi.mock('./layouts/AppLayout', () => ({
  default: ({ tabBar, sidebar, toolbar, canvas, statusBar }: any) => (
    <div data-testid="app-layout">
      {tabBar}
      {sidebar}
      {toolbar}
      {canvas}
      {statusBar}
    </div>
  ),
}));

vi.mock('./components/RootPicker', () => ({
  default: () => <div data-testid="root-picker">Root Picker</div>,
}));

vi.mock('./components/Canvas', () => ({
  default: () => <div data-testid="canvas">Canvas</div>,
}));

vi.mock('./components/TabBar', () => ({
  default: () => <div data-testid="tab-bar">Tab Bar</div>,
}));

vi.mock('./components/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock('./components/Toolbar', () => ({
  default: () => <div data-testid="toolbar">Toolbar</div>,
}));

vi.mock('./components/StatusBar', () => ({
  default: () => <div data-testid="status-bar">Status Bar</div>,
}));

vi.mock('./components/Toast', () => ({
  default: () => <div data-testid="toast">Toast</div>,
}));

vi.mock('./components/OfflineBanner', () => ({
  default: () => <div data-testid="offline-banner">Offline Banner</div>,
}));

vi.mock('./components/ShortcutHelp', () => ({
  default: () => <div data-testid="shortcut-help">Shortcut Help</div>,
}));

vi.mock('./components/SettingsModal', () => ({
  default: ({ isOpen }: any) =>
    isOpen ? <div data-testid="settings-modal">Settings</div> : null,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset all module-level mutable state
  authState.user = null;
  authState.isLoading = false;
  rootState.rootFolderId = null;
  rootState.isLoading = false;
  tabsHydratedRef.value = true;
});

describe('App load flow', () => {
  it('renderiza AuthLayout cuando no hay usuario', () => {
    // authState.user is already null from beforeEach
    render(<App />);
    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
  });

  it('renderiza RootPicker cuando hay usuario pero no rootFolderId', () => {
    authState.user = { uid: 'u1', email: 'test@test.com' };

    render(<App />);
    expect(screen.getByTestId('root-picker')).toBeInTheDocument();
  });

  it('renderiza AppLayout cuando hay usuario y rootFolderId', () => {
    authState.user = { uid: 'u1', email: 'test@test.com' };
    rootState.rootFolderId = 'root-folder-id';

    render(<App />);
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('NO renderiza nada (spinner) mientras authLoading', () => {
    authState.isLoading = true;

    const { container } = render(<App />);
    expect(screen.queryByTestId('auth-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-layout')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('NO renderiza nada (spinner) mientras rootLoading', () => {
    authState.user = { uid: 'u1', email: 'test@test.com' };
    rootState.isLoading = true;

    const { container } = render(<App />);
    expect(screen.queryByTestId('auth-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-layout')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('NO llama loadItems si no hay rootFolderId', () => {
    authState.user = { uid: 'u1', email: 'test@test.com' };

    render(<App />);
    expect(mockLoadItems).not.toHaveBeenCalled();
  });

  it('NO llama loadItems si tabs no hydrated', () => {
    authState.user = { uid: 'u1', email: 'test@test.com' };
    rootState.rootFolderId = 'root-folder-id';
    tabsHydratedRef.value = false;

    render(<App />);
    expect(mockLoadItems).not.toHaveBeenCalled();
  });

  it('llama loadItems cuando rootFolderId existe y tabs hydrated', () => {
    authState.user = { uid: 'u1', email: 'test@test.com' };
    rootState.rootFolderId = 'root-folder-id';

    render(<App />);
    expect(mockLoadItems).toHaveBeenCalledTimes(1);
    expect(mockLoadItems).toHaveBeenCalledWith('root-folder-id');
  });

  it('carga preferencias y tabs cuando hay usuario', () => {
    authState.user = { uid: 'u1', email: 'test@test.com' };
    rootState.rootFolderId = 'root-folder-id';

    render(<App />);
    expect(mockLoadPreferences).toHaveBeenCalled();
  });

  it('NO renderiza si no hay usuario pero está cargando (spinner)', () => {
    authState.isLoading = true;

    const { container } = render(<App />);
    expect(screen.queryByTestId('auth-layout')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
