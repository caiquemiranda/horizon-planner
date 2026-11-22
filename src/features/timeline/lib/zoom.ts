import { ZOOM_LIMITS, type ZoomPreset } from '@/types/timeline';

import { ZOOM_PRESETS } from './ticks';

/** Zoom change of one step of the +/- controls and keyboard shortcuts. */
export const ZOOM_STEP_FACTOR = 1.5;

/** Preset closest to a zoom level, measured on a log scale (how zoom is perceived). */
export function getNearestPreset(pxPerDay: number): ZoomPreset {
  let nearest = ZOOM_PRESETS[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const preset of ZOOM_PRESETS) {
    const distance = Math.abs(Math.log(preset.pxPerDay / pxPerDay));
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = preset;
    }
  }

  if (!nearest) throw new Error('ZOOM_PRESETS must not be empty');
  return nearest;
}

/** Small tolerance so floating point noise does not keep a limit button enabled. */
const LIMIT_EPSILON = 1e-6;

export function canZoomIn(pxPerDay: number): boolean {
  return pxPerDay < ZOOM_LIMITS.max - LIMIT_EPSILON;
}

export function canZoomOut(pxPerDay: number): boolean {
  return pxPerDay > ZOOM_LIMITS.min + LIMIT_EPSILON;
}
