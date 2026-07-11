/* eslint-disable @typescript-eslint/no-namespace */

interface Window {
  gapi: {
    load(api: string, settings: { callback: () => void }): void;
  };
  google: {
    picker: {
      PickerBuilder: new () => google.picker.PickerBuilder;
      DocsView: new () => google.picker.DocsView;
      Action: {
        PICKED: string;
        CANCEL: string;
      };
    };
  };
}

declare namespace google.picker {
  interface PickerBuilder {
    setAppId(appId: string): this;
    setOAuthToken(token: string): this;
    setDeveloperKey(key: string): this;
    addView(view: DocsView): this;
    setCallback(callback: (data: ResponseObject) => void): this;
    build(): Picker;
  }

  interface Picker {
    setVisible(visible: boolean): void;
  }

  interface DocsView {
    setIncludeFolders(include: boolean): this;
    setSelectFolderEnabled(enabled: boolean): this;
    setMimeTypes(mimeTypes: string): this;
  }

  interface ResponseObject {
    action: string;
    docs: Array<{
      id: string;
      name: string;
      mimeType: string;
    }>;
  }
}
