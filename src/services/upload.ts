import type { DriveItem } from '../types/drive';
import { useAuthStore } from '../stores/authStore';

export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

export function isFileTooLarge(file: File): boolean {
  return file.size > MAX_UPLOAD_SIZE;
}

function mapResponseToDriveItem(data: Record<string, unknown>): DriveItem {
  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    mimeType: String(data.mimeType ?? 'application/octet-stream'),
    webViewLink: String(data.webViewLink ?? ''),
    modifiedTime: String(data.modifiedTime ?? new Date().toISOString()),
    iconLink: String(data.iconLink ?? ''),
    size: data.size != null ? String(data.size) : undefined,
    isFolder: String(data.mimeType) === 'application/vnd.google-apps.folder',
  };
}

export async function uploadFile(
  file: File,
  folderId: string,
  onProgress?: (progress: number) => void,
): Promise<DriveItem | null> {
  const accessToken = await useAuthStore.getState().getAccessToken();
  if (!accessToken) {
    throw new Error('No hay sesión activa.');
  }

  const metadata: Record<string, unknown> = { name: file.name };
  if (folderId && folderId !== 'root') {
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  form.append('file', file);

  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,name,mimeType,webViewLink,modifiedTime,iconLink,size',
  });

  const response = await new Promise<DriveItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'POST',
      `https://www.googleapis.com/upload/drive/v3/files?${params}`,
    );
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    if (onProgress) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(mapResponseToDriveItem(data));
        } catch {
          reject(new Error('Error al procesar la respuesta del servidor.'));
        }
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error('No tenés permisos para subir archivos.'));
      } else if (xhr.status === 413) {
        reject(new Error('El archivo es demasiado grande.'));
      } else {
        reject(
          new Error(
            `Error al subir archivo (${xhr.status}). Reintentá.`,
          ),
        );
      }
    };

    xhr.onerror = () =>
      reject(new Error('Error de conexión al subir archivo.'));

    xhr.send(form);
  });

  return response;
}
