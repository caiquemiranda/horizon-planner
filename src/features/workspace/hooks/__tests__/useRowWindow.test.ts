import { describe, expect, it } from 'vitest';

import { ensureRowVisible, getRowWindow } from '../useRowWindow';

const options = { rowHeight: 36, offsetTop: 56, overscan: 2 };

describe('getRowWindow', () => {
  it('renders every row without layout', () => {
    expect(getRowWindow(0, 0, 500, options)).toEqual({ first: 0, last: 499, virtualized: false });
  });

  it('keeps the visible rows plus the overscan, in blocks of rows', () => {
    // 360 px tall at the top: rows 0–10 visible, rounded up to the block (16), plus 2.
    expect(getRowWindow(0, 360, 500, options)).toEqual({ first: 0, last: 18, virtualized: true });
    // Scrolled to row 100: rows 100–110 visible; blocks 96–112, plus 2 on each side.
    const scrolled = getRowWindow(56 + 100 * 36, 360, 500, options);
    expect(scrolled.first).toBe(94);
    expect(scrolled.last).toBe(114);
    expect(scrolled.first).toBeLessThanOrEqual(100);
    expect(scrolled.last).toBeGreaterThanOrEqual(110);
  });

  it('keeps the same window while scrolling inside a block', () => {
    const at = (row: number) => getRowWindow(56 + row * 36, 360, 500, options);
    expect(at(97)).toEqual(at(99));
  });

  it('stops at the end of the list', () => {
    expect(getRowWindow(56 + 495 * 36, 360, 500, options).last).toBe(499);
  });

  it('does not virtualize short lists', () => {
    expect(getRowWindow(0, 900, 10, options)).toEqual({ first: 0, last: 9, virtualized: false });
  });
});

describe('ensureRowVisible', () => {
  const scroller = (scrollTop: number) =>
    ({ scrollTop, clientHeight: 360 }) as unknown as HTMLElement;

  it('scrolls down to show a row below the view, and up for one above', () => {
    const below = scroller(0);
    ensureRowVisible(below, 20, 36, 56);
    expect(below.scrollTop).toBe(56 + 21 * 36 - 360);

    const above = scroller(2000);
    ensureRowVisible(above, 10, 36, 56);
    expect(above.scrollTop).toBe(360);
  });

  it('leaves the scroll alone when the row is visible', () => {
    const visible = scroller(0);
    ensureRowVisible(visible, 3, 36, 56);
    expect(visible.scrollTop).toBe(0);
  });
});
