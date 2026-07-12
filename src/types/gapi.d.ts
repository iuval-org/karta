/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-empty-object-type */

interface Window {
  gapi: {
    load(api: string, settings: { callback: () => void }): void;
    client?: {
      setToken(token: { access_token: string }): void;
      load(api: string, version: string): Promise<void>;
      request<T = GapiDriveFile>(params: {
        path: string;
        method: string;
        params?: Record<string, string>;
        body?: Record<string, unknown>;
      }): Promise<{ result: T; status?: number; statusText?: string }>;
      drive: {
        files: {
          list(
            params: Record<string, string>,
          ): Promise<{ result: GapiDriveFileList }>;
          get(
            params: Record<string, string>,
          ): Promise<{ result: GapiDriveFile }>;
          create(
            body: Record<string, unknown>,
            params?: Record<string, string>,
          ): Promise<{ result: GapiDriveFile }>;
          update(
            params: Record<string, string>,
            body: Record<string, unknown>,
          ): Promise<{ result: GapiDriveFile }>;
        };
        changes: {
          getStartPageToken(
            params: Record<string, string>,
          ): Promise<{ result: GapiDriveStartPageToken }>;
          list(
            params: Record<string, string>,
          ): Promise<{ result: GapiDriveChangeList }>;
        };
      };
    };
  };
}

// ── Drive Changes API ────────────────────────────────────────────

interface GapiDriveChange {
  kind?: string;
  type?: string;
  fileId?: string;
  removed?: boolean;
  time?: string;
  file?: GapiDriveFile;
}

interface GapiDriveChangeList {
  changes: GapiDriveChange[];
  nextPageToken?: string;
  newStartPageToken?: string;
  kind?: string;
}

interface GapiDriveStartPageToken {
  kind?: string;
  startPageToken?: string;
}

// ── Drive file types ────────────────────────────────────────────

interface GapiDriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  thumbnailLink?: string;
  iconLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
  fileExtension?: string;
  parents?: string[];
  trashed?: boolean;
}

interface GapiDriveFileList {
  files: GapiDriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

interface GapiError {
  status?: number;
  result?: {
    error?: {
      code?: number;
      message?: string;
      errors?: Array<{ reason?: string; message?: string }>;
    };
  };
  message?: string;
}
