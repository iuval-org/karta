type PickerCallback = (result: {
  folderId: string;
  folderName: string;
}) => void;

type PickerErrorCallback = (error: string) => void;

let gapiLoaded = false;
let pickerLoaded = false;
let loadPromise: Promise<void> | null = null;

function loadGapiScript(): Promise<void> {
  if (gapiLoaded && pickerLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    if (existing && gapiLoaded && pickerLoaded) {
      resolve();
      return;
    }

    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.onload = () => {
      gapiLoaded = true;
      window.gapi.load('picker', {
        callback: () => {
          pickerLoaded = true;
          resolve();
        },
      });
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error('No se pudo cargar Google Picker API'));
    };
  });

  return loadPromise;
}

export function loadPicker(
  accessToken: string,
  onSelect: PickerCallback,
  onError: PickerErrorCallback,
): void {
  loadGapiScript()
    .then(() => {
      const pk = window.google.picker;
      const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;
      const appId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

      if (!developerKey || !appId) {
        onError(
          'Falta configuraci\u00f3n: VITE_GOOGLE_API_KEY y VITE_GOOGLE_CLIENT_ID son requeridos',
        );
        return;
      }

      const docsView = new pk.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const picker = new pk.PickerBuilder()
        .setAppId(appId)
        .setOAuthToken(accessToken)
        .setDeveloperKey(developerKey)
        .addView(docsView)
        .setCallback((data) => {
          if (data.action === pk.Action.PICKED) {
            const doc = data.docs[0];
            if (doc) {
              onSelect({
                folderId: doc.id,
                folderName: doc.name,
              });
            }
          }
        })
        .build();

      picker.setVisible(true);
    })
    .catch((err: Error) => {
      onError(err.message);
    });
}

export function isPickerReady(): boolean {
  return gapiLoaded && pickerLoaded;
}
