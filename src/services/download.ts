import type { DriveItem } from '../types/drive';

export function downloadFile(file: DriveItem): void {
  if (file.webContentLink && file.webContentLink !== '#') {
    window.open(file.webContentLink, '_blank');
  }
}
