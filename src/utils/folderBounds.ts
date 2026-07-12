import { type Node } from '@xyflow/react';
import type { CanvasNodeData } from '../stores/canvasStore';

/**
 * Check if an item's bounding box is inside a folder's bounding box.
 *
 * Item is considered "inside" if its center point falls within the folder's
 * visual area. Uses a small tolerance (gap) so items that are exactly on the
 * edge are still considered inside.
 */
export function isInsideFolder(
  itemPosition: { x: number; y: number },
  itemSize: { width: number; height: number },
  folderPosition: { x: number; y: number },
  folderSize: { width: number; height: number },
): boolean {
  const GAP = 10; // px of tolerance

  // Item center
  const itemCenterX = itemPosition.x + itemSize.width / 2;
  const itemCenterY = itemPosition.y + itemSize.height / 2;

  // Folder bounding box (padded with tolerance)
  const folderLeft = folderPosition.x - GAP;
  const folderRight = folderPosition.x + folderSize.width + GAP;
  const folderTop = folderPosition.y - GAP;
  const folderBottom = folderPosition.y + folderSize.height + GAP;

  return (
    itemCenterX >= folderLeft &&
    itemCenterX <= folderRight &&
    itemCenterY >= folderTop &&
    itemCenterY <= folderBottom
  );
}

/**
 * Find which folder (if any) contains the given node position.
 * Returns the folder node or null if no folder contains it.
 * Excludes the node itself (a folder can't contain itself).
 */
export function findContainingFolder(
  node: Node<CanvasNodeData>,
  allNodes: Node<CanvasNodeData>[],
  nodeSizes: Map<string, { width: number; height: number }>,
): Node<CanvasNodeData> | null {
  for (const folder of allNodes) {
    if (folder.type !== 'folderNode') continue;
    if (folder.id === node.id) continue;

    const folderPos = folder.position ?? { x: 0, y: 0 };
    const folderSize = nodeSizes.get(folder.id) ?? { width: 640, height: 320 };
    const itemSize = nodeSizes.get(node.id) ?? { width: 180, height: 170 };

    if (isInsideFolder(node.position, itemSize, folderPos, folderSize)) {
      return folder;
    }
  }
  return null;
}

/**
 * Get all nodes that are inside a given folder (by bounds checking).
 */
export function getChildrenInFolder(
  folderId: string,
  allNodes: Node<CanvasNodeData>[],
  nodeSizes: Map<string, { width: number; height: number }>,
): Node<CanvasNodeData>[] {
  const folder = allNodes.find((n) => n.id === folderId);
  if (!folder) return [];

  const folderPos = folder.position ?? { x: 0, y: 0 };
  const folderSize = nodeSizes.get(folderId) ?? { width: 640, height: 320 };

  return allNodes.filter((n) => {
    if (n.id === folderId) return false;
    const itemSize = nodeSizes.get(n.id) ?? { width: 180, height: 170 };
    return isInsideFolder(n.position, itemSize, folderPos, folderSize);
  });
}
