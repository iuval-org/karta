import { useAuthStore } from '../stores/authStore';

interface UserMenuProps {
  onOpenSettings?: () => void;
}

export default function UserMenu({ onOpenSettings }: UserMenuProps) {
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
        onClick={onOpenSettings}
        className="ml-2 p-2 text-gray-400 hover:text-gray-600 motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
        title="Configuración"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.25l-1.18 2.045a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.331 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.205-1.25l1.18-2.045a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.456l.331-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      </button>
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
