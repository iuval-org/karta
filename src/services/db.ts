import Dexie, { type Table } from 'dexie';

/* ── Schema types ──────────────────────────────────────────────── */

export interface AppSetting {
  key: string;
  value: string;
}

export interface NodePosition {
  fileId: string; // PK
  x: number;
  y: number;
  tabId: string; // 'root' o folderId
}

export interface StoredEdge {
  id: string; // PK
  source: string;
  target: string;
  label?: string;
  tabId: string;
}

export interface FolderStateRow {
  folderId: string; // PK
  isOpen: boolean;
  width: number;
  height: number;
  tabId: string;
  viewportPanX?: number;
  viewportPanY?: number;
  viewportZoom?: number;
}

export interface StoredTab {
  tabId: string; // PK
  title: string;
  folderId: string;
  order: number;
}

/* ── Database class ────────────────────────────────────────────── */

class KartaDatabase extends Dexie {
  positions!: Table<NodePosition, string>;
  settings!: Table<AppSetting, string>;
  edges!: Table<StoredEdge, string>;
  folderState!: Table<FolderStateRow, string>;
  tabs!: Table<StoredTab, string>;

  constructor() {
    super('KartaDatabase');

    // Version 1 – original settings table
    this.version(1).stores({
      settings: 'key',
    });

    // Version 2 – full persistence schema
    this.version(2).stores({
      positions: 'fileId',
      settings: 'key',
      edges: 'id',
      folderState: 'folderId',
      tabs: 'tabId',
    });

    // Version 3 – add tabId indexes for queries
    this.version(3).stores({
      positions: 'fileId, tabId',
      settings: 'key',
      edges: 'id, tabId',
      folderState: 'folderId, tabId',
      tabs: 'tabId',
    });
  }
}

export const db = new KartaDatabase();
