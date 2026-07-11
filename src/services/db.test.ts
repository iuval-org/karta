import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type AppSetting, type NodePosition, type StoredEdge, type FolderStateRow, type StoredTab } from './db';

describe('Dexie database schema', () => {
  beforeAll(async () => {
    // Open the database so schema is applied
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it('puede abrir la base de datos', () => {
    expect(db.isOpen()).toBe(true);
    expect(db.name).toBe('KartaDatabase');
  });

  it('versión 3 tiene índice tabId en positions', async () => {
    const item: NodePosition = {
      fileId: 'f1',
      x: 100,
      y: 200,
      tabId: 'tab-test',
    };
    await db.positions.put(item);
    const found = await db.positions.where('tabId').equals('tab-test').toArray();
    expect(found).toHaveLength(1);
    expect(found[0].fileId).toBe('f1');
  });

  it('versión 3 tiene índice tabId en edges', async () => {
    const edge: StoredEdge = {
      id: 'e1',
      source: 'a',
      target: 'b',
      tabId: 'tab-test',
    };
    await db.edges.put(edge);
    const found = await db.edges.where('tabId').equals('tab-test').toArray();
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('e1');
  });

  it('versión 3 tiene índice tabId en folderState', async () => {
    const state: FolderStateRow = {
      folderId: 'folder1',
      isOpen: true,
      width: 640,
      height: 480,
      tabId: 'tab-test',
    };
    await db.folderState.put(state);
    const found = await db.folderState.where('tabId').equals('tab-test').toArray();
    expect(found).toHaveLength(1);
    expect(found[0].folderId).toBe('folder1');
  });

  it('puede guardar y recuperar settings', async () => {
    await db.settings.put({ key: 'theme', value: 'dark' } as AppSetting);
    const setting = await db.settings.get('theme');
    expect(setting?.value).toBe('dark');
  });

  it('puede guardar y recuperar tabs', async () => {
    await db.tabs.put({ tabId: 'root', title: 'Karta', folderId: 'root', order: 0 } as StoredTab);
    const tabs = await db.tabs.toArray();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].title).toBe('Karta');
  });

  it('hydrateFromDexie busca por tabId correctamente', async () => {
    // Insert data for two different tabs
    await db.positions.put({ fileId: 'a', x: 0, y: 0, tabId: 'tab-1' } as NodePosition);
    await db.positions.put({ fileId: 'b', x: 10, y: 10, tabId: 'tab-1' } as NodePosition);
    await db.positions.put({ fileId: 'c', x: 20, y: 20, tabId: 'tab-2' } as NodePosition);

    const tab1Positions = await db.positions.where('tabId').equals('tab-1').toArray();
    expect(tab1Positions).toHaveLength(2);

    const tab2Positions = await db.positions.where('tabId').equals('tab-2').toArray();
    expect(tab2Positions).toHaveLength(1);

    // Clean up
    await db.positions.clear();
    await db.edges.clear();
    await db.folderState.clear();
    await db.settings.clear();
    await db.tabs.clear();
  });
});
