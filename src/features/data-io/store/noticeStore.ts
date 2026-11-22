import { create } from 'zustand';

export type NoticeTone = 'success' | 'error';

interface NoticeState {
  /** Short confirmation such as "Backup exportado", or why an action was refused. */
  message: string | null;
  tone: NoticeTone;
  /** Changes on every `show`, so repeating a message restarts its timer. */
  id: number;
  show: (message: string, tone?: NoticeTone) => void;
  dismiss: () => void;
}

export const useNoticeStore = create<NoticeState>()((set) => ({
  message: null,
  tone: 'success',
  id: 0,
  show: (message, tone = 'success') => {
    set((state) => ({ message, tone, id: state.id + 1 }));
  },
  dismiss: () => {
    set({ message: null });
  },
}));
