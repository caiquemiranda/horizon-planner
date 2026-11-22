import { create } from 'zustand';

interface NoticeState {
  /** Short confirmation such as "Backup exportado". */
  message: string | null;
  /** Changes on every `show`, so repeating a message restarts its timer. */
  id: number;
  show: (message: string) => void;
  dismiss: () => void;
}

export const useNoticeStore = create<NoticeState>()((set) => ({
  message: null,
  id: 0,
  show: (message) => {
    set((state) => ({ message, id: state.id + 1 }));
  },
  dismiss: () => {
    set({ message: null });
  },
}));
