import type { DriveItem } from '../../src/types/drive';

// ---------------------------------------------------------------------------
// Mock Drive data for E2E tests
// ---------------------------------------------------------------------------

export const ROOT_FOLDER: DriveItem = {
  id: 'root_mock',
  name: 'Karta',
  mimeType: 'application/vnd.google-apps.folder',
  webViewLink: '#',
  webContentLink: '#',
  modifiedTime: '2025-01-01T00:00:00.000Z',
  isFolder: true,
};

export const FOLDER_A: DriveItem = {
  id: 'folder_a',
  name: 'Carpeta A',
  mimeType: 'application/vnd.google-apps.folder',
  webViewLink: '#',
  webContentLink: '#',
  modifiedTime: '2025-01-02T00:00:00.000Z',
  isFolder: true,
  parentId: 'root_mock',
};

export const FOLDER_B: DriveItem = {
  id: 'folder_b',
  name: 'Carpeta B',
  mimeType: 'application/vnd.google-apps.folder',
  webViewLink: '#',
  webContentLink: '#',
  modifiedTime: '2025-01-03T00:00:00.000Z',
  isFolder: true,
  parentId: 'root_mock',
};

export const DOC1: DriveItem = {
  id: 'file_doc1',
  name: 'doc1.md',
  mimeType: 'text/markdown',
  webViewLink: '#',
  webContentLink: '#',
  modifiedTime: '2025-01-04T00:00:00.000Z',
  size: '2048',
  fileExtension: 'md',
  isFolder: false,
  parentId: 'root_mock',
};

export const IMAGE_PNG: DriveItem = {
  id: 'file_image',
  name: 'image.png',
  mimeType: 'image/png',
  webViewLink: '#',
  webContentLink: '#',
  modifiedTime: '2025-01-05T00:00:00.000Z',
  size: '102400',
  fileExtension: 'png',
  isFolder: false,
  parentId: 'folder_a',
};

export const SPREADSHEET: DriveItem = {
  id: 'file_spreadsheet',
  name: 'spreadsheet.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  webViewLink: '#',
  webContentLink: '#',
  modifiedTime: '2025-01-06T00:00:00.000Z',
  size: '51200',
  fileExtension: 'xlsx',
  isFolder: false,
  parentId: 'folder_a',
};

export const NOTES_TXT: DriveItem = {
  id: 'file_notes',
  name: 'notes.txt',
  mimeType: 'text/plain',
  webViewLink: '#',
  webContentLink: '#',
  modifiedTime: '2025-01-07T00:00:00.000Z',
  size: '1024',
  fileExtension: 'txt',
  isFolder: false,
  parentId: 'folder_b',
};

/** All items for the mock canvas. */
export const ALL_ITEMS: DriveItem[] = [
  ROOT_FOLDER,
  FOLDER_A,
  FOLDER_B,
  DOC1,
  IMAGE_PNG,
  SPREADSHEET,
  NOTES_TXT,
];

/** Files that should appear at the root level (parentId === root_mock). */
export const ROOT_LEVEL_ITEMS: DriveItem[] = ALL_ITEMS.filter(
  (i) => i.parentId === 'root_mock',
);

/** Predefined positions for each node on the canvas. */
export const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  root_mock: { x: 0, y: 0 },
  folder_a: { x: 100, y: 100 },
  folder_b: { x: 500, y: 100 },
  file_doc1: { x: 100, y: 400 },
  file_image: { x: 300, y: 400 },
  file_spreadsheet: { x: 500, y: 400 },
  file_notes: { x: 700, y: 400 },
};

// ---------------------------------------------------------------------------
// Mock Drive API responses for use with page.route()
// ---------------------------------------------------------------------------

/** Response for GET /drive/v3/files (list children of root_mock). */
export const DRIVE_LIST_ROOT_RESPONSE = {
  files: ROOT_LEVEL_ITEMS.map((item) => ({
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
};

/** Response for GET /drive/v3/files (list children of a specific folder). */
export function driveListResponse(parentId: string) {
  const children = ALL_ITEMS.filter((i) => i.parentId === parentId);
  return {
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
  };
}