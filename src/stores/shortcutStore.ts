import { create } from 'zustand';

export interface ShortcutDef {
  key: string;
  description: string;
  category: 'Navegación' | 'Canvas' | 'Archivos' | 'General';
}

interface ShortcutState {
  showHelp: boolean;
  pendingCreateType: string | null;
  pendingRenameNodeId: string | null;

  toggleHelp: () => void;
  setShowHelp: (show: boolean) => void;
  triggerCreateModal: (mimeType: string) => void;
  clearCreateModal: () => void;
  triggerRenameNode: (nodeId: string) => void;
  clearRenameNode: () => void;

  shortCuts: ShortcutDef[];
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  showHelp: false,
  pendingCreateType: null,
  pendingRenameNodeId: null,

  toggleHelp: () => set({ showHelp: !get().showHelp }),

  setShowHelp: (show: boolean) => set({ showHelp: show }),

  triggerCreateModal: (mimeType: string) => set({ pendingCreateType: mimeType }),

  clearCreateModal: () => set({ pendingCreateType: null }),

  triggerRenameNode: (nodeId: string) => set({ pendingRenameNodeId: nodeId }),

  clearRenameNode: () => set({ pendingRenameNodeId: null }),

  shortCuts: [
    { key: 'Alt + ←', description: 'Volver a carpeta anterior', category: 'Navegación' },
    { key: 'Ctrl + Tab', description: 'Siguiente pestaña', category: 'Navegación' },
    { key: 'Ctrl + Shift + Tab', description: 'Pestaña anterior', category: 'Navegación' },
    { key: 'Ctrl + W', description: 'Cerrar pestaña activa', category: 'Navegación' },
    { key: 'Ctrl + A', description: 'Seleccionar todo', category: 'Canvas' },
    { key: 'Escape', description: 'Limpiar selección', category: 'Canvas' },
    { key: 'Ctrl + 0', description: 'Reset zoom (fit view)', category: 'Canvas' },
    { key: 'Ctrl + R', description: 'Reorganizar grilla', category: 'Canvas' },
    { key: 'Delete', description: 'Mover a papelera', category: 'Archivos' },
    { key: 'F2', description: 'Renombrar (seleccionado)', category: 'Archivos' },
    { key: 'Ctrl + K', description: 'Buscar archivos', category: 'Archivos' },
    { key: 'P', description: 'Vista previa del archivo seleccionado', category: 'Archivos' },
    { key: 'Ctrl + N', description: 'Nuevo archivo/carpeta', category: 'Archivos' },
    { key: '?', description: 'Mostrar/ocultar ayuda', category: 'General' },
    { key: 'Ctrl + \\', description: 'Toggle sidebar', category: 'General' },
    { key: 'Shift + /', description: 'Comando rápido', category: 'General' },
  ],
}));
