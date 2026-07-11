/**
 * ConfirmModal — Modal de confirmación para acciones destructivas.
 *
 * Reutiliza el patrón visual de CreateModal pero sin input.
 * Escape → cancelar, Enter → confirmar.
 */

import { useEffect, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ConfirmModalProps {
  /** Título del modal (ej: "Mover a la papelera") */
  title: string;
  /** Mensaje de confirmación (ej: "¿Mover Storyboard.pdf a la papelera?") */
  message: string;
  /** Texto secundario opcional debajo del mensaje */
  hint?: string;
  /** Texto del botón de confirmación (default: "Eliminar") */
  confirmLabel?: string;
  /** Texto del botón de cancelar (default: "Cancelar") */
  cancelLabel?: string;
  /** Callback cuando se confirma */
  onConfirm: () => void;
  /** Callback cuando se cancela */
  onCancel: () => void;
  /** Si está en proceso (deshabilita botones) */
  isLoading?: boolean;
}

export default function ConfirmModal({
  title,
  message,
  hint = 'Podés recuperarlo desde la papelera de Google Drive',
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  /* ── focus confirm button on mount ────────────────────────── */
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  /* ── Escape → cancel, Enter → confirm ────────────────────── */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault();
        onConfirm();
      }
    },
    [onConfirm, isLoading],
  );

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-[340px] bg-white border border-gray-200 rounded-xl shadow-lg motion-safe:animate-fade-in-up">
        {/* ── header ── */}
        <div className="px-4 pt-3.5 pb-2">
          <h2 className="font-display font-semibold text-sm text-gray-900">
            {title}
          </h2>
        </div>

        {/* ── body ── */}
        <div className="px-4 pb-2">
          <p className="font-body text-sm text-gray-700">{message}</p>
          {hint && (
            <p className="mt-2 font-body text-xs text-gray-400">{hint}</p>
          )}
        </div>

        {/* ── footer ── */}
        <div className="flex items-center justify-end gap-2 px-4 pb-3.5">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 motion-safe:transition-colors active:scale-[0.97] cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 motion-safe:transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Eliminando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
