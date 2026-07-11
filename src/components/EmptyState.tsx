/**
 * EmptyState — Displays when there's nothing to show.
 *
 * Props:
 * - icon: Heroicon SVG string (defaults to folder-open)
 * - title: Heading text
 * - description: Subtitle / explanation
 * - action: Optional button config { label, onClick }
 */

/* ------------------------------------------------------------------ */
/*  Default icons (Heroicons v2 solid 20×20)                          */
/* ------------------------------------------------------------------ */

const DEFAULT_ICON_FOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="48" height="48"><path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z"/></svg>`;

const DEFAULT_ICON_FOLDER_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="48" height="48"><path d="M4.75 3A1.75 1.75 0 003 4.75v2.752l.104-.002h13.792c.035 0 .07 0 .104.002V6.75A1.75 1.75 0 0015.25 5h-3.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H4.75zM3.104 9a1.75 1.75 0 00-1.673 2.265l1.385 4.5A1.75 1.75 0 004.488 17h11.023a1.75 1.75 0 001.673-1.235l1.384-4.5A1.75 1.75 0 0016.896 9H3.104z"/></svg>`;

const SEARCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="48" height="48"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type EmptyStateIcon = 'folder' | 'folder-open' | 'search';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: EmptyStateIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

/* ------------------------------------------------------------------ */
/*  Icon map                                                           */
/* ------------------------------------------------------------------ */

function getIconHtml(icon: EmptyStateIcon): string {
  switch (icon) {
    case 'folder':
      return DEFAULT_ICON_FOLDER;
    case 'folder-open':
      return DEFAULT_ICON_FOLDER_OPEN;
    case 'search':
      return SEARCH_ICON;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EmptyState({
  icon = 'folder-open',
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-8 select-none">
      <div className="text-gray-300 mb-4">
        <span dangerouslySetInnerHTML={{ __html: getIconHtml(icon) }} />
      </div>

      <h3 className="text-base font-semibold text-gray-600 mb-1">
        {title}
      </h3>

      <p className="text-sm text-gray-400 text-center max-w-xs mb-4">
        {description}
      </p>

      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 motion-safe:transition-colors active:scale-[0.97] cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
