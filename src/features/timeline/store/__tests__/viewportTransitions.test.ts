import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dayToX, xToDay } from '../../lib/scale';

interface CapturedAnimation {
  onUpdate: (t: number) => void;
  onComplete: () => void;
  stopped: boolean;
}

const animations: CapturedAnimation[] = [];

vi.mock('motion', () => ({
  animate: (
    _from: number,
    _to: number,
    options: { onUpdate: (t: number) => void; onComplete: () => void },
  ) => {
    const animation: CapturedAnimation = { ...options, stopped: false };
    animations.push(animation);
    return {
      stop: () => {
        animation.stopped = true;
      },
    };
  },
}));

const { useViewportStore } = await import('../viewportStore');

const VIEWPORT = { startDay: 20_000, pxPerDay: 10, widthPx: 1000 };

function getViewport() {
  return useViewportStore.getState().viewport;
}

function lastAnimation(): CapturedAnimation {
  const animation = animations.at(-1);
  if (!animation) throw new Error('No animation started');
  return animation;
}

function mockReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches, media: query }) as MediaQueryList,
  );
}

describe('viewport transitions', () => {
  beforeEach(() => {
    animations.length = 0;
    // Motion allowed for these tests.
    mockReducedMotion(false);
    useViewportStore.getState().setViewport(VIEWPORT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('animates absolute zoom changes and lands exactly on the target', () => {
    useViewportStore.getState().zoomTo(40);

    lastAnimation().onUpdate(0.5);
    expect(getViewport().pxPerDay).toBeCloseTo(20);

    lastAnimation().onComplete();
    expect(getViewport().pxPerDay).toBe(40);
    expect(dayToX(xToDay(500, VIEWPORT), getViewport())).toBeCloseTo(500);
  });

  it('accumulates smooth zoom steps on the running target', () => {
    const { zoomAt } = useViewportStore.getState();
    zoomAt(200, 2, { smooth: true });
    zoomAt(200, 2, { smooth: true });

    expect(animations[0]?.stopped).toBe(true);
    lastAnimation().onComplete();
    expect(getViewport().pxPerDay).toBe(40);
  });

  it('cancels the transition when the user pans', () => {
    useViewportStore.getState().goToToday();
    useViewportStore.getState().panBy(100);

    expect(lastAnimation().stopped).toBe(true);
    expect(getViewport().startDay).toBeCloseTo(20_010);
  });

  it('applies instantly when the user prefers reduced motion', () => {
    mockReducedMotion(true);

    useViewportStore.getState().zoomTo(40);

    expect(animations).toHaveLength(0);
    expect(getViewport().pxPerDay).toBe(40);
  });
});
