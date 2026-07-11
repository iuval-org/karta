/**
 * ErrorState — Displays when an error occurs in the app.
 *
 * Props:
 * - title: Short error heading
 * - message: Detailed error description
 * - onRetry?: Callback for "Reintentar" button (optional)
 * - onLogout?: Callback for "Cerrar sesión" button (auth errors)
 */

/* ------------------------------------------------------------------ */
/*  Default icon (Heroicons v2 solid 20×20 — exclamation-triangle)     */
/* ------------------------------------------------------------------ */

const EXCLAMATION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="48" height="48"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  onLogout?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ErrorState({
  title,
  message,
  onRetry,
  onLogout,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-8 select-none">
      <div className="text-red-400 mb-4">
        <span dangerouslySetInnerHTML={{ __html: EXCLAMATION_ICON }} />
      </div>

      <h3 className="text-base font-semibold text-gray-800 mb-1">
        {title}
      </h3>

      <p className="text-sm text-gray-500 text-center max-w-sm mb-6">
        {message}
      </p>

      <div className="flex items-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
          >
            Reintentar
          </button>
        )}

        {onLogout && (
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  );
}
