import { describe, expect, it } from 'vitest';

import {
  getPinchChange,
  hasExceededDragThreshold,
  interpretWheel,
  normalizeWheelDelta,
  type WheelInput,
} from '../gestures';
import { wheelDeltaToZoomFactor } from '../scale';

const WIDTH = 1000;

function wheel(overrides: Partial<WheelInput>): WheelInput {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    offsetX: 300,
    ...overrides,
  };
}

describe('normalizeWheelDelta', () => {
  it('converts lines and pages to pixels', () => {
    expect(normalizeWheelDelta(3, 0, WIDTH)).toBe(3);
    expect(normalizeWheelDelta(3, 1, WIDTH)).toBe(48);
    expect(normalizeWheelDelta(1, 2, WIDTH)).toBe(WIDTH);
  });
});

describe('interpretWheel', () => {
  it('zooms on the cursor with Ctrl or ⌘ (and trackpad pinch)', () => {
    expect(interpretWheel(wheel({ ctrlKey: true, deltaY: -100 }), WIDTH)).toEqual({
      type: 'zoom',
      anchorX: 300,
      factor: wheelDeltaToZoomFactor(-100),
      deltaY: -100,
    });
    expect(interpretWheel(wheel({ metaKey: true, deltaY: 50 }), WIDTH)?.type).toBe('zoom');
  });

  it('zooms in when scrolling up and out when scrolling down', () => {
    const zoomIn = interpretWheel(wheel({ ctrlKey: true, deltaY: -100 }), WIDTH);
    const zoomOut = interpretWheel(wheel({ ctrlKey: true, deltaY: 100 }), WIDTH);

    expect(zoomIn?.type === 'zoom' && zoomIn.factor).toBeGreaterThan(1);
    expect(zoomOut?.type === 'zoom' && zoomOut.factor).toBeLessThan(1);
  });

  it('clamps the zoom anchor to the canvas', () => {
    const intent = interpretWheel(wheel({ ctrlKey: true, deltaY: 10, offsetX: -40 }), WIDTH);
    expect(intent?.type === 'zoom' && intent.anchorX).toBe(0);
  });

  it('pans with Shift + wheel, whichever axis the browser reports', () => {
    expect(interpretWheel(wheel({ shiftKey: true, deltaY: 120 }), WIDTH)).toEqual({
      type: 'pan',
      deltaPx: 120,
    });
    expect(interpretWheel(wheel({ shiftKey: true, deltaX: -80 }), WIDTH)).toEqual({
      type: 'pan',
      deltaPx: -80,
    });
  });

  it('pans with horizontal trackpad swipes', () => {
    expect(interpretWheel(wheel({ deltaX: 40, deltaY: 5 }), WIDTH)).toEqual({
      type: 'pan',
      deltaPx: 40,
    });
  });

  it('leaves plain vertical scrolling to the browser', () => {
    expect(interpretWheel(wheel({ deltaY: 100 }), WIDTH)).toBeNull();
    expect(interpretWheel(wheel({ ctrlKey: true }), WIDTH)).toBeNull();
  });
});

describe('hasExceededDragThreshold', () => {
  it('ignores small jitter and detects real drags', () => {
    expect(hasExceededDragThreshold({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(hasExceededDragThreshold({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(true);
  });
});

describe('getPinchChange', () => {
  it('zooms in when the fingers spread, around their midpoint', () => {
    const change = getPinchChange(
      [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      [
        { x: 50, y: 0 },
        { x: 250, y: 0 },
      ],
    );
    expect(change).toEqual({ anchorX: 150, factor: 2, panDeltaPx: 0 });
  });

  it('pans back in time when both fingers move right', () => {
    const change = getPinchChange(
      [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      [
        { x: 130, y: 0 },
        { x: 230, y: 0 },
      ],
    );
    expect(change.factor).toBe(1);
    expect(change.panDeltaPx).toBe(-30);
  });

  it('ignores a degenerate pinch', () => {
    const same = { x: 10, y: 10 };
    expect(getPinchChange([same, same], [same, { x: 20, y: 10 }]).factor).toBe(1);
  });
});
