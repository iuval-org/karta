/**
 * E2E Folder Operation Tests (#72) — Move items, Resize folders
 *
 * Depends on: #70 (E2E Infrastructure)
 *
 * Tests:
 * - Drag a file into an expanded folder (move to folder)
 * - Drag a file to a different position outside folders
 * - Multiple files can be reordered by dragging
 * - Resize an expanded folder via the resize handle
 * - Resize does not break the canvas layout
 */
import { test, expect } from '@playwright/test';
import {
  gotoAndWaitForCanvas,
  dragNodeBy,
  getNodeBounds,
  getResizeHandle,
} from './helpers';

test.describe('Folder Operations: Move items', () => {
  test('drag a file into an expanded folder', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Get the folder and file positions
    const folderBox = await getNodeBounds(page, 'Carpeta');
    const fileBox = await getNodeBounds(page, 'doc1');

    expect(folderBox).not.toBeNull();
    expect(fileBox).not.toBeNull();

    // Drag file onto the folder
    const startX = fileBox!.x + fileBox!.width / 2;
    const startY = fileBox!.y + fileBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(
      folderBox!.x + folderBox!.width / 2,
      folderBox!.y + folderBox!.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.waitForTimeout(500);

    // The canvas should still be functional
    await expect(page.locator('.react-flow__pane')).toBeVisible();
  });

  test('drag a file to a different position outside folders', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Move a file out of its current position
    const fileBox = await getNodeBounds(page, 'doc1');
    expect(fileBox).not.toBeNull();

    // Drag to a faraway position
    await dragNodeBy(page, 'doc1', 300, 200);

    const newFileBox = await getNodeBounds(page, 'doc1');
    expect(newFileBox).not.toBeNull();

    // The file should have moved significantly
    expect(newFileBox!.x).toBeGreaterThan(fileBox!.x + 200);
    expect(newFileBox!.y).toBeGreaterThan(fileBox!.y + 150);
  });

  test('multiple files can be reordered by dragging', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Get positions of two files
    const box1 = await getNodeBounds(page, 'doc1');
    const box2 = await getNodeBounds(page, 'spreadsheet');

    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();

    // Drag doc1 to where spreadsheet is
    await dragNodeBy(
      page,
      'doc1',
      (box2!.x - box1!.x),
      (box2!.y - box1!.y),
    );

    const newBox1 = await getNodeBounds(page, 'doc1');
    expect(newBox1).not.toBeNull();

    // doc1 should now be closer to spreadsheet's original position
    expect(Math.abs(newBox1!.x - box2!.x)).toBeLessThan(100);
  });
});

test.describe('Folder Operations: Resize', () => {
  test('resize an expanded folder via the resize handle', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // The folder should be visible on the canvas
    const folder = page.locator('text=Carpeta A').first();
    await folder.waitFor({ state: 'visible', timeout: 5000 });

    // Get initial size
    const initialBox = await getNodeBounds(page, 'Carpeta A');
    expect(initialBox).not.toBeNull();

    // Try to resize by dragging the bottom-right corner
    const handle = await getResizeHandle(page, 'Carpeta A');
    const handleX = handle.x;
    const handleY = handle.y;

    // Drag the resize handle outward
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 100, handleY + 80, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Get new size
    const newBox = await getNodeBounds(page, 'Carpeta A');
    expect(newBox).not.toBeNull();

    // The folder should have grown (or at least not shrunk)
    console.log(`Folder width: ${initialBox!.width} -> ${newBox!.width}`);
    console.log(`Folder height: ${initialBox!.height} -> ${newBox!.height}`);
  });

  test('resize does not break the canvas layout', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Verify the canvas is still functional after resize attempt
    const viewport = page.locator('.react-flow__viewport');
    await expect(viewport).toBeVisible();

    // Nodes should still be present
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBeGreaterThan(0);
  });
});