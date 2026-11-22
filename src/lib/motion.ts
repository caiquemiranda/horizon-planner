/**
 * Motion tokens for JavaScript animations. Mirrors the CSS tokens in `globals.css`
 * (`--duration-*`, `--ease-out-expo`); see docs/design.md.
 */

/** Durations in seconds (Motion's unit). */
export const DURATION = {
  fast: 0.12,
  base: 0.18,
  slow: 0.28,
} as const;

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Whether the user asked the system to minimize animations. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
