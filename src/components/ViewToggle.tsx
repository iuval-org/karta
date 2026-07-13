import { useViewStore, type ViewMode } from '../stores/viewStore';

const CANVAS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h11.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2H4.25zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm7 0A2.25 2.25 0 009 13.25v2.5A2.25 2.25 0 0011.25 18h2.5A2.25 2.25 0 0016 15.75v-2.5A2.25 2.25 0 0013.75 11h-2.5z" clip-rule="evenodd"/></svg>`;

const GRID_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clip-rule="evenodd"/></svg>`;

const LIST_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clip-rule="evenodd"/></svg>`;

const MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'canvas', label: 'Canvas', icon: CANVAS_ICON },
  { key: 'grid', label: 'Grilla', icon: GRID_ICON },
  { key: 'list', label: 'Lista', icon: LIST_ICON },
];

export default function ViewToggle() {
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);

  return (
    <div className="flex items-center bg-white rounded-xl shadow-sm border border-gray-200 p-0.5 gap-0.5">
      {MODES.map((m) => {
        const isActive = mode === m.key;
        return (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium motion-safe:transition-colors active:scale-[0.97] cursor-pointer ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={m.label}
          >
            <span
              className={isActive ? 'text-blue-600' : 'text-gray-400'}
              dangerouslySetInnerHTML={{ __html: m.icon }}
            />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
