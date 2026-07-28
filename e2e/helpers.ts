import type { Page } from '@playwright/test';
import { ALL_ITEMS } from './fixtures/driveData';

// ---------------------------------------------------------------------------
// E2E environment setup
// ---------------------------------------------------------------------------

/**
 * Sets up the E2E environment before the page loads.
 * Call BEFORE page.goto().
 *
 * Strategy:
 * - `addInitScript` sets `__KARTA_E2E__` flag + localStorage
 * - `page.route()` intercepts ALL Google API calls and returns mock data
 * - The real gapi loads from CDN but its API calls are intercepted
 * - The `src/e2e-bridge.ts` injects auth state into Zustand stores
 */
export async function setupE2eEnvironment(page: Page) {
  // Set E2E flag + localStorage before any app code runs
  await page.addInitScript(() => {
    (window as any).__KARTA_E2E__ = true;
    localStorage.setItem('karta_oauth_token', 'fake-token');
    localStorage.setItem('karta_root_folder', 'root_mock');
  });

  // ── Intercept Drive API v3 calls ──
  await page.route('**/drive/v3/files**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      const urlObj = new URL(url);
      const q = urlObj.searchParams.get('q') || '';

      // Match parent query: 'root_mock' in parents
      const parentMatch = q.match(/'([^']+)' in parents/);
      if (parentMatch) {
        const parentId = parentMatch[1];
        const children = ALL_ITEMS.filter((i) => i.parentId === parentId);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: children.map((item) => ({
              id: item.id,
              name: item.name,
              mimeType: item.mimeType,
              webViewLink: item.webViewLink,
              webContentLink: item.webContentLink,
              modifiedTime: item.modifiedTime,
              size: item.size,
              fileExtension: item.fileExtension,
              parents: item.parentId ? [item.parentId] : [],
            })),
            nextPageToken: null,
          }),
        });
      }

      // Fallback: return all items
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: ALL_ITEMS.map((item) => ({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            webViewLink: item.webViewLink,
            webContentLink: item.webContentLink,
            modifiedTime: item.modifiedTime,
            size: item.size,
            fileExtension: item.fileExtension,
            parents: item.parentId ? [item.parentId] : [],
          })),
          nextPageToken: null,
        }),
      });
    }

    if (method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'new_file_' + Date.now(),
          name: 'New file',
          mimeType: 'application/octet-stream',
          webViewLink: '#',
          modifiedTime: new Date().toISOString(),
        }),
      });
    }

    if (method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }

    // Default: return empty
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files: [] }),
    });
  });

  // ── Intercept Firestore (canvas persistence) ──
  await page.route('**/firestore.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // ── Intercept Firebase Auth ──
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/securetoken.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/firebaseinstallations.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // ── Intercept Google OAuth ──
  await page.route('**/oauth2.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });
  });
}

/**
 * Inject auth state into the E2E bridge stores (mid-test).
 */
export async function injectAuthState(page: Page) {
  await page.evaluate(() => {
    const stores = (window as any).__kartaStores;
    if (stores) {
      stores.setAuthUser({
        uid: 'e2e-user',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
      });
      stores.setRootFolder('root_mock', 'Karta');
    }
  });
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the React Flow canvas to be ready and nodes to appear.
 * Retries until nodes are found or timeout.
 */
export async function waitForCanvasReady(page: Page) {
  // Wait for the React Flow pane to appear
  await page.waitForSelector('.react-flow__pane', { timeout: 15000 });
  // Wait for node elements to exist
  await page.waitForSelector('.react-flow__node', { timeout: 15000 }).catch(() => {});
  // Give the app time to load items via gapi and hydrate
  await page.waitForTimeout(3000);
}

/**
 * Navigate to the app and wait for the canvas with nodes.
 */
export async function gotoAndWaitForCanvas(page: Page) {
  await setupE2eEnvironment(page);
  await page.goto('/');
  await waitForCanvasReady(page);
}

// ---------------------------------------------------------------------------
// Node helpers
// ---------------------------------------------------------------------------

export async function getNodeBounds(page: Page, text: string) {
  const node = page.locator(`text=${text}`).first();
  return node.boundingBox();
}

export async function dragNodeBy(page: Page, text: string, dx: number, dy: number) {
  const box = await getNodeBounds(page, text);
  if (!box) throw new Error(`Node "${text}" not found`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
}

export async function getCanvasTransform(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector('.react-flow__viewport');
    return vp?.getAttribute('transform');
  });
}

// ---------------------------------------------------------------------------
// Rename helpers
// ---------------------------------------------------------------------------

export async function startRename(page: Page, nodeText: string) {
  const node = page.locator(`text=${nodeText}`).first();
  const box = await node.boundingBox();
  if (!box) throw new Error(`Node "${nodeText}" not found`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 });
  await page.waitForTimeout(500);
  // Return the rename input (inside React Flow node) — has unique font-display class
  return page.locator('.react-flow__node input[class*="font-display"]').first();
}

export async function confirmRename(page: Page) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

export async function cancelRename(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Folder helpers
// ---------------------------------------------------------------------------

export async function getResizeHandle(page: Page, folderText: string) {
  const box = await getNodeBounds(page, folderText);
  if (!box) throw new Error(`Folder "${folderText}" not found`);
  return { x: box.x + box.width - 5, y: box.y + box.height - 5 };
}

export async function getSelectedCount(page: Page) {
  return page.evaluate(() => {
    const stores = (window as any).__kartaStores;
    if (!stores) return -1;
    return stores.getCanvasStore().selectedNodeIds?.length || 0;
  });
}