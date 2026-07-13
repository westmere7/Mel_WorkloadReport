import { mulberry32 } from '../lib/showcase'

export { mulberry32 }

/** Uniform float in [min, max). */
export const range = (rng: () => number, min: number, max: number) => min + rng() * (max - min)

/** Pick one element. */
export const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]

/** Symmetric jitter in [-amp, +amp]. */
export const jitter = (rng: () => number, amp: number) => (rng() * 2 - 1) * amp
