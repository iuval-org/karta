/* eslint-disable @typescript-eslint/no-namespace */

interface Window {
  gapi: {
    load(api: string, settings: { callback: () => void }): void;
  };
  google: Google;
}

interface Google {
  accounts: GoogleAccounts;
  picker: GooglePicker;
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: TokenClientConfig): TokenClient;
    revoke(token: string, callback?: () => void): void;
    hasGrantedAllScopes(
      tokenResponse: TokenResponse,
      ...scopes: string[]
    ): boolean;
  };
}

interface GooglePicker {
  PickerBuilder: new () => GooglePickerBuilder;
  DocsView: new () => GoogleDocsView;
  Action: {
    PICKED: string;
    CANCEL: string;
  };
}

interface GooglePickerBuilder {
  setAppId(appId: string): this;
  setOAuthToken(token: string): this;
  setDeveloperKey(key: string): this;
  addView(view: GoogleDocsView): this;
  setCallback(callback: (data: GooglePickerResponse) => void): this;
  build(): GooglePickerInstance;
}

interface GooglePickerInstance {
  setVisible(visible: boolean): void;
}

interface GoogleDocsView {
  setIncludeFolders(include: boolean): this;
  setSelectFolderEnabled(enabled: boolean): this;
  setMimeTypes(mimeTypes: string): this;
}

interface GooglePickerResponse {
  action: string;
  docs: Array<{
    id: string;
    name: string;
    mimeType: string;
  }>;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string; message: string }) => void;
}

interface TokenClient {
  requestAccessToken(overrideConfig?: {
    prompt?: string;
  }): void;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}
