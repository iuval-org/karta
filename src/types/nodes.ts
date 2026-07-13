export interface StickyNoteData {
  text: string;
  color: string;
  author: string;
  createdAt: string;
}

export const STICKY_NOTE_COLORS = {
  yellow: '#FEF08A',
  green: '#BBF7D0',
  blue: '#BFDBFE',
  pink: '#F9A8D4',
  orange: '#FED7AA',
} as const;

export const STICKY_NOTE_HEADER_COLORS = {
  yellow: '#FDE047',
  green: '#86EFAC',
  blue: '#93C5FD',
  pink: '#F472B6',
  orange: '#FDBA74',
} as const;

export type StickyNoteColor = keyof typeof STICKY_NOTE_COLORS;

export interface TextBoxData {
  text: string;
  fontSize: number;
  fontWeight: string;
  textAlign: 'left' | 'center' | 'right';
}

export type ShapeType = 'rectangle' | 'circle' | 'arrow' | 'line';

export interface ShapeNodeData {
  shapeType: ShapeType;
  label: string;
  fillColor: string;
  borderColor: string;
}
