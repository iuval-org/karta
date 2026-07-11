import { useEffect, useCallback } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useAuthStore } from '../stores/authStore';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Toggle component (reusable)                                        */
/* ------------------------------------------------------------------ */

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between w-full px-1 py-1.5 cursor-pointer group">
      <span className="text-sm text-gray-700 font-body">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full',
          'motion-safe:transition-colors motion-safe:duration-200',
          'motion-reduce:transition-none',
          'active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
          checked ? 'bg-blue-600' : 'bg-gray-200',
        ].join(' ')}
        aria-label={label}
      >
        <span
          className={[
            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm',
            'motion-safe:transition-transform motion-safe:duration-200',
            'motion-reduce:transition-none',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
          ].join(' ')}
        />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-1">
      {children}
    </h3>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Modal                                                     */
/* ------------------------------------------------------------------ */

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    snapToGrid,
    showMinimap,
    showBackground,
    zoomOnScroll,
    sidebarOpen,
    showBreadcrumb,
    update,
  } = usePreferencesStore();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  /* ── close on Escape ───────────────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  /* ── close overlay on backdrop click ────────────────────────────── */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 motion-safe:animate-fade-in motion-reduce:animate-none"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Configuración"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-[480px] max-h-[600px] overflow-y-auto motion-safe:animate-scale-in motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-gray-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            width="18"
            height="18"
            className="text-gray-500 shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.25l-1.18 2.045a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.331 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.205-1.25l1.18-2.045a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.456l.331-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
          <h2 className="text-sm font-semibold text-gray-900 font-display">
            Configuración
          </h2>
        </div>

        <div className="px-5 py-3 space-y-5">
          {/* ════════════════════════════════════════════════════════ */}
          {/*  Canvas                                                 */}
          {/* ════════════════════════════════════════════════════════ */}
          <section>
            <SectionTitle>Canvas</SectionTitle>
            <div className="space-y-0.5">
              <Toggle
                label="Grid snap (20 px)"
                checked={snapToGrid}
                onChange={(v) => update({ snapToGrid: v })}
              />
              <Toggle
                label="Mostrar minimapa"
                checked={showMinimap}
                onChange={(v) => update({ showMinimap: v })}
              />
              <Toggle
                label="Background dots"
                checked={showBackground}
                onChange={(v) => update({ showBackground: v })}
              />
              <Toggle
                label="Zoom con scroll"
                checked={zoomOnScroll}
                onChange={(v) => update({ zoomOnScroll: v })}
              />
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════ */}
          {/*  Interfaz                                               */}
          {/* ════════════════════════════════════════════════════════ */}
          <section>
            <SectionTitle>Interfaz</SectionTitle>
            <div className="space-y-0.5">
              <Toggle
                label="Sidebar abierta por defecto"
                checked={sidebarOpen}
                onChange={(v) => update({ sidebarOpen: v })}
              />
              <Toggle
                label="Breadcrumb en toolbar"
                checked={showBreadcrumb}
                onChange={(v) => update({ showBreadcrumb: v })}
              />
              <div className="flex items-center justify-between px-1 py-1.5">
                <span className="text-sm text-gray-700 font-body">Idioma</span>
                <span className="text-sm text-gray-500 font-body">Español</span>
              </div>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════ */}
          {/*  Cuenta                                                 */}
          {/* ════════════════════════════════════════════════════════ */}
          <section>
            <SectionTitle>Cuenta</SectionTitle>
            <div className="space-y-2 px-1">
              <div className="flex items-center gap-2.5">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName ?? 'Avatar'}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                    {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate font-body">
                    {user?.displayName ?? 'Usuario'}
                  </span>
                  <span className="text-xs text-gray-500 truncate font-body">
                    {user?.email ?? ''}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="flex items-center gap-1.5 w-full px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg motion-safe:transition-colors active:scale-[0.97] cursor-pointer font-body"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="16"
                  height="16"
                  className="shrink-0 text-red-400"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z"
                    clipRule="evenodd"
                  />
                </svg>
                Cerrar sesión
              </button>
            </div>
          </section>

          {/* ════════════════════════════════════════════════════════ */}
          {/*  Información                                            */}
          {/* ════════════════════════════════════════════════════════ */}
          <section>
            <SectionTitle>Información</SectionTitle>
            <div className="space-y-1 px-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-body">Versión</span>
                <span className="font-medium text-gray-700 font-body">0.1.0</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-body">Proyecto</span>
                <span className="font-medium text-gray-700 font-body">karta-file-canvas</span>
              </div>
            </div>
          </section>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg motion-safe:transition-colors active:scale-[0.97] cursor-pointer font-body"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
