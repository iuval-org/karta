/**
 * Toast — Notification toast system.
 *
 * Renders a stack of toast notifications at the bottom-right corner.
 * Auto-dismisses after a configurable duration.
 * Max 3 visible toasts at a time.
 */

import { useEffect } from 'react';
import { useToastStore, type ToastMessage } from '../stores/toastStore';

/* ------------------------------------------------------------------ */
/*  Heroicons v2 solid 20×20                                          */
/* ------------------------------------------------------------------ */

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd"/></svg>`;

const X_CIRCLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/></svg>`;

const INFO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/></svg>`;

const WARNING_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Style map per type                                                 */
/* ------------------------------------------------------------------ */

interface ToastStyle {
  bg: string;
  border: string;
  icon: string;
  iconColor: string;
}

const STYLE_MAP: Record<ToastMessage['type'], ToastStyle> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: CHECK_ICON,
    iconColor: 'text-green-500',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: X_CIRCLE_ICON,
    iconColor: 'text-red-500',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: INFO_ICON,
    iconColor: 'text-blue-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: WARNING_ICON,
    iconColor: 'text-amber-500',
  },
};

/* ------------------------------------------------------------------ */
/*  Individual Toast                                                   */
/* ------------------------------------------------------------------ */

function ToastItem({ toast }: { toast: ToastMessage }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const style = STYLE_MAP[toast.type];

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => removeToast(toast.id), toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, removeToast]);

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-2.5 px-3 py-2.5 rounded-lg border shadow-lg',
        'max-w-sm w-full',
        'motion-safe:animate-toast-in motion-safe:transition-all',
        'motion-reduce:animate-none',
        style.bg,
        style.border,
      ].join(' ')}
    >
      <span className={`shrink-0 mt-0.5 ${style.iconColor}`}>
        <span dangerouslySetInnerHTML={{ __html: style.icon }} />
      </span>

      <p className="flex-1 text-sm text-gray-800 font-body leading-snug">
        {toast.message}
      </p>

      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 text-gray-400 hover:text-gray-600 motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
        aria-label="Cerrar notificación"
      >
        <span dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast Container                                                    */
/* ------------------------------------------------------------------ */

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  // Show at most 3 toasts (stack from bottom)
  const visible = toasts.slice(-3);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      {visible.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
}
