import { useEffect, useCallback, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useAuthStore } from './stores/authStore';
import { useRootStore } from './stores/rootStore';
import { useCanvasStore } from './stores/canvasStore';
import { useTabStore } from './stores/tabStore';
import { useSidebarStore } from './stores/sidebarStore';
import { usePreferencesStore } from './stores/preferencesStore';
import { initConnectivityListeners } from './stores/connectivityStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
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
  const { rootFolderId, rootFolderName, isLoading: rootLoading, hydrate, changeRoot } =
    useRootStore();
  const loadItems = useCanvasStore((s) => s.loadItems);
  const initialized = useCanvasStore((s) => s.nodes.length > 0);
  const resetLayout = useCanvasStore((s) => s.resetLayout);
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
    }
  }, [user, hydrate, loadTabs, hydrateSidebar, loadPreferences]);

  useEffect(() => {
    if (rootFolderId && !initialized && tabsHydrated) {
      loadItems(rootFolderId);
    }
  }, [rootFolderId, initialized, loadItems, tabsHydrated]);

  const handleNewTab = useCallback(() => {
    const addTab = useTabStore.getState().addTab;
    const tabs = useTabStore.getState().tabs;
    if (tabs.length > 0) {
      // Open Google Picker — re-use root folder for simplicity
      addTab(rootFolderId ?? 'root', rootFolderName || 'Nueva pestaña');
    }
  }, [rootFolderId, rootFolderName]);

  const handleReorganize = useCallback(() => {
    resetLayout();
  }, [resetLayout]);

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
        sidebar={
          <Sidebar
            rootFolderName={rootFolderName}
            onNewTab={handleNewTab}
            onReorganize={handleReorganize}
            onChangeRoot={changeRoot}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        }
        toolbar={
          <Toolbar
            rootFolderName={rootFolderName}
            onOpenSettings={() => setSettingsOpen(true)}
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
