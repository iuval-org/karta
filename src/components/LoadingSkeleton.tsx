/**
 * LoadingSkeleton — Skeleton grid for the canvas initial load.
 *
 * Shows a 3×3-ish grid of pulsing rectangles to indicate loading.
 * Cards vary in width to simulate folders (wider) vs files (narrower).
 */

/* ------------------------------------------------------------------ */
/*  Card config                                                        */
/* ------------------------------------------------------------------ */

interface SkeletonCard {
  width: string;
  height: string;
  /** Which grid column this card starts at (1-indexed, CSS grid). */
  colSpan: number;
}

const SKELETON_CARDS: SkeletonCard[] = [
  { width: '180px', height: '100px', colSpan: 1 },
  { width: '260px', height: '100px', colSpan: 2 },
  { width: '180px', height: '100px', colSpan: 1 },
  { width: '180px', height: '100px', colSpan: 1 },
  { width: '180px', height: '100px', colSpan: 1 },
  { width: '260px', height: '100px', colSpan: 2 },
  { width: '260px', height: '100px', colSpan: 2 },
  { width: '180px', height: '100px', colSpan: 1 },
  { width: '180px', height: '100px', colSpan: 1 },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LoadingSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center p-8">
      <div className="grid grid-cols-4 gap-4 max-w-3xl w-full">
        {SKELETON_CARDS.map((card, idx) => (
          <div
            key={idx}
            className="bg-gray-200 rounded-xl animate-pulse motion-reduce:animate-none"
            style={{
              width: card.width,
              height: card.height,
              gridColumn: `span ${card.colSpan}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
