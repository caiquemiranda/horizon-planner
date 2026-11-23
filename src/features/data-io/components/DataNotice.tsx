import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

import { useNoticeStore } from '../store/noticeStore';

export const NOTICE_DURATION_MS = 4000;
/** Longer when the notice offers an action, so there is time to reach it. */
export const NOTICE_WITH_ACTION_DURATION_MS = 8000;

/** Confirmation toast for data actions. The live region is always mounted so it is announced. */
export function DataNotice() {
  const message = useNoticeStore((state) => state.message);
  const id = useNoticeStore((state) => state.id);
  const tone = useNoticeStore((state) => state.tone);
  const dismiss = useNoticeStore((state) => state.dismiss);
  const action = useNoticeStore((state) => state.action);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, action ? NOTICE_WITH_ACTION_DURATION_MS : NOTICE_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [message, id, dismiss, action]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {message ? (
        <div
          key={id}
          className="pointer-events-auto flex max-w-sm animate-fade-in items-center gap-2.5 rounded-lg border bg-popover py-2 pr-2 pl-3 text-sm text-popover-foreground shadow-popover"
        >
          {tone === 'error' ? (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          ) : (
            <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-green-500" />
          )}
          <p className="flex-1">{message}</p>
          {action ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                dismiss();
                action.run();
              }}
            >
              {action.label}
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-xs" aria-label="Fechar aviso" onClick={dismiss}>
            <X />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
