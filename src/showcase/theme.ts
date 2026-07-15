import type { CanvasPreset, PacingPreset } from '../lib/showcase'

/** Pace multiplier applied identically to JS scene boundaries and CSS durations. */
export const PACE: Record<PacingPreset, number> = { fast: 0.85, normal: 1, relaxed: 1.25 }

/**
 * Scene-to-scene cross-transition length (base ms, pace-scaled). Snappy — the
 * storyboard cuts hard between brand panels.
 */
export const TRANSITION_MS = 640
/** Reduced-motion variant: quicker plain crossfade. */
export const TRANSITION_MS_REDUCED = 400

export const CANVAS: Record<CanvasPreset, { w: number; h: number }> = {
  '1920x1080': { w: 1920, h: 1080 },
  '1080x1080': { w: 1080, h: 1080 },
}

/**
 * Brand constants (kept here for the odd inline style that can't use the CSS
 * vars). The per-scene background/ink palettes live in showcase.css as
 * `.sc-bg-*` classes — every scene paints its own panel.
 */
export const BRAND_RED = '#e61e2a'
export const BRAND_NAVY = '#000054'
