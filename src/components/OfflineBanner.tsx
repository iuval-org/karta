/**
 * OfflineBanner — Shows a banner at the top when offline.
 *
 * - Appears immediately when connectivity store says offline
 * - Disappears 3 seconds after coming back online
 */

import { useEffect, useState } from 'react';
import { useConnectivityStore } from '../stores/connectivityStore';

/* ------------------------------------------------------------------ */
/*  Icon (Heroicons v2 solid 20×20 — wifi-slash / signal-slash)        */
/* ------------------------------------------------------------------ */

const WIFI_OFF_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M4.173 12.057a.75.75 0 011.057-.084 5.504 5.504 0 019.54 0 .75.75 0 11-1.057.084 4.004 4.004 0 00-7.426 0 .75.75 0 01-1.114.943v-.943zM2.47 9.319a.75.75 0 011.056-.092 8.508 8.508 0 0112.95 0 .75.75 0 11-1.055.092 7.008 7.008 0 00-10.89 0 .75.75 0 01-1.061-.01v.01zM10 16a1 1 0 100-2 1 1 0 000 2z"/><path fillRule="evenodd" d="M16.28 3.72a.75.75 0 010 1.06l-11.5 11.5a.75.75 0 01-1.06-1.06l11.5-11.5a.75.75 0 011.06 0z" clipRule="evenodd"/></svg>`;

const WIFI_ON_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M.676 6.941A12.964 12.964 0 0110 3c3.657 0 6.963 1.508 9.324 3.941a.75.75 0 01-.008 1.053l-.353.354a.75.75 0 01-1.069-.008C15.894 6.28 13.097 5 10 5 6.903 5 4.106 6.28 2.106 8.34a.75.75 0 01-1.069.008l-.353-.354a.75.75 0 01-.008-1.053zm2.825 2.833A8.976 8.976 0 0110 8a8.976 8.976 0 016.499 2.774.75.75 0 01-.011 1.049l-.354.354a.75.75 0 01-1.072-.012A6.978 6.978 0 0010 10.5c-1.87 0-3.586.736-4.85 1.936a.75.75 0 01-1.072.012l-.354-.354a.75.75 0 01-.01-1.05zm2.86 2.857A5.006 5.006 0 0110 10.5c1.317 0 2.525.508 3.429 1.342l1.33 1.33c.098.098.123.248.082.37a.498.498 0 01-.341.34.375.375 0 01-.37-.081l-.264-.263A4.005 4.005 0 0010 12c-.87 0-1.68.277-2.33.746l-.267.266a.374.374 0 01-.369.083.498.498 0 01-.341-.34.374.374 0 01.082-.37l.59-.588zm3.639 1.369a2.003 2.003 0 012.595 0l.586.586c.098.098.123.248.082.37a.498.498 0 01-.341.34.374.374 0 01-.37-.081l-.263-.263A1.002 1.002 0 0011 14.5a1 1 0 01-2 0 1.003 1.003 0 011.64-.758l.264.264a.374.374 0 01-.37.082.498.498 0 01-.341-.34.374.374 0 01.082-.37l.586-.586z" clipRule="evenodd"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OfflineBanner() {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const [visible, setVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  // Track whether we've ever been offline during this session
  useEffect(() => {
    if (!isOnline) {
      setShouldShow(true);
      setVisible(true);
    } else if (shouldShow) {
      // Coming back online: keep visible for 3 seconds, then dismiss
      const timer = setTimeout(() => {
        setVisible(false);
        // Reset shouldShow after animation completes
        setTimeout(() => setShouldShow(false), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, shouldShow]);

  if (!shouldShow) return null;

  return (
    <div
      className={[
        'fixed top-0 left-0 right-0 z-[90] flex items-center justify-center gap-2 px-4 py-2',
        'motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-in-out',
        'motion-reduce:transition-none',
        isOnline
          ? 'bg-green-100 border-b border-green-200 text-green-800'
          : 'bg-amber-50 border-b border-amber-200 text-amber-800',
        visible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-full opacity-0',
      ].join(' ')}
      role="alert"
    >
      <span className="shrink-0">
        <span
          dangerouslySetInnerHTML={{
            __html: isOnline ? WIFI_ON_ICON : WIFI_OFF_ICON,
          }}
        />
      </span>

      <span className="text-sm font-body font-medium">
        {isOnline
          ? 'Conexión restaurada — los cambios se sincronizan'
          : 'Sin conexión — los cambios se guardarán localmente'}
      </span>
    </div>
  );
}
