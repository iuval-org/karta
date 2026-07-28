/**
 * E2E Infrastructure (#70) — Verifies Playwright + Auth Mocking + Fixtures
 */
import { test, expect } from '@playwright/test';
import { setupE2eEnvironment, waitForCanvasReady } from './helpers';

test.describe('E2E Infrastructure', () => {
  test('app loads without console errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await setupE2eEnvironment(page);
    await page.goto('/');
    await waitForCanvasReady(page);

    // No page errors (Firebase console warnings are expected)
    expect(pageErrors.length).toBe(0);
    expect(page.locator('#root')).not.toBeNull();
  });

  test('auth state is injected via E2E bridge', async ({ page }) => {
    await setupE2eEnvironment(page);
    await page.goto('/');
    await waitForCanvasReady(page);

    const authState = await page.evaluate(() => {
      const stores = (window as any).__kartaStores;
      if (!stores) return null;
      return stores.getAuthStore();
    });

    expect(authState).not.toBeNull();
    expect(authState.user).not.toBeNull();
    expect(authState.user.email).toBe('test@example.com');
    expect(authState.isLoading).toBe(false);
  });

  test('root folder is set in store', async ({ page }) => {
    await setupE2eEnvironment(page);
    await page.goto('/');
    await waitForCanvasReady(page);

    const rootState = await page.evaluate(() => {
      const stores = (window as any).__kartaStores;
      if (!stores) return null;
      return stores.getRootStore();
    });

    expect(rootState).not.toBeNull();
    expect(rootState.rootFolderId).toBe('root_mock');
    expect(rootState.rootFolderName).toBe('Karta');
  });

  test('canvas renders with nodes from Drive mock', async ({ page }) => {
    await setupE2eEnvironment(page);
    await page.goto('/');
    await waitForCanvasReady(page);

    // Check that nodes exist on the canvas
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBeGreaterThanOrEqual(1);

    // Check that specific mock items appear
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
  });
});