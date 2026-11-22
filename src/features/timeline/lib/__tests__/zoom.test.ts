import { describe, expect, it } from 'vitest';

import { ZOOM_LIMITS } from '@/types/timeline';

import { canZoomIn, canZoomOut, getNearestPreset } from '../zoom';

describe('getNearestPreset', () => {
  it('returns exact presets', () => {
    expect(getNearestPreset(6.5).id).toBe('months');
    expect(getNearestPreset(85).id).toBe('days');
  });

  it('picks the closest preset on a log scale', () => {
    // Between months (6.5) and weeks (28): geometric middle ≈ 13.5.
    expect(getNearestPreset(12).id).toBe('months');
    expect(getNearestPreset(15).id).toBe('weeks');
  });

  it('clamps beyond the extremes', () => {
    expect(getNearestPreset(ZOOM_LIMITS.min).id).toBe('years');
    expect(getNearestPreset(ZOOM_LIMITS.max).id).toBe('days');
  });
});

describe('zoom limits', () => {
  it('disables zooming past the limits', () => {
    expect(canZoomIn(ZOOM_LIMITS.max)).toBe(false);
    expect(canZoomIn(10)).toBe(true);
    expect(canZoomOut(ZOOM_LIMITS.min)).toBe(false);
    expect(canZoomOut(10)).toBe(true);
  });
});
