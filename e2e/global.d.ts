// Extend global Window interface for E2E bridge
export {};

declare global {
  interface Window {
    __KARTA_E2E__?: boolean;
    __kartaStores?: {
      setAuthUser: (user: unknown) => void;
      setRootFolder: (id: string, name: string) => void;
    };
    google: unknown;
    gapi: {
      load: (api: string, settings: { callback: () => void }) => void;
      client: {
        setToken: (token: { access_token: string }) => void;
        load: (api: string, version: string) => Promise<void>;
        request: (config: {
          path?: string;
          method?: string;
          params?: Record<string, string>;
          body?: unknown;
        }) => Promise<{ result: Record<string, unknown> }>;
        drive: {
          files: {
            list: (params?: Record<string, string>) => Promise<{
              result: { files: unknown[]; nextPageToken?: string };
            }>;
            get: (params: { fileId: string; fields?: string }) => Promise<{
              result: Record<string, unknown>;
            }>;
            create: (params: Record<string, unknown>) => Promise<{
              result: Record<string, unknown>;
            }>;
            update: (params: {
              fileId: string;
              addParents?: string;
              removeParents?: string;
              requestBody?: Record<string, unknown>;
            }) => Promise<{ result: Record<string, unknown> }>;
          };
        };
      };
      auth: {
        getToken: () => { access_token: string } | null;
      };
    };
  }
}