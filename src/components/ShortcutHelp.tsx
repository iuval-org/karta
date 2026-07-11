import { useEffect, useCallback } from 'react';
import { useShortcutStore, type ShortcutDef } from '../stores/shortcutStore';

/* ------------------------------------------------------------------ */
/*  Heroicons v2 solid — inline SVGs                                   */
/* ------------------------------------------------------------------ */

const KEYBOARD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M21.75 6.75a3 3 0 00-3-3H5.25a3 3 0 00-3 3v7.5a3 3 0 003 3h1.5a.75.75 0 000 1.5h9a.75.75 0 000-1.5h1.5a3 3 0 003-3v-7.5zM6 9.75A.75.75 0 016.75 9h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 016 9.75zm5.25-.75a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm-5.25 3a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zm10.5-2.25a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z"/></svg>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>`;

const CATEGORY_ORDER: ShortcutDef['category'][] = [
  'Navegación',
  'Canvas',
  'Archivos',
  'General',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ShortcutHelp() {
  const showHelp = useShortcutStore((s) => s.showHelp);
  const setShowHelp = useShortcutStore((s) => s.setShowHelp);
  const shortCuts = useShortcutStore((s) => s.shortCuts);

  /* ── Close on Escape ────────────────────────────────────────── */
  useEffect(() => {
    if (!showHelp) return;

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowHelp(false);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showHelp, setShowHelp]);

  /* ── Close on backdrop click ────────────────────────────────── */
  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        setShowHelp(false);
      }
    },
    [setShowHelp],
  );

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 motion-safe:animate-fade-in"
      onMouseDown={handleBackdrop}
    >
      <div className="w-full max-w-md mx-4 bg-white rounded-xl shadow-xl motion-safe:animate-fade-in-up overflow-hidden">
        {/* ── header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <span
              className="shrink-0 text-gray-500"
              dangerouslySetInnerHTML={{ __html: KEYBOARD_ICON }}
            />
            <h2 className="text-base font-semibold text-gray-900 font-display">
              Atajos de teclado
            </h2>
          </div>
          <button
            onClick={() => setShowHelp(false)}
            className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg motion-safe:transition-[color,background-color] active:scale-[0.97] cursor-pointer"
            aria-label="Cerrar"
          >
            <span dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
          </button>
        </div>

        {/* ── body: grouped shortcuts ── */}
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto space-y-4">
          {(CATEGORY_ORDER as ShortcutDef['category'][]).map((category) => {
            const items = shortCuts.filter((s) => s.category === category);
            if (items.length === 0) return null;

            return (
              <section key={category}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {category}
                </h3>
                <div className="space-y-0.5">
                  {items.map((shortcut) => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between py-1.5 px-1"
                    >
                      <span className="text-sm text-gray-700 font-body">
                        {shortcut.description}
                      </span>
                      <kbd className="ml-4 shrink-0 inline-flex items-center gap-0.5 px-2 py-1 text-xs font-mono font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-md whitespace-nowrap">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* ── footer ── */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={() => setShowHelp(false)}
            className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
