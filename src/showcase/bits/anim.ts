import type { CSSProperties } from 'react'

/** Inline CSS custom properties without fighting the CSSProperties type. */
export function cssVars(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties
}

/** Animation-delay custom prop consumed by the sc-a-* utility classes. */
export function dly(ms: number, extra?: Record<string, string | number>): CSSProperties {
  return cssVars({ '--d': `${Math.round(ms)}ms`, ...(extra ?? {}) })
}
