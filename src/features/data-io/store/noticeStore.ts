import { create } from 'zustand';

export type NoticeTone = 'success' | 'error';

/** One follow-up offered with the message, e.g. "Desfazer". */
export interface NoticeAction {
  label: string;
  run: () => void;
}

interface NoticeState {
  /** Short confirmation such as "Backup exportado", or why an action was refused. */
  message: string | null;
  tone: NoticeTone;
  action: NoticeAction | null;
  /** Changes on every `show`, so repeating a message restarts its timer. */
  id: number;
  show: (message: string, tone?: NoticeTone, action?: NoticeAction) => void;
  dismiss: () => void;
}

export const useNoticeStore = create<NoticeState>()((set) => ({
  message: null,
  tone: 'success',
  action: null,
  id: 0,
  show: (message, tone = 'success', action) => {
    set((state) => ({ message, tone, action: action ?? null, id: state.id + 1 }));
  },
  dismiss: () => {
    set({ message: null, action: null });
  },
}));
