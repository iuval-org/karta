import { useMemo } from 'react';
import { useStore } from '@xyflow/react';
import { useCanvasStore } from '../stores/canvasStore';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StatusBar() {
  const nodes = useCanvasStore((s) => s.nodes);
  const allItems = useCanvasStore((s) => s.allItems);

  // Reactive zoom from the ReactFlow internal store
  const zoom = useStore((s) => s.transform[2]);

  const fileCount = useMemo(
    () => nodes.filter((n) => n.type === 'fileNode').length,
    [nodes],
  );

  const folderCount = useMemo(() => {
    const parentIds = new Set(allItems.filter((i) => i.parentId).map((i) => i.parentId));
    return parentIds.size;
  }, [allItems]);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <footer className="flex items-center justify-between px-4 py-0.5 bg-gray-50 border-t border-gray-200 select-none">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-body text-gray-400 font-medium">
          Items: {fileCount}
        </span>
        <span className="text-gray-300 select-none" aria-hidden="true">
          |
        </span>
        <span className="text-[11px] font-body text-gray-400 font-medium">
          Carpetas: {folderCount}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[11px] font-body text-gray-400 font-medium">
          Zoom: {zoomPercent}%
        </span>
        <span className="text-gray-300 select-none" aria-hidden="true">
          |
        </span>
        <span className="text-[11px] font-body text-gray-400">
          v0.1.0
        </span>
      </div>
    </footer>
  );
}
