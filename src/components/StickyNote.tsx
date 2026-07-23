import {
  memo,
  useCallback,
  useState,
  useRef,
  useEffect,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { StickyNoteData, StickyNoteColor } from '../types/nodes';
import { STICKY_NOTE_COLORS, STICKY_NOTE_HEADER_COLORS } from '../types/nodes';
import { useCanvasStore } from '../stores/canvasStore';

import { debounce } from '../utils/debounce';

const COLORS: StickyNoteColor[] = ['yellow', 'green', 'blue', 'pink', 'orange'];

const COLOR_NAMES: Record<StickyNoteColor, string> = {
  yellow: 'Amarillo',
  green: 'Verde',
  blue: 'Azul',
  pink: 'Rosa',
  orange: 'Naranja',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function StickyNote({ id, data, selected }: NodeProps) {
  const noteData = data as unknown as StickyNoteData;
  const color = (noteData.color || 'yellow') as StickyNoteColor;
  const bgColor = STICKY_NOTE_COLORS[color] || STICKY_NOTE_COLORS.yellow;
  const headerColor = STICKY_NOTE_HEADER_COLORS[color] || STICKY_NOTE_HEADER_COLORS.yellow;

  const [text, setText] = useState(noteData.text || '');
  const contentRef = useRef<HTMLDivElement>(null);

  const debouncedSaveRef = useRef(
    debounce((newText: string) => {
      const { nodes } = useCanvasStore.getState();
      const updated = nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: { ...n.data, text: newText } as unknown as Record<string, unknown>,
          };
        }
        return n;
      });
      useCanvasStore.getState().setNodes(updated as any);
    }, 500),
  );

  useEffect(() => {
    if (contentRef.current && contentRef.current.innerText !== text) {
      contentRef.current.innerText = text;
    }
  }, [text]);

  const handleInput = useCallback(() => {
    if (contentRef.current) {
      const newText = contentRef.current.innerText;
      setText(newText);
      debouncedSaveRef.current(newText);
    }
  }, []);

  const handleBlur = useCallback(() => {
    if (contentRef.current) {
      const newText = contentRef.current.innerText;
      setText(newText);
      debouncedSaveRef.current(newText);
    }
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (contentRef.current) {
      contentRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(contentRef.current);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      contentRef.current?.blur();
    }
  }, []);

  /* ── context menu ── */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtx = useCallback(() => {
    setCtxMenu(null);
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        closeCtx();
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closeCtx();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu, closeCtx]);

  const handleDelete = useCallback(() => {
    const state = useCanvasStore.getState();
    state.setPendingTrash([id]);
    closeCtx();
  }, [id, closeCtx]);

  const handleChangeColor = useCallback(
    (newColor: StickyNoteColor) => {
      const { nodes } = useCanvasStore.getState();
      const updated = nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: { ...n.data, color: newColor } as unknown as Record<string, unknown>,
          };
        }
        return n;
      });
      useCanvasStore.getState().setNodes(updated as any);
      closeCtx();
    },
    [id, closeCtx],
  );

  return (
    <div
      className={`relative rounded-2xl shadow-sm motion-safe:transition-shadow select-none ${
        selected ? 'border-2 border-[#2563EB] ring-2 ring-[#2563EB]/20' : 'border-0'
      }`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 140,
        minHeight: 120,
        backgroundColor: bgColor,
      }}
      onContextMenu={handleContextMenu}
    >
      <NodeResizer
        minWidth={140}
        minHeight={120}
        isVisible={selected}
        handleStyle={{
          width: 6,
          height: 6,
          border: '2px solid #2563EB',
          backgroundColor: 'white',
          borderRadius: 2,
        }}
        lineStyle={{
          border: '1.5px solid #2563EB',
          opacity: 0.4,
        }}
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!opacity-0 !pointer-events-auto"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0 !pointer-events-auto"
      />

      {/* Header bar - grip handle */}
      <div
        className="rounded-t-2xl flex items-center px-3"
        style={{
          height: 26,
          backgroundColor: headerColor,
          borderBottom: `1px solid ${headerColor}`,
        }}
      >
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-white/40" />
          <span className="w-2 h-2 rounded-full bg-white/40" />
        </div>
      </div>

      {/* Content area */}
      <div
        className="px-3 py-2 overflow-y-auto"
        style={{ height: 'calc(100% - 26px - 28px)' }}
      >
        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          className="w-full h-full outline-none whitespace-pre-wrap break-words"
          style={{
            fontFamily: "'Comic Sans MS', 'Caveat', cursive",
            fontSize: '14px',
            lineHeight: '1.5',
            color: '#1F2937',
          }}
          data-placeholder="Escribí algo..."
          onInput={handleInput}
          onBlur={handleBlur}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-label="Contenido de la nota"
        />
        {!text && (
          <div
            className="absolute pointer-events-none select-none"
            style={{
              fontFamily: "'Comic Sans MS', 'Caveat', cursive",
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#9CA3AF',
              top: 26 + 8,
              left: 12,
            }}
          >
            Escribí algo...
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-2">
        <span
          className="text-[10px]"
          style={{ color: '#6B7280', fontFamily: "'Comic Sans MS', 'Caveat', cursive" }}
        >
          {noteData.createdAt ? formatDate(noteData.createdAt) : ''}
        </span>
        <div
          className="flex items-center justify-center rounded-full text-white text-[10px] font-semibold"
          style={{
            width: 20,
            height: 20,
            backgroundColor: '#9CA3AF',
          }}
          title={noteData.author || ''}
        >
          {(noteData.author || '?').charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 motion-safe:animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Color
          </div>
          <div className="px-3 py-1.5 flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => handleChangeColor(c)}
                className={`w-6 h-6 rounded-full border-2 motion-safe:transition-transform hover:scale-110 active:scale-[0.97] cursor-pointer ${
                  c === color ? 'border-gray-700' : 'border-transparent'
                }`}
                style={{ backgroundColor: STICKY_NOTE_COLORS[c] }}
                title={COLOR_NAMES[c]}
                aria-label={COLOR_NAMES[c]}
              />
            ))}
          </div>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleDelete}
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 active:scale-[0.97] cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              width="16"
              height="16"
              className="shrink-0 text-red-400"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                clipRule="evenodd"
              />
            </svg>
            Eliminar nota
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(StickyNote);
