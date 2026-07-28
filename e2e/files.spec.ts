/**
 * E2E File Operation Tests (#72) — Rename operations
 *
 * Depends on: #70 (E2E Infrastructure)
 *
 * Tests:
 * - Double-click on a file opens inline rename input
 * - Enter confirms the rename
 * - Escape cancels the rename
 * - Blur confirms the rename
 * - Rename with empty name should not be confirmed
 * - Rename of a folder (same mechanics)
 */
import { test, expect } from '@playwright/test';
import { gotoAndWaitForCanvas, startRename, confirmRename, cancelRename } from './helpers';

test.describe('File Operations: Rename', () => {
  test('double-click on a file activates inline rename input', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Double-click on a file node's text
    const input = await startRename(page, 'doc1');
    await expect(input).toBeVisible();
  });

  test('rename input has the current file name as value', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    const input = await startRename(page, 'doc1');
    await expect(input).toBeVisible();

    const value = await input.inputValue();
    expect(value).toContain('doc1');
  });

  test('pressing Enter confirms the rename', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Start rename
    const input = await startRename(page, 'doc1');
    await expect(input).toBeVisible();

    // Change the name
    await input.fill('nuevo-nombre.md');
    await confirmRename(page);

    // The input should disappear
    await expect(input).not.toBeVisible({ timeout: 3000 });
  });

  test('pressing Escape cancels the rename', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Start rename
    const input = await startRename(page, 'doc1');
    await expect(input).toBeVisible();

    // Type a new name
    await input.fill('cancelled-name.md');

    // Press Escape to cancel
    await cancelRename(page);

    // The input should be gone
    await expect(input).not.toBeVisible({ timeout: 3000 });
  });

  test('blur (clicking outside) confirms the rename', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Start rename
    const input = await startRename(page, 'doc1');
    await expect(input).toBeVisible();

    // Change the name
    await input.fill('blur-confirmed.md');

    // Click on the canvas pane to blur the input
    const pane = page.locator('.react-flow__pane');
    await pane.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);

    // The input should disappear (blur confirms in FileNode)
    await expect(input).not.toBeVisible({ timeout: 3000 });
  });

  test('rename with empty name closes without error', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Start rename
    const input = await startRename(page, 'doc1');
    await expect(input).toBeVisible();

    // Clear the input
    await input.fill('');

    // Try to confirm
    await confirmRename(page);

    // The input should disappear (empty name = no-op, component closes)
    await expect(input).not.toBeVisible({ timeout: 3000 });
  });

  test('double-click on a folder opens rename input too', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Double-click on a folder node
    const input = await startRename(page, 'Carpeta A');
    await expect(input).toBeVisible();

    // The input should have the folder name as value
    const value = await input.inputValue();
    expect(value).toContain('Carpeta');
  });

  test('rename does not crash the app', async ({ page }) => {
    await gotoAndWaitForCanvas(page);

    // Start and confirm a rename
    const input = await startRename(page, 'doc1');
    await expect(input).toBeVisible();
    await input.fill('renamed-file.md');
    await confirmRename(page);
    await page.waitForTimeout(500);

    // The canvas should still be functional
    const viewport = page.locator('.react-flow__viewport');
    await expect(viewport).toBeVisible();
  });
});