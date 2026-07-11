import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useRootStore } from './stores/rootStore';
import UserMenu from './components/UserMenu';
import AuthLayout from './layouts/AuthLayout';
import RootPicker from './components/RootPicker';

function App() {
  const { user, isLoading: authLoading } = useAuthStore();
  const {
    rootFolderId,
    rootFolderName,
    isLoading: rootLoading,
    hydrate,
    setRoot,
    changeRoot,
  } = useRootStore();

  useEffect(() => {
    if (user) {
      hydrate();
    }
  }, [user, hydrate]);

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
    return <RootPicker onFolderSelected={setRoot} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Karta</h1>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-600 truncate max-w-[200px]">
            {rootFolderName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={changeRoot}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100 cursor-pointer motion-safe:transition-[color,background-color]"
            title="Cambiar carpeta raiz"
          >
            Cambiar carpeta
          </button>
          <UserMenu />
        </div>
      </header>
      <main className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <h1 className="text-4xl font-bold text-gray-700">Karta</h1>
      </main>
    </div>
  );
}

export default App;
