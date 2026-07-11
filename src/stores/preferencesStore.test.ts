import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePreferencesStore } from './preferencesStore';

// Mock db module
const mockSettingsGet = vi.fn();
const mockSettingsPut = vi.fn();
const mockSettingsBulkGet = vi.fn();

vi.mock('../services/db', () => ({
  db: {
    settings: {
      get: (...args: any[]) => mockSettingsGet(...args),
      put: (...args: any[]) => mockSettingsPut(...args),
      bulkGet: (...args: any[]) => mockSettingsBulkGet(...args),
      bulkPut: vi.fn().mockResolvedValue(undefined),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    positions: {
      where: vi.fn(() => ({ equals: vi.fn().mockResolvedValue([]) })),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    edges: {
      where: vi.fn(() => ({ equals: vi.fn().mockResolvedValue([]) })),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    folderState: {
      where: vi.fn(() => ({ equals: vi.fn().mockResolvedValue([]) })),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    tabs: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset store defaults
  usePreferencesStore.setState({
    snapToGrid: true,
    showMinimap: true,
    showBackground: true,
    zoomOnScroll: true,
    sidebarOpen: true,
    showBreadcrumb: true,
    locale: 'es',
    loaded: false,
  });
});

describe('Preferences store', () => {
  it('carga defaults si no hay datos en Dexie', async () => {
    mockSettingsBulkGet.mockResolvedValue([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);

    await usePreferencesStore.getState().load();

    const state = usePreferencesStore.getState();
    expect(state.snapToGrid).toBe(true);
    expect(state.showMinimap).toBe(true);
    expect(state.locale).toBe('es');
    expect(state.loaded).toBe(true);
  });

  it('carga valores guardados desde Dexie', async () => {
    mockSettingsBulkGet.mockResolvedValue([
      { key: 'snapToGrid', value: 'false' },
      { key: 'showMinimap', value: 'false' },
      { key: 'showBackground', value: 'true' },
      { key: 'zoomOnScroll', value: 'false' },
      { key: 'sidebarOpen', value: 'false' },
      { key: 'showBreadcrumb', value: 'false' },
      { key: 'locale', value: 'en' },
    ]);

    await usePreferencesStore.getState().load();

    const state = usePreferencesStore.getState();
    expect(state.snapToGrid).toBe(false);
    expect(state.showMinimap).toBe(false);
    expect(state.sidebarOpen).toBe(false);
    expect(state.locale).toBe('en');
    expect(state.loaded).toBe(true);
  });

  it('persiste cambios en Dexie inmediatamente', async () => {
    await usePreferencesStore.getState().update({ snapToGrid: false, showMinimap: false });

    expect(mockSettingsPut).toHaveBeenCalledTimes(2);
    expect(mockSettingsPut).toHaveBeenCalledWith({ key: 'snapToGrid', value: 'false' });
    expect(mockSettingsPut).toHaveBeenCalledWith({ key: 'showMinimap', value: 'false' });

    const state = usePreferencesStore.getState();
    expect(state.snapToGrid).toBe(false);
    expect(state.showMinimap).toBe(false);
  });

  it('restaura valores guardados al recargar (load tras update)', async () => {
    // First update
    await usePreferencesStore.getState().update({ locale: 'fr' });

    // Reset store state (simulate page reload)
    usePreferencesStore.setState({
      snapToGrid: true,
      showMinimap: true,
      showBackground: true,
      zoomOnScroll: true,
      sidebarOpen: true,
      showBreadcrumb: true,
      locale: 'es',
      loaded: false,
    });

    // Mock bulkGet to return the persisted value
    mockSettingsBulkGet.mockResolvedValue([
      undefined, undefined, undefined, undefined, undefined, undefined,
      { key: 'locale', value: 'fr' },
    ]);

    // Load again
    await usePreferencesStore.getState().load();

    expect(usePreferencesStore.getState().locale).toBe('fr');
  });

  it('reset restaura defaults y persiste', async () => {
    // Change some settings
    usePreferencesStore.setState({ snapToGrid: false, sidebarOpen: false, locale: 'de' });

    await usePreferencesStore.getState().reset();

    const state = usePreferencesStore.getState();
    expect(state.snapToGrid).toBe(true);
    expect(state.sidebarOpen).toBe(true);
    expect(state.locale).toBe('es');
    // Should have persisted
    expect(mockSettingsPut).toHaveBeenCalled();
  });

  it('load no-op si ya loaded', async () => {
    usePreferencesStore.setState({ loaded: true });

    await usePreferencesStore.getState().load();

    // bulkGet should not be called since already loaded
    expect(mockSettingsBulkGet).not.toHaveBeenCalled();
  });
});
