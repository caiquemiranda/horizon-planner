import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoticeStore } from '../../store/noticeStore';
import { DataNotice, NOTICE_DURATION_MS } from '../DataNotice';

describe('DataNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNoticeStore.getState().dismiss();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces the message and hides it after a while', () => {
    render(<DataNotice />);

    act(() => {
      useNoticeStore.getState().show('Backup exportado.');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Backup exportado.');

    act(() => {
      vi.advanceTimersByTime(NOTICE_DURATION_MS);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('marks refusals with a warning icon instead of a check', () => {
    render(<DataNotice />);

    act(() => {
      useNoticeStore.getState().show('Vínculo circular.', 'error');
    });
    expect(screen.getByRole('status').querySelector('.lucide-triangle-alert')).not.toBeNull();

    act(() => {
      useNoticeStore.getState().show('Salvo.');
    });
    expect(screen.getByRole('status').querySelector('.lucide-circle-check')).not.toBeNull();
  });

  it('restarts the timer when the same message is shown again', () => {
    render(<DataNotice />);

    act(() => {
      useNoticeStore.getState().show('Feito.');
      vi.advanceTimersByTime(NOTICE_DURATION_MS - 100);
      useNoticeStore.getState().show('Feito.');
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Feito.');
  });
});
