import { act, screen } from '@testing-library/react';

import { useViewportStore } from '@/features/timeline/store/viewportStore';

/**
 * jsdom has no layout, so the timeline canvas is 0 px wide and draws no bar. This widens
 * the viewport over 2019–2040 so every project's bar is drawn.
 */
export function showWholeTimeline() {
  act(() => {
    useViewportStore.getState().setViewport({ startDay: 18_000, pxPerDay: 0.5, widthPx: 4000 });
  });
}

/** Titles of the bars on the timeline, lane by lane. */
export function timelineBarTitles(): string[] {
  showWholeTimeline();
  return screen
    .queryAllByRole('listitem')
    .filter((item) => item.closest('[aria-label="Linha do tempo"]'))
    .map((item) => item.querySelector('[data-project-id]')?.getAttribute('aria-label') ?? '');
}
