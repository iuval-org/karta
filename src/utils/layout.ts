import type { DriveItem } from '../types/drive';

export interface GridNode {
  id: string;
  position: { x: number; y: number };
  data: DriveItem;
}

/**
 * Calcula posiciones de grilla para un conjunto de items de Drive.
 *
 * - Folders primero, luego files (orden alfabético dentro de cada grupo)
 * - Indexación matricial: x = (index % columns) * gapX, y = floor(index / columns) * gapY
 * - Default: 6 columns, gapX=220, gapY=160
 */
export function calcGridLayout(
  items: DriveItem[],
  columns = 6,
  gapX = 220,
  gapY = 160,
): GridNode[] {
  const sorted = [...items].sort((a, b) => {
    // Folders first
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    // Alphabetical within each group
    return a.name.localeCompare(b.name);
  });

  return sorted.map((item, index) => ({
    id: item.id,
    position: {
      x: (index % columns) * gapX,
      y: Math.floor(index / columns) * gapY,
    },
    data: item,
  }));
}
