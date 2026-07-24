import { useCallback } from 'react';
import { CREATE_MIME_TYPES } from '../services/drive';

/* ------------------------------------------------------------------ */
/*  Drag items — same as before, only icons retained                   */
/* ------------------------------------------------------------------ */

interface DragItem {
  label: string;
  mimeType: string;
  icon: string;
  color: string;
}

const DRAG_ITEMS: DragItem[] = [
  {
    label: 'Carpeta',
    mimeType: CREATE_MIME_TYPES.folder,
    color: 'text-amber-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z"/></svg>`,
  },
  {
    label: 'Documento',
    mimeType: CREATE_MIME_TYPES.document,
    color: 'text-blue-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.414A1.5 1.5 0 0016.328 6.2l-4.124-4.124A1.5 1.5 0 0011.172 2H4.5zm4.75 4.5a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm0 3a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zm0 3a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" clipRule="evenodd"/></svg>`,
  },
  {
    label: 'Planilla',
    mimeType: CREATE_MIME_TYPES.spreadsheet,
    color: 'text-green-600',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path fillRule="evenodd" d="M3 3.5A1.5 1.5 0 014.5 2h11A1.5 1.5 0 0117 3.5v13A1.5 1.5 0 0115.5 18h-11A1.5 1.5 0 013 16.5v-13zM5 5a1 1 0 011-1h8a1 1 0 011 1v2a1 1 0 01-1 1H6a1 1 0 01-1-1V5zm0 5a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H6a1 1 0 01-1-1v-5z" clipRule="evenodd"/></svg>`,
  },
  {
    label: 'Slides',
    mimeType: CREATE_MIME_TYPES.presentation,
    color: 'text-orange-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path fillRule="evenodd" d="M2 3.75A.75.75 0 012.75 3h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd"/></svg>`,
  },
  {
    label: 'Nota adhesiva',
    mimeType: 'application/x-karta-sticky-note',
    color: 'text-yellow-500',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><rect x="4" y="4" width="16" height="16" rx="2" fill="#FEF08A" stroke="#EAB308" strokeWidth="1.5"/><path d="M4 10h16M10 4v16" stroke="#EAB308" strokeWidth="1" fill="none"/></svg>`,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Sidebar() {
  const handleDragStart = useCallback(
    (e: React.DragEvent, item: DragItem) => {
      if (item.mimeType === 'application/x-karta-sticky-note') {
        e.dataTransfer.setData('application/x-karta-sticky-note', 'true');
      } else {
        e.dataTransfer.setData('application/karta-type', item.mimeType);
      }
      e.dataTransfer.effectAllowed = 'copy';

      // Color de acento por tipo
      const ACCENT: Record<string, string> = {
        'application/vnd.google-apps.folder': '#3B82F6',
        'application/vnd.google-apps.document': '#2563EB',
        'application/vnd.google-apps.spreadsheet': '#059669',
        'application/vnd.google-apps.presentation': '#EA580C',
        'application/x-karta-sticky-note': '#EAB308',
      };
      const accent = ACCENT[item.mimeType] ?? '#3B82F6';

      // Preview realista del nodo como se verá en el canvas
      const ghost = document.createElement('div');
      ghost.style.cssText = [
        'position:absolute',
        'top:-1000px',
        'left:-1000px',
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:8px 12px',
        'background:white',
        'border:1px solid #e5e7eb',
        `border-left:3px solid ${accent}`,
        'border-radius:8px',
        'box-shadow:0 4px 12px rgba(0,0,0,0.1)',
        'font-family:Nunito,system-ui,sans-serif',
        'font-size:13px',
        'font-weight:600',
        'color:#1f2937',
        'white-space:nowrap',
        'pointer-events:none',
        'line-height:1',
      ].join(';');

      ghost.innerHTML = `<span style="display:inline-flex;align-items:center;color:${accent}">${item.icon}</span><span>${item.label}</span>`;
      document.body.appendChild(ghost);

      const rect = ghost.getBoundingClientRect();
      e.dataTransfer.setDragImage(ghost, Math.round(rect.width / 2), Math.round(rect.height / 2));

      setTimeout(() => document.body.removeChild(ghost), 0);
    },
    [],
  );

  return (
    <div
      className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 bg-white rounded-xl px-2 py-3"
      style={{ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)' }}
      aria-label="Barra de componentes"
    >
      {DRAG_ITEMS.map((item) => (
        <div
          key={item.mimeType}
          draggable
          onDragStart={(e) => handleDragStart(e, item)}
          className={`flex items-center justify-center w-10 h-10 rounded-lg cursor-grab active:cursor-grabbing motion-safe:transition-colors hover:bg-gray-100 ${item.color}`}
          title={item.label}
          aria-label={item.label}
        >
          <span dangerouslySetInnerHTML={{ __html: item.icon }} />
        </div>
      ))}
    </div>
  );
}