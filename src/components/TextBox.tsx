import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TextBoxData } from '../types/nodes';
import { useCanvasStore } from '../stores/canvasStore';
import { useCommentStore } from '../stores/commentStore';
import CommentBadge from './CommentBadge';
import { debounce } from '../utils/debounce';

const FONT_SIZES = [
  { label: 'S', value: 12 },
  { label: 'M', value: 16 },
  { label: 'N', value: 24 },
  { label: 'H', value: 32 },
] as const;

const TEXT_ALIGNS = [
  { value: 'left' as const, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 4.167a.75.75 0 01.75-.75h9.5a.75.75 0 010 1.5h-9.5a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h5.5a.75.75 0 010 1.5h-5.5a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd"/></svg>' },
  { value: 'center' as const, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M3 4.75A.75.75 0 013.75 4h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 4.75zm3.5 4.167a.75.75 0 01.75-.75h5.5a.75.75 0 010 1.5h-5.5a.75.75 0 01-.75-.75zm-3.5 4.166a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75zm3.5 4.167a.75.75 0 01.75-.75h5.5a.75.75 0 010 1.5h-5.5a.75.75 0 01-.75-.75z" clipRule="evenodd"/></svg>' },
  { value: 'right' as const, icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 4.167a.75.75 0 01.75-.75h9.5a.75.75 0 010 1.5h-9.5a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h5.5a.75.75 0 010 1.5h-5.5a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd"/></svg>' },
];

function TextBox({ id, data, selected }: NodeProps) {
  const textBoxData = data as unknown as TextBoxData;
  const [text, setText] = useState(textBoxData.text || '');
  const [fontSize, setFontSize] = useState(textBoxData.fontSize || 16);
  const [fontWeight, setFontWeight] = useState(textBoxData.fontWeight || 'normal');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>(textBoxData.textAlign || 'left');
  const [showToolbar, setShowToolbar] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const isFocusedRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);

  const debouncedSaveRef = useRef(
    debounce((newText: string, newFontSize: number, newFontWeight: string, newTextAlign: string) => {
      const { nodes } = useCanvasStore.getState();
      const updated = nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: { ...n.data, text: newText, fontSize: newFontSize, fontWeight: newFontWeight, textAlign: newTextAlign } as unknown as Record<string, unknown>,
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
      debouncedSaveRef.current(newText, fontSize, fontWeight, textAlign);
    }
  }, [fontSize, fontWeight, textAlign]);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    setIsFocused(false);
    if (contentRef.current) {
      const newText = contentRef.current.innerText;
      setText(newText);
      debouncedSaveRef.current(newText, fontSize, fontWeight, textAlign);
    }
    setTimeout(() => {
      if (!isFocusedRef.current) {
        setShowToolbar(false);
      }
    }, 200);
  }, [fontSize, fontWeight, textAlign]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
    setIsFocused(true);
    setShowToolbar(true);
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

  const handleFontSizeChange = useCallback((size: number) => {
    setFontSize(size);
    document.execCommand('fontSize', false, '7');
    debouncedSaveRef.current(text, size, fontWeight, textAlign);
  }, [text, fontWeight, textAlign]);

  const handleBold = useCallback(() => {
    const newWeight = fontWeight === 'bold' ? 'normal' : 'bold';
    setFontWeight(newWeight);
    document.execCommand('bold');
    debouncedSaveRef.current(text, fontSize, newWeight, textAlign);
  }, [text, fontSize, textAlign]);

  const handleItalic = useCallback(() => {
    document.execCommand('italic');
    debouncedSaveRef.current(text, fontSize, fontWeight, textAlign);
  }, [text, fontSize, fontWeight, textAlign]);

  const handleTextAlign = useCallback((align: 'left' | 'center' | 'right') => {
    setTextAlign(align);
    document.execCommand(`justify${align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'}`);
    debouncedSaveRef.current(text, fontSize, fontWeight, align);
  }, [text, fontSize, fontWeight]);

  const commentCount = useCommentStore((s) => s.getCommentsForNode(id).length);
  const openThread = useCommentStore((s) => s.openThread);

  const isEmpty = !text || text.trim() === '';

  const show = selected || isFocused || showToolbar;

  return (
    <div
      className={`relative rounded-xl motion-safe:transition-all select-none ${
        show ? 'bg-white border border-gray-200 ring-2 ring-[#2563EB]/20' : 'bg-transparent'
      }`}
      style={{
        minWidth: 120,
        maxWidth: 400,
        minHeight: 40,
      }}
      onDoubleClick={handleDoubleClick}
    >
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

      <CommentBadge count={commentCount} onClick={() => openThread(id)} />

      {/* Inline formatting toolbar */}
      {showToolbar && (
        <div
          ref={toolbarRef}
          className="absolute -top-10 left-0 flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-20"
          onMouseDown={(e) => e.preventDefault()}
        >
          {FONT_SIZES.map((fs) => (
            <button
              key={fs.value}
              onClick={() => handleFontSizeChange(fs.value)}
              className={`px-1.5 py-0.5 text-xs rounded cursor-pointer hover:bg-gray-100 active:scale-[0.97] motion-safe:transition-colors ${
                fontSize === fs.value ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-500'
              }`}
              title={`Tamaño ${fs.label}`}
              aria-label={`Tamaño ${fs.label}`}
            >
              {fs.label}
            </button>
          ))}
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            onClick={handleBold}
            className={`px-1 py-0.5 text-xs rounded cursor-pointer hover:bg-gray-100 active:scale-[0.97] motion-safe:transition-colors ${
              fontWeight === 'bold' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
            }`}
            title="Negrita"
            aria-label="Negrita"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={handleItalic}
            className="px-1 py-0.5 text-xs rounded cursor-pointer hover:bg-gray-100 active:scale-[0.97] motion-safe:transition-colors text-gray-500"
            title="Cursiva"
            aria-label="Cursiva"
          >
            <em>I</em>
          </button>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          {TEXT_ALIGNS.map((align) => (
            <button
              key={align.value}
              onClick={() => handleTextAlign(align.value)}
              className={`px-1 py-0.5 rounded cursor-pointer hover:bg-gray-100 active:scale-[0.97] motion-safe:transition-colors ${
                textAlign === align.value ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
              }`}
              title={`Alinear ${align.value === 'left' ? 'izquierda' : align.value === 'center' ? 'centro' : 'derecha'}`}
              aria-label={`Alinear ${align.value}`}
              dangerouslySetInnerHTML={{ __html: align.icon }}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="px-3 py-2">
        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          className="w-full outline-none whitespace-pre-wrap break-words"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight,
            textAlign,
            lineHeight: '1.5',
            color: '#1F2937',
            minHeight: fontSize > 20 ? '36px' : '28px',
          }}
          data-placeholder="Doble click para escribir..."
          onInput={handleInput}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-label="Texto"
        />
        {isEmpty && !isFocused && !showToolbar && (
          <div
            className="absolute pointer-events-none select-none"
            style={{
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#9CA3AF',
              top: 8,
              left: 12,
            }}
          >
            Doble click para escribir...
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TextBox);
