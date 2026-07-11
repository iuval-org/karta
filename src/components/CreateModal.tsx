/**
 * CreateModal — Modal pequeño para ingresar nombre al crear un item.
 *
 * Se muestra centrado sin backdrop, con input autofocus y validación.
 * Enter → crear, Escape → cancelar.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Validación                                                         */
/* ------------------------------------------------------------------ */

const FORBIDDEN_CHARS = /[\\/:*?"<>|]/;
const MAX_NAME_LENGTH = 255;

function validateName(name: string): string | null {
  if (!name.trim()) return 'El nombre no puede estar vacío';
  if (name.length > MAX_NAME_LENGTH)
    return `Máximo ${MAX_NAME_LENGTH} caracteres`;
  if (FORBIDDEN_CHARS.test(name))
    return 'Caracteres prohibidos: \\ / : * ? " < > |';
  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface CreateModalProps {
  /** Título del modal (ej: "Nueva Carpeta", "Nuevo Documento") */
  title: string;
  /** Placeholder del input */
  placeholder?: string;
  /** Callback cuando se confirma la creación */
  onSubmit: (name: string) => void;
  /** Callback cuando se cancela */
  onCancel: () => void;
  /** Si está en proceso de creación (deshabilita botón) */
  isLoading?: boolean;
}

export default function CreateModal({
  title,
  placeholder = 'Sin título',
  onSubmit,
  onCancel,
  isLoading = false,
}: CreateModalProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const error = validateName(name);
  const isValid = error === null && name.trim().length > 0;

  /* ── autofocus on mount ─────────────────────────────────────── */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* ── Escape → cancel ───────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  /* ── handlers ───────────────────────────────────────────────── */
  const handleSubmit = useCallback(() => {
    if (!isValid || isLoading) return;
    onSubmit(name.trim());
  }, [isValid, isLoading, onSubmit, name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => {
        // Click on backdrop → cancel
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-[320px] bg-white border border-gray-200 rounded-xl shadow-lg motion-safe:animate-fade-in-up">
        {/* ── header ── */}
        <div className="px-4 pt-3.5 pb-2">
          <h2 className="font-display font-semibold text-sm text-gray-900">
            {title}
          </h2>
        </div>

        {/* ── body ── */}
        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={MAX_NAME_LENGTH}
            className={`w-full px-3 py-2 text-sm font-body border rounded-lg outline-none motion-safe:transition-colors placeholder:text-gray-400 ${
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
                : 'border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30'
            }`}
          />
          {error && (
            <p className="mt-1 text-xs text-red-500 font-body">{error}</p>
          )}
        </div>

        {/* ── footer ── */}
        <div className="flex items-center justify-end gap-2 px-4 pb-3.5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isLoading}
            className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg motion-safe:transition-all active:scale-[0.97] cursor-pointer ${
              isValid && !isLoading
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-indigo-300 cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}
