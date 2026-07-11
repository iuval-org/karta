import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// JSDOM polyfills / mocks
// ---------------------------------------------------------------------------

// Mock matchMedia (needed by some components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ---------------------------------------------------------------------------
// Auto-fire script onload events.
// In jsdom, <script> elements are created but never loaded.
// The real loadDriveApi() in drive.ts creates a script element and
// awaits its onload. We intercept createElement to fire onload
// immediately for gapi script elements.
// ---------------------------------------------------------------------------

const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation(
  (tagName: string, options?: ElementCreationOptions) => {
    const el = originalCreateElement(tagName, options);
    if (tagName.toLowerCase() === 'script') {
      // Fire onload asynchronously so loadDriveApi's promise resolves
      setTimeout(() => {
        if (el.onload) {
          (el.onload as (this: GlobalEventHandlers, ev: Event) => void)(new Event('load'));
        }
      }, 0);
    }
    return el;
  },
);

// ---------------------------------------------------------------------------
// Global gapi mock
// ---------------------------------------------------------------------------

const mockGapi = {
  load: vi.fn((_api: string, settings: { callback: () => void }) => {
    settings.callback();
  }),
  client: {
    setToken: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    drive: {
      files: {
        list: vi.fn().mockResolvedValue({ result: { files: [] } }),
        get: vi.fn().mockResolvedValue({ result: {} }),
        create: vi.fn().mockResolvedValue({ result: {} }),
        update: vi.fn().mockResolvedValue({ result: {} }),
      },
    },
  },
};

Object.defineProperty(window, 'gapi', {
  writable: true,
  value: mockGapi,
});

// ---------------------------------------------------------------------------
// SessionStorage mock for JSDOM
// ---------------------------------------------------------------------------

afterEach(() => {
  sessionStorage.clear();
});
