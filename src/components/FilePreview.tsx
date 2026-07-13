import { useEffect, useCallback, useState, useRef } from 'react';
import { usePreviewStore } from '../stores/previewStore';
import { getFileTypeLabel } from '../types/mime';
/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSize(size?: string): string {
  if (!size) return '';
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const scaled = bytes / Math.pow(1024, i);
  return i === 0 ? `${scaled} B` : `${scaled.toFixed(i === 1 ? 0 : 1)} ${units[i]}`;
}

/* ------------------------------------------------------------------ */
/*  Heroicons v2 solid — inline SVGs                                   */
/* ------------------------------------------------------------------ */

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>`;

const ARROW_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd"/></svg>`;

const ARROW_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fillRule="evenodd" d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd"/></svg>`;

const EXTERNAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z"/><path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z"/></svg>`;

const FILE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="48" height="48"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Increase thumbnail size for preview by replacing the =sXX suffix. */
function getLargerThumb(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/=s\d+/, '=s0');
}

/** Check if a mimeType is a Google Workspace type (Docs, Sheets, Slides, etc.). */
function isGoogleWorkspace(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-apps.');
}

/** Check if text can be previewed inline. */
async function fetchTextContent(fileId: string): Promise<string> {
  const response = await window.gapi.client!.request({
    path: `/drive/v3/files/${fileId}?alt=media`,
    method: 'GET',
  });
  return String((response as any).result ?? response);
}

/* ------------------------------------------------------------------ */
/*  Mime-type renderers                                                */
/* ------------------------------------------------------------------ */

function ImagePreview({ src }: { src: string | undefined }) {
  if (!src) return <PlaceholderContent />;
  return (
    <div className="flex items-center justify-center w-full h-full p-4">
      <img
        src={getLargerThumb(src)}
        alt="Preview"
        className="max-w-full max-h-full object-contain rounded-lg"
      />
    </div>
  );
}

function PdfPreview({ webViewLink }: { webViewLink: string | undefined }) {
  if (!webViewLink) return <PlaceholderContent />;
  const src = `https://docs.google.com/viewer?url=${encodeURIComponent(webViewLink)}&embedded=true`;
  return (
    <iframe
      src={src}
      className="w-full h-full rounded-lg"
      title="PDF Preview"
    />
  );
}

function VideoPreview({ webViewLink }: { webViewLink: string | undefined }) {
  if (!webViewLink) return <PlaceholderContent />;
  return (
    <div className="flex items-center justify-center w-full h-full p-4">
      <video controls className="max-w-full max-h-full rounded-lg" src={webViewLink}>
        Tu navegador no soporta video.
      </video>
    </div>
  );
}

function GoogleWorkspacePreview({ webViewLink }: { webViewLink: string | undefined }) {
  if (!webViewLink) return <PlaceholderContent />;
  return (
    <iframe
      src={webViewLink}
      className="w-full h-full rounded-lg"
      title="Google Workspace Preview"
    />
  );
}

function TextPreview({ fileId }: { fileId: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetchTextContent(fileId)
      .then(setContent)
      .catch(() => setError(true));
  }, [fileId]);

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full text-gray-500 text-sm">
        No se pudo cargar el contenido.
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full p-4 overflow-auto">
      <pre className="text-sm text-gray-800 font-mono whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-4 border border-gray-200">
        {content}
      </pre>
    </div>
  );
}

function PlaceholderContent({ name, size, webViewLink }: { name?: string; size?: string; webViewLink?: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-3 p-8">
      <span className="text-gray-300" dangerouslySetInnerHTML={{ __html: FILE_ICON }} />
      {name && <p className="text-sm text-gray-500 text-center">{name}</p>}
      {size && <p className="text-xs text-gray-400">{size}</p>}
      {webViewLink && webViewLink !== '#' && (
        <a
          href={webViewLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8] motion-safe:transition-colors active:scale-[0.97]"
        >
          <span dangerouslySetInnerHTML={{ __html: EXTERNAL_ICON }} />
          Abrir en Google Drive
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FilePreview() {
  const file = usePreviewStore((s) => s.file);
  const isOpen = usePreviewStore((s) => s.isOpen);
  const files = usePreviewStore((s) => s.files);
  const currentIndex = usePreviewStore((s) => s.currentIndex);
  const close = usePreviewStore((s) => s.close);
  const next = usePreviewStore((s) => s.next);
  const prev = usePreviewStore((s) => s.prev);

  const hasMultiple = files.length > 1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;
  const mimeLabel = file ? getFileTypeLabel(file.mimeType) : '';

  /* ── Keyboard handlers ──────────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        prev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        next();
      }
    },
    [close, prev, next, hasPrev, hasNext],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  /* ── Backdrop click ─────────────────────────────────────────── */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        close();
      }
    },
    [close],
  );

  const openInDrive = useCallback(() => {
    if (file?.webViewLink && file.webViewLink !== '#') {
      window.open(file.webViewLink, '_blank');
    }
  }, [file]);

  if (!isOpen || !file) return null;

  /* ── Content renderer ───────────────────────────────────────── */
  const renderContent = () => {
    const mt = file.mimeType;

    if (mt.startsWith('image/')) {
      return <ImagePreview src={file.thumbnailLink} />;
    }

    if (mt === 'application/pdf') {
      return <PdfPreview webViewLink={file.webViewLink} />;
    }

    if (mt.startsWith('video/')) {
      return <VideoPreview webViewLink={file.webViewLink} />;
    }

    if (isGoogleWorkspace(mt)) {
      return <GoogleWorkspacePreview webViewLink={file.webViewLink} />;
    }

    if (mt.startsWith('text/')) {
      return <TextPreview fileId={file.id} />;
    }

    return (
      <PlaceholderContent
        name={file.name}
        size={file.size ? formatSize(file.size) : undefined}
        webViewLink={file.webViewLink}
      />
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 motion-safe:animate-fade-in"
      onMouseDown={handleBackdropClick}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] mx-4 bg-white rounded-2xl shadow flex flex-col motion-safe:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#E5E7EB] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold text-[#1F2937] font-display truncate">
              {file.name}
            </h2>
            <span className="shrink-0 px-2 py-0.5 text-[11px] font-medium text-[#6B7280] bg-gray-100 rounded-md uppercase tracking-wider">
              {mimeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={openInDrive}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#2563EB] hover:bg-blue-50 rounded-lg motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
            >
              <span dangerouslySetInnerHTML={{ __html: EXTERNAL_ICON }} />
              Abrir en Drive
            </button>
            <button
              onClick={close}
              className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg motion-safe:transition-[color,background-color] active:scale-[0.97] cursor-pointer"
              aria-label="Cerrar"
            >
              <span dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </div>

        {/* ── Footer (navigation) ── */}
        {hasMultiple && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#E5E7EB] shrink-0 bg-gray-50/50 rounded-b-2xl">
            <button
              onClick={prev}
              disabled={!hasPrev}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg motion-safe:transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.97] cursor-pointer"
            >
              <span dangerouslySetInnerHTML={{ __html: ARROW_LEFT }} />
              Anterior
            </button>
            <span className="text-xs text-gray-400 font-body">
              {currentIndex + 1} de {files.length}
            </span>
            <button
              onClick={next}
              disabled={!hasNext}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg motion-safe:transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.97] cursor-pointer"
            >
              Siguiente
              <span dangerouslySetInnerHTML={{ __html: ARROW_RIGHT }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
