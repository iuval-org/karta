import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number; // ms, default 3000
}

interface ToastState {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => string;
  removeToast: (id: string) => void;
}

let toastIdCounter = 0;
function generateToastId(): string {
  toastIdCounter += 1;
  return `toast_${toastIdCounter}_${Date.now()}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast: Omit<ToastMessage, 'id'>) => {
    const id = generateToastId();
    const duration: number = toast.duration ?? 3000;
    const newToast: ToastMessage = {
      ...toast,
      id,
      duration,
    };

    set({ toasts: [...get().toasts, newToast] });

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }

    return id;
  },

  removeToast: (id: string) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
