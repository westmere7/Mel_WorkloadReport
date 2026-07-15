import type { ShowcaseProject, ShowcaseStat, Top3Block } from '../lib/showcase'

/**
 * Engine-internal types. A ShowcaseConfig compiles into a flat Scene[] — all
 * variance (backgrounds, layout archetypes, kinetic-text effects, pixel decor)
 * is drawn from the config seed at compile time and BAKED into payloads, so the
 * same config always plays identically.
 *
 * 2025 storyboard rework: every scene owns its own BACKGROUND (hard brand
 * panels — red / navy / white / red↔navy gradients) so consecutive scenes cut
 * between different rooms instead of sitting on one fixed backdrop.
 */

/** Per-scene background panel. `*Grad` = subtle animated gradient of the same family. */
export type SceneBgId = 'red' | 'redGrad' | 'navy' | 'navyGrad' | 'duoGrad' | 'white' | 'split'

/** The colour family of a background — used to avoid same-family scenes back to back. */
export function bgFamily(bg: SceneBgId): 'red' | 'navy' | 'white' | 'duo' {
  if (bg === 'red' || bg === 'redGrad') return 'red'
  if (bg === 'navy' || bg === 'navyGrad') return 'navy'
  if (bg === 'white') return 'white'
  return 'duo' // duoGrad + split both read as the two-colour family
}

/** On white panels the type is brand-coloured; seeded per scene. */
export type WhiteInk = 'red' | 'navy'

/**
 * RMIT pixel-pattern decoration: a seeded cluster of little squares hugging one
 * corner (the brand's pixel language — see the storyboard's pixel arrow).
 * Positions are grid cells (0–4 on both axes), scaled/mirrored per corner.
 */
export interface PixelSpec {
  /** 0=tl 1=tr 2=bl 3=br */
  corner: 0 | 1 | 2 | 3
  /** Cluster cells: grid x/y (0–4) + stagger delay ms. */
  cells: { x: number; y: number; d: number }[]
}

/** Kinetic treatment for a solo stat beat. */
export type StatSoloVariant = 'counter' | 'ticker' | 'gradient' | 'typewriter' | 'split'

export interface CollageSpec {
  /** Card rotation in degrees (±7). */
  rot: number
  /** Offsets as % of the collage area. */
  dx: number
  dy: number
}

export type ScenePayload =
  | { kind: 'intro'; year: number; title: string; teamName: string; staff: string[] }
  | { kind: 'section'; kicker: string; word: string; sub: string }
  | {
      kind: 'project'
      project: ShowcaseProject
      index: number
      total: number
      collage: CollageSpec[]
      showCode: boolean
      showImages: boolean
      layoutVariant: number
      /** Mirror split layouts (content right instead of left). */
      flip: boolean
      /** Repeating gradient sheen across the project name once settled. */
      sheen: boolean
      titleWeight: string
      revealDelay: number
      revealStagger: number
      typoEffect: string
      borderStyle: string
      shadowStyle: string
      showCampaign: boolean
      showSquad: boolean
      showPeople: boolean
      showSize: boolean
      showDates: boolean
      showNote: boolean
      showAssetTotal: boolean
      showAssetBreakdown: boolean
    }
  | { kind: 'statSolo'; stat: ShowcaseStat; variant: StatSoloVariant }
  | { kind: 'statDist'; stat: ShowcaseStat }
  | { kind: 'top3'; block: Top3Block }

export type SceneKind = ScenePayload['kind']

/** Scene-to-scene transition. Hard, editorial cuts — no playful circles. */
export type SceneEnter = 'zoom' | 'wipeX' | 'wipeUp' | 'push'

export interface Scene {
  /** Stable id — the React key (prefixed by loop cycle in the player). */
  id: string
  kind: SceneKind
  /** Base duration at pacing=normal; the player multiplies by the pace factor. */
  durationMs: number
  enter: SceneEnter
  /** The brand panel this scene sits on. */
  bg: SceneBgId
  /** Brand ink for white panels (ignored elsewhere). */
  whiteInk: WhiteInk
  /** Optional pixel-pattern corner decoration. */
  pixels?: PixelSpec
  payload: ScenePayload
}

export interface CompiledShowcase {
  scenes: Scene[]
}
