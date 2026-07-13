import type { ShowcaseProject, ShowcaseStat, Top3Block } from '../lib/showcase'

/**
 * Engine-internal types. A ShowcaseConfig compiles into a flat Scene[] — all
 * variance (Ken Burns direction, collage tilts, wipe variants) is drawn from
 * the config seed at compile time and BAKED into payloads, so the same config
 * always plays identically.
 */

export type KenBurnsVariant = 'a' | 'b' | 'c' | 'd'

export interface CollageSpec {
  /** Card rotation in degrees (±7). */
  rot: number
  /** Offsets as % of the collage area. */
  dx: number
  dy: number
  /** Bob phase delay in ms (negative = mid-phase start). */
  bobDelay: number
}

export type ScenePayload =
  | { kind: 'intro'; year: number; title: string; teamName: string; staff: string[] }
  | { kind: 'section'; kicker: string; word: string; sub: string }
  | {
      kind: 'project'
      project: ShowcaseProject
      index: number
      total: number
      kb: KenBurnsVariant
      collage: CollageSpec[]
      showCode: boolean
      showImages: boolean
      layoutVariant: number
      fontStyle: string
      titleWeight: string
      revealDelay: number
      revealStagger: number
      typoEffect: string
      borderStyle: string
      shadowStyle: string
      decoShape: string
      showCampaign: boolean
      showSquad: boolean
      showPeople: boolean
      showSize: boolean
      showDates: boolean
      showNote: boolean
      showAssetTotal: boolean
      showAssetBreakdown: boolean
    }
  | { kind: 'statTrio'; stats: ShowcaseStat[] }
  | { kind: 'statDist'; stat: ShowcaseStat }
  | { kind: 'top3'; block: Top3Block }

export type SceneKind = ScenePayload['kind']
export type SceneEnter = 'zoom' | 'wipeX' | 'wipeCircle'

export interface Scene {
  /** Stable id — the React key (prefixed by loop cycle in the player). */
  id: string
  kind: SceneKind
  /** Base duration at pacing=normal; the player multiplies by the pace factor. */
  durationMs: number
  enter: SceneEnter
  payload: ScenePayload
}

/** Seeded, per-showcase background decoration parameters. */
export interface StageDecor {
  /** Negative animation-delays that de-phase the three aurora blobs. */
  blobDelays: [number, number, number]
  /** Initial rotation offset for the geometric ring. */
  ringOffset: number
}

export interface CompiledShowcase {
  scenes: Scene[]
  decor: StageDecor
}
