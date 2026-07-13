export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  iconLink?: string;
  webContentLink?: string;
  webViewLink: string;
  modifiedTime: string;
  size?: string;
  fileExtension?: string;
  isFolder: boolean;
  parentId?: string;
}

export interface DriveListResponse {
  files: DriveItem[];
  nextPageToken?: string;
}

export type FileTypeCategory =
  | 'folder'
  | 'document'
  | 'sheet'
  | 'slides'
  | 'pdf'
  | 'image'
  | 'text'
  | 'video'
  | 'audio'
  | 'file';
