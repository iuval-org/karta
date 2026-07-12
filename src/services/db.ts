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
  zIndex?: number;
  tabId: string; // 'root' o folderId
  width?: number;
  height?: number;
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
  tabId: string;
  width?: number;
  height?: number;
}

export interface StoredTab {
  tabId: string; // PK
  title: string;
  folderId: string;
  order: number;
}

export interface SyncState {
  id: 'sync'; // PK
  pageToken: string;
  lastSyncAt: number;
}

export interface StoredOperation {
  id: string; // PK
  type: string;
  fileId: string;
  payload: string; // JSON-stringified
  priority: number;
  createdAt: number;
}

/* ── Database class ────────────────────────────────────────────── */

class KartaDatabase extends Dexie {
  positions!: Table<NodePosition, string>;
  settings!: Table<AppSetting, string>;
  edges!: Table<StoredEdge, string>;
  folderState!: Table<FolderStateRow, string>;
  tabs!: Table<StoredTab, string>;
  syncState!: Table<SyncState, string>;
  storedOperations!: Table<StoredOperation, string>;

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

    // Version 4 – add syncState table for Drive Changes API tracking
    this.version(4).stores({
      positions: 'fileId, tabId',
      settings: 'key',
      edges: 'id, tabId',
      folderState: 'folderId, tabId',
      tabs: 'tabId',
      syncState: 'id',
    });

    // Version 5 – add storedOperations table for queue persistence
    this.version(5).stores({
      positions: 'fileId, tabId',
      settings: 'key',
      edges: 'id, tabId',
      folderState: 'folderId, tabId',
      tabs: 'tabId',
      syncState: 'id',
      storedOperations: 'id',
    });
  }
}

export const db = new KartaDatabase();
