import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCommentStore } from '../stores/commentStore';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours}h`;
    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface CommentThreadProps {
  nodeId: string;
  position: { x: number; y: number };
}

function CommentThread({ nodeId, position }: CommentThreadProps) {
  const comments = useCommentStore((s) => s.comments);
  const addComment = useCommentStore((s) => s.addComment);
  const closeThread = useCommentStore((s) => s.closeThread);

  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const threadComments = comments.filter(
    (c) => c.nodeId === nodeId && !c.resolved,
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addComment(nodeId, trimmed);
    setText('');
  }, [text, nodeId, addComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closeThread();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeThread]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] w-[280px] max-h-[300px] bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col motion-safe:animate-fade-in-up"
      style={{ left: position.x, top: position.y }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-700">Comentarios</span>
        <button
          onClick={closeThread}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-pointer motion-safe:transition-colors"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* comments list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {threadComments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No hay comentarios. Escribí el primero.
          </p>
        ) : (
          threadComments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              <div className="shrink-0 w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-semibold text-gray-600">
                {getInitials(comment.author)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-gray-700">
                    {comment.author}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words">
                  {comment.text}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* reply input */}
      <div className="border-t border-gray-200 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un comentario..."
          rows={1}
          className="w-full text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-400">Enter para enviar</span>
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer motion-safe:transition-colors active:scale-[0.97]"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default memo(CommentThread);
