import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface AppLayoutProps {
  /** Tab bar rendered at the top */
  tabBar: ReactNode;
  /** Sidebar panel (left) */
  sidebar: ReactNode;
  /** Toolbar (horizontal bar above canvas) */
  toolbar: ReactNode;
  /** Main canvas content */
  canvas: ReactNode;
  /** Status bar rendered at the bottom */
  statusBar: ReactNode;
}

/**
 * AppLayout — Layout shell that orchestrates the full workspace UI.
 *
 * ┌──────────────────────────────────────────┐
 * │ TabBar                                    │
 * ├───────┬──────────────────────────────────┤
 * │       │  Toolbar                          │
 * │ Side  ├──────────────────────────────────┤
 * │ bar   │                                   │
 * │       │       Canvas (React Flow)         │
 * │       │                                   │
 * ├───────┴──────────────────────────────────┤
 * │ StatusBar                                 │
 * └──────────────────────────────────────────┘
 */
export default function AppLayout({
  tabBar,
  sidebar,
  toolbar,
  canvas,
  statusBar,
}: AppLayoutProps) {
  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-50 flex flex-col">
      {tabBar}
      <div className="flex flex-1 overflow-hidden">
        {sidebar}
        <main className="flex flex-col flex-1 min-w-0">
          {toolbar}
          <div className="flex-1 relative">{canvas}</div>
        </main>
      </div>
      {statusBar}
    </div>
  );
}
