import { create } from 'zustand';

export interface Comment {
  id: string;
  nodeId: string;
  author: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

interface CommentState {
  comments: Comment[];
  activeThread: string | null;
  commentMode: boolean;
  openThread: (nodeId: string) => void;
  closeThread: () => void;
  toggleCommentMode: () => void;
  setCommentMode: (mode: boolean) => void;
  addComment: (nodeId: string, text: string) => void;
  resolveThread: (nodeId: string) => void;
  getCommentsForNode: (nodeId: string) => Comment[];
}

function generateId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: [],
  activeThread: null,
  commentMode: false,

  openThread: (nodeId) => set({ activeThread: nodeId }),

  closeThread: () => set({ activeThread: null }),

  toggleCommentMode: () => set((s) => ({ commentMode: !s.commentMode })),

  setCommentMode: (mode) => set({ commentMode: mode }),

  addComment: (nodeId, text) => {
    const comment: Comment = {
      id: generateId(),
      nodeId,
      author: 'Yo',
      text,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    set((s) => ({
      comments: [...s.comments, comment],
      activeThread: nodeId,
    }));
  },

  resolveThread: (nodeId) =>
    set((s) => ({
      comments: s.comments.map((c) =>
        c.nodeId === nodeId ? { ...c, resolved: true } : c,
      ),
    })),

  getCommentsForNode: (nodeId) =>
    get().comments.filter((c) => c.nodeId === nodeId && !c.resolved),
}));
