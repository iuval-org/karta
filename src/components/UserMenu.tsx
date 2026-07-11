import { useAuthStore } from '../stores/authStore';

export default function UserMenu() {
  const { user, logout } = useAuthStore();

  if (!user) return null;

  const initial = user.displayName?.charAt(0).toUpperCase() ?? '?';

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {user.photoURL ? (
        <img
          src={user.photoURL}
          alt={user.displayName ?? 'Avatar'}
          className="w-9 h-9 rounded-full object-cover"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
          {initial}
        </div>
      )}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-900 leading-tight">
          {user.displayName ?? 'Usuario'}
        </span>
        <span className="text-xs text-gray-500 leading-tight">
          {user.email ?? ''}
        </span>
      </div>
      <button
        onClick={logout}
        className="ml-2 p-2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        title="Cerrar sesión"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}
