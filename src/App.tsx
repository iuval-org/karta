import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useAuthStore } from './stores/authStore';
import { useRootStore } from './stores/rootStore';
import { useCanvasStore } from './stores/canvasStore';
import { useTabStore } from './stores/tabStore';
import { useSidebarStore } from './stores/sidebarStore';
import { usePreferencesStore } from './stores/preferencesStore';
import { useNavigationStore } from './stores/navigationStore';
import { initConnectivityListeners } from './stores/connectivityStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { operationQueue } from './services/operationQueue';
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';
import RootPicker from './components/RootPicker';
import Canvas from './components/Canvas';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import ToastContainer from './components/Toast';
import OfflineBanner from './components/OfflineBanner';
import ShortcutHelp from './components/ShortcutHelp';
import SettingsModal from './components/SettingsModal';

function AppContent() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { rootFolderId, rootFolderName, isLoading: rootLoading, hydrate } =
    useRootStore();
  const loadItems = useCanvasStore((s) => s.loadItems);
  const initialized = useCanvasStore((s) => s.nodes.length > 0);
  const loadTabs = useTabStore((s) => s.loadTabs);
  const tabsHydrated = useTabStore((s) => s.hydrated);
  const hydrateSidebar = useSidebarStore((s) => s.hydrate);
  const loadPreferences = usePreferencesStore((s) => s.load);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  // Initialize connectivity listeners on mount
  useEffect(() => {
    const cleanup = initConnectivityListeners();
    return cleanup;
  }, []);

  useEffect(() => {
    if (user) {
      hydrate();
      loadTabs();
      hydrateSidebar();
      loadPreferences();
      // Resume any pending Drive operations from Dexie
      operationQueue.resumeFromStorage().catch((err) => {
        console.warn('[App] Error resuming operation queue:', err);
      });
    }

    return () => {
      // noop
    };
  }, [user, hydrate, loadTabs, hydrateSidebar, loadPreferences]);

  useEffect(() => {
    if (rootFolderId && !initialized && tabsHydrated) {
      loadItems(rootFolderId);
    }
  }, [rootFolderId, initialized, loadItems, tabsHydrated]);

  /* ── Dynamic document.title ───────────────────────────────── */
  const navCurrentFolderId = useNavigationStore((s) => s.currentFolderId);
  const navCurrentFolderName = useNavigationStore((s) => s.currentFolderName);
  const navHistory = useNavigationStore((s) => s.history);

  useEffect(() => {
    if (!rootFolderId) {
      document.title = 'Karta';
      return;
    }

    if (!navCurrentFolderId) {
      document.title = 'Karta';
      return;
    }

    // Build path from history + current folder
    const pathParts = navHistory.map((e) => e.folderName);
    if (navCurrentFolderName) {
      pathParts.push(navCurrentFolderName);
    }

    if (pathParts.length === 0) {
      document.title = 'Karta';
    } else if (pathParts.length === 1) {
      document.title = `Karta — ${pathParts[0]}`;
    } else {
      document.title = `Karta — ${pathParts.join(' > ')}`;
    }
  }, [navCurrentFolderId, navCurrentFolderName, navHistory, rootFolderId]);

  if (authLoading || (user && rootLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthLayout />;
  }

  if (!rootFolderId) {
    return <RootPicker onFolderSelected={(id, name) => useRootStore.getState().setRoot(id, name)} />;
  }

  return (
    <>
      <AppLayout
        tabBar={<TabBar />}
        sidebar={<Sidebar />}
        toolbar={
          <Toolbar
            rootFolderName={rootFolderName}
          />
        }
        canvas={
          <Canvas
          />
        }
        statusBar={<StatusBar />}
      />

      {/* Global overlay components */}
      <OfflineBanner />
      <ToastContainer />
      <ShortcutHelp />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
}

export default App;
