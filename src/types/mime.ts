import type { FileTypeCategory } from './drive';

type MimeMapEntry = {
  icon: string;
  label: string;
};

const MIME_MAP: Record<string, MimeMapEntry> = {
  'application/vnd.google-apps.folder': {
    icon: 'folder',
    label: 'Carpeta',
  },
  'application/vnd.google-apps.document': {
    icon: 'document',
    label: 'Documento',
  },
  'application/vnd.google-apps.spreadsheet': {
    icon: 'sheet',
    label: 'Planilla',
  },
  'application/vnd.google-apps.presentation': {
    icon: 'slides',
    label: 'Presentación',
  },
  'application/pdf': { icon: 'pdf', label: 'PDF' },
};

const MIME_PREFIXES: Array<{ prefix: string; icon: string; label: string }> = [
  { prefix: 'image/', icon: 'image', label: 'Imagen' },
  { prefix: 'text/', icon: 'text', label: 'Texto' },
  { prefix: 'video/', icon: 'video', label: 'Video' },
  { prefix: 'audio/', icon: 'audio', label: 'Audio' },
];

const MIME_DEFAULT: MimeMapEntry = { icon: 'file', label: 'Archivo' };

/**
 * Devuelve icono y label legible según el MIME type del archivo.
 */
export function getMimeInfo(mimeType: string): MimeMapEntry {
  const exact = MIME_MAP[mimeType];
  if (exact) return exact;

  for (const p of MIME_PREFIXES) {
    if (mimeType.startsWith(p.prefix)) {
      return { icon: p.icon, label: p.label };
    }
  }

  return MIME_DEFAULT;
}

/**
 * Devuelve el nombre del icono SVG (Heroicon) según MIME type.
 * Compatible con Heroicons outline/solid.
 */
export function getFileTypeIcon(mimeType: string): string {
  return getMimeInfo(mimeType).icon as FileTypeCategory;
}

/**
 * Devuelve una etiqueta legible para el MIME type.
 */
export function getFileTypeLabel(mimeType: string): string {
  return getMimeInfo(mimeType).label;
}
