import { describe, it, expect, beforeEach } from 'vitest';
import { useNavigationStore } from './navigationStore';

beforeEach(() => {
  // Reset navigation store to initial state
  useNavigationStore.setState({
    history: [],
    currentFolderId: '',
    currentFolderName: '',
    isNavigating: false,
  });
});

describe('Navigation store', () => {
  it('navigateTo push al historial', () => {
    const store = useNavigationStore.getState();

    store.navigateTo('folder-1', 'Folder 1');
    expect(useNavigationStore.getState().currentFolderId).toBe('folder-1');
    expect(useNavigationStore.getState().currentFolderName).toBe('Folder 1');
    // First navigation: history should remain empty since currentFolderId was ''
    expect(useNavigationStore.getState().history).toHaveLength(0);

    store.navigateTo('folder-2', 'Folder 2');
    const afterSecond = useNavigationStore.getState();
    expect(afterSecond.currentFolderId).toBe('folder-2');
    expect(afterSecond.history).toHaveLength(1);
    expect(afterSecond.history[0].folderId).toBe('folder-1');
  });

  it('navigateTo no-op si ya está en esa carpeta', () => {
    useNavigationStore.setState({ currentFolderId: 'same-folder', currentFolderName: 'Same' });
    const store = useNavigationStore.getState();
    const beforeHistory = store.history.length;

    store.navigateTo('same-folder', 'Same');
    expect(useNavigationStore.getState().history).toHaveLength(beforeHistory);
  });

  it('goBack restaura carpeta anterior', () => {
    useNavigationStore.setState({
      history: [{ folderId: 'parent', folderName: 'Parent' }],
      currentFolderId: 'child',
      currentFolderName: 'Child',
    });

    useNavigationStore.getState().goBack();

    const state = useNavigationStore.getState();
    expect(state.currentFolderId).toBe('parent');
    expect(state.currentFolderName).toBe('Parent');
    expect(state.history).toHaveLength(0);
  });

  it('goBack no hace nada si history está vacío', () => {
    useNavigationStore.setState({ currentFolderId: 'only', currentFolderName: 'Only' });

    useNavigationStore.getState().goBack();

    const state = useNavigationStore.getState();
    expect(state.currentFolderId).toBe('only');
    expect(state.history).toHaveLength(0);
  });

  it('goBackTo trunca historial hasta el target', () => {
    useNavigationStore.setState({
      history: [
        { folderId: 'root', folderName: 'Root' },
        { folderId: 'a', folderName: 'A' },
        { folderId: 'b', folderName: 'B' },
      ],
      currentFolderId: 'c',
      currentFolderName: 'C',
    });

    useNavigationStore.getState().goBackTo('a');

    const state = useNavigationStore.getState();
    expect(state.currentFolderId).toBe('a');
    expect(state.currentFolderName).toBe('A');
    // History should have [root] (since a was at index 1, truncated to [root, a], then pop a)
    expect(state.history).toHaveLength(1);
    expect(state.history[0].folderId).toBe('root');
  });

  it('goBackTo no hace nada si folderId no está en historial', () => {
    useNavigationStore.setState({
      history: [{ folderId: 'a', folderName: 'A' }],
      currentFolderId: 'b',
      currentFolderName: 'B',
    });

    useNavigationStore.getState().goBackTo('nonexistent');

    const state = useNavigationStore.getState();
    expect(state.currentFolderId).toBe('b');
    expect(state.history).toHaveLength(1);
  });

  it('resetToRoot limpia todo', () => {
    useNavigationStore.setState({
      history: [{ folderId: 'a', folderName: 'A' }],
      currentFolderId: 'b',
      currentFolderName: 'B',
    });

    useNavigationStore.getState().resetToRoot();

    const state = useNavigationStore.getState();
    expect(state.history).toEqual([]);
    expect(state.currentFolderId).toBe('');
    expect(state.currentFolderName).toBe('');
    expect(state.isNavigating).toBe(false);
  });

  it('canGoBack detecta correctamente', () => {
    expect(useNavigationStore.getState().canGoBack()).toBe(false);

    useNavigationStore.setState({
      history: [{ folderId: 'a', folderName: 'A' }],
      currentFolderId: 'b',
    });

    expect(useNavigationStore.getState().canGoBack()).toBe(true);
  });
});
