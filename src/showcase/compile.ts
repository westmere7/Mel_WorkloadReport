import type { ColorMode, ShowcaseConfig, ShowcaseStat } from '../lib/showcase'
import { jitter, mulberry32, pick, range } from './prng'
import { bgFamily } from './types'
import type {
  CollageSpec,
  CompiledShowcase,
  PixelSpec,
  Scene,
  SceneBgId,
  SceneEnter,
  ScenePayload,
  StatSoloVariant,
  WhiteInk,
} from './types'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Top non-zero breakdown entries shown as chips on a project slide. */
export function topBreakdown(breakdown: Record<string, number>, n = 3): { name: string; value: number }[] {
  return Object.entries(breakdown)
    .filter(([, v]) => Number(v) > 0)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
}

/**
 * A seeded shuffle-bag: deals every item once (shuffled) before repeating, and
 * never deals the same item twice in a row across refills. This is the core
 * anti-uniformity device — layouts/effects/backgrounds cycle with variety and
 * zero immediate repeats, yet stay fully deterministic.
 */
function makeBag<T>(rng: () => number, items: readonly T[]): () => T {
  let bag: T[] = []
  let last: T | undefined
  const refill = () => {
    bag = [...items]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    // Avoid a repeat across the refill boundary.
    if (bag.length > 1 && bag[bag.length - 1] === last) {
      ;[bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]]
    }
  }
  return () => {
    if (bag.length === 0) refill()
    last = bag.pop() as T
    return last
  }
}

/**
 * Background mix profiles — the four wizard styles. Weighted pools of brand
 * panels; the picker walks them with a "different family than the previous
 * scene" rule so the room always changes on a cut (the storyboard's
 * red → navy → white rhythm).
 */
const BG_POOLS: Record<ColorMode, SceneBgId[]> = {
  // Signature mix — the balanced storyboard rotation.
  gradient: ['red', 'navy', 'white', 'redGrad', 'navyGrad', 'red', 'navy', 'duoGrad', 'white'],
  // Red dominant — red-led, navy/white for contrast cuts.
  red: ['red', 'red', 'redGrad', 'navy', 'white', 'red', 'duoGrad', 'redGrad', 'navy'],
  // Navy dominant.
  navy: ['navy', 'navy', 'navyGrad', 'red', 'white', 'navy', 'duoGrad', 'navyGrad', 'red'],
  // Light gallery — white-led with brand punch panels.
  light: ['white', 'white', 'red', 'white', 'navy', 'white', 'redGrad', 'white', 'duoGrad'],
}

function makeBgPicker(rng: () => number, mode: ColorMode) {
  const bag = makeBag(rng, BG_POOLS[mode] ?? BG_POOLS.gradient)
  let lastFamily: string | null = null
  return {
    next(): SceneBgId {
      // Draw until the family changes (bounded — the bag always contains ≥2 families).
      for (let tries = 0; tries < 8; tries++) {
        const bg = bag()
        if (bgFamily(bg) !== lastFamily) {
          lastFamily = bgFamily(bg)
          return bg
        }
      }
      lastFamily = null
      return bag()
    },
    /** Record a FORCED background (intro / split panels) so the next draw still changes family. */
    note(bg: SceneBgId) {
      lastFamily = bgFamily(bg)
    },
  }
}

/** Seeded RMIT pixel-cluster corner decoration (~ the brand's pixel language). */
function makePixels(rng: () => number): PixelSpec {
  const corner = pick(rng, [0, 1, 2, 3] as const)
  const count = 5 + Math.floor(range(rng, 0, 5)) // 5–9 pixels
  const cells: PixelSpec['cells'] = []
  const used = new Set<string>()
  // Bias toward the corner (0,0 = the corner itself) for a decaying cluster.
  while (cells.length < count) {
    const x = Math.floor(Math.min(range(rng, 0, 5), range(rng, 0, 5)))
    const y = Math.floor(Math.min(range(rng, 0, 5), range(rng, 0, 5)))
    const key = `${x},${y}`
    if (used.has(key)) continue
    used.add(key)
    cells.push({ x, y, d: Math.round(range(rng, 0, 700)) })
  }
  return { corner, cells }
}

/**
 * Expand a config into the flat, deterministic scene list. All seeded variance
 * is drawn HERE (in a fixed order) and baked into payloads — scenes never touch
 * the PRNG at render time.
 */
export function compileScenes(config: ShowcaseConfig): CompiledShowcase {
  const rng = mulberry32(config.seed)
  const scenes: Scene[] = []

  const mode: ColorMode = config.style.colorMode ?? 'gradient'
  const bgPicker = makeBgPicker(rng, mode)
  const enterBag = makeBag(rng, ['wipeX', 'wipeUp', 'push', 'zoom'] as SceneEnter[])
  const statVariantBag = makeBag(rng, ['counter', 'ticker', 'gradient', 'split'] as StatSoloVariant[])
  const whiteInkBag = makeBag(rng, ['red', 'navy', 'red', 'navy'] as WhiteInk[])
  // Independent layout bags per image-count class so consecutive projects never
  // share an archetype (regardless of how their image counts interleave).
  const typoBag = makeBag(rng, [0, 1, 2, 3, 4])
  const oneImgBag = makeBag(rng, [0, 1, 2, 3, 4, 5])
  const multiImgBag = makeBag(rng, [0, 1, 2, 3, 4, 5])

  let sectionNo = 0

  const push = (
    kind: Scene['kind'],
    durationMs: number,
    payload: ScenePayload,
    opts?: { bg?: SceneBgId; enter?: SceneEnter; pixelChance?: number },
  ) => {
    let bg: SceneBgId
    if (opts?.bg) {
      bg = opts.bg
      bgPicker.note(bg) // keep the no-adjacent-family rule intact after forced panels
    } else {
      bg = bgPicker.next()
    }
    const whiteInk = whiteInkBag()
    // Pixel decor on a seeded minority of scenes (drawn ALWAYS to keep the
    // PRNG sequence stable regardless of the chance gate).
    const pixels = makePixels(rng)
    const usePixels = rng() < (opts?.pixelChance ?? 0.4)
    scenes.push({
      id: `${scenes.length}-${kind}`,
      kind,
      durationMs: Math.round(durationMs),
      enter: opts?.enter ?? enterBag(),
      bg,
      whiteInk,
      pixels: usePixels ? pixels : undefined,
      payload,
    })
  }

  for (const section of config.sectionOrder) {
    if (section === 'intro') {
      push(
        'intro',
        clamp(5200 + config.staff.length * 90, 5200, 7000),
        {
          kind: 'intro',
          year: config.year,
          title: config.title,
          teamName: config.teamName,
          staff: config.staff,
        },
        // The opener always lands on the mode's home panel with a straight zoom.
        { bg: mode === 'navy' ? 'navy' : mode === 'light' ? 'white' : 'red', enter: 'zoom', pixelChance: 0.9 },
      )
      continue
    }

    if (section === 'projects' && config.projects.length) {
      sectionNo++
      push('section', 2600, {
        kind: 'section',
        kicker: `Chapter ${String(sectionNo).padStart(2, '0')}`,
        word: 'The Work',
        sub: `${config.projects.length} project${config.projects.length === 1 ? '' : 's'} in ${config.year}`,
      })
      config.projects.forEach((project, index) => {
        const images = config.style.showImages ? project.images : []
        const chips = topBreakdown(project.assetBreakdown).length
        const dur = clamp(
          5600 + (images.length >= 2 ? 700 : 0) + (project.name.length > 28 ? 400 : 0) + chips * 120,
          4900,
          7600,
        )
        // Draw variance for EVERY project in a fixed order so the sequence
        // stays deterministic even if showImages is toggled.
        const layoutVariant = images.length === 0 ? typoBag() : images.length === 1 ? oneImgBag() : multiImgBag()
        const flip = rng() < 0.5
        const sheen = rng() < 0.55
        const titleWeight = pick(rng, ['bold', 'black'])
        const revealDelay = Math.round(range(rng, 100, 320))
        const revealStagger = Math.round(range(rng, 35, 70))
        const typoEffect = pick(rng, ['rise', 'slide-fade', 'zoom-fade', 'ticker'])
        const borderStyle = pick(rng, ['none', 'thin', 'thick'])
        const shadowStyle = pick(rng, ['sm', 'md', 'lg', 'xl'])

        const collage: CollageSpec[] = Array.from({ length: 4 }, () => ({
          rot: jitter(rng, 6.5),
          dx: jitter(rng, 3.5),
          dy: jitter(rng, 3),
        }))
        push('project', dur, {
          kind: 'project',
          project: { ...project, images },
          index,
          total: config.projects.length,
          collage,
          showCode: config.style.showCodes,
          showImages: config.style.showImages,
          layoutVariant,
          flip,
          sheen,
          titleWeight,
          revealDelay,
          revealStagger,
          typoEffect,
          borderStyle,
          shadowStyle,
          showCampaign: config.style.showCampaign ?? true,
          showSquad: config.style.showSquad ?? true,
          showPeople: config.style.showPeople ?? true,
          showSize: config.style.showSize ?? true,
          showDates: config.style.showDates ?? true,
          showNote: config.style.showNote ?? true,
          showAssetTotal: config.style.showAssetTotal ?? true,
          showAssetBreakdown: config.style.showAssetBreakdown ?? true,
        })
      })
      continue
    }

    if (section === 'globalStats' && config.stats.length) {
      sectionNo++
      push('section', 2600, {
        kind: 'section',
        kicker: `Chapter ${String(sectionNo).padStart(2, '0')}`,
        word: 'By the Numbers',
        sub: `${config.year} at a glance`,
      })
      // Storyboard pacing: every scalar stat is its OWN bold, fast beat —
      // one giant figure per panel, cycling quickly. Series stats keep a
      // full-screen chart beat at their position in the order.
      for (const stat of config.stats) {
        if (stat.kind === 'series') {
          const rows = stat.monthly ? 12 : Math.min(stat.series?.length ?? 0, 7)
          push('statDist', clamp(4200 + rows * 170, 4200, 6200), { kind: 'statDist', stat })
        } else {
          const variant = statSoloVariant(stat, statVariantBag)
          push('statSolo', statSoloDuration(stat, variant), { kind: 'statSolo', stat, variant }, {
            // The split panel paints its own two-colour room.
            bg: variant === 'split' ? 'split' : undefined,
          })
        }
      }
      continue
    }

    if (section === 'top3' && config.top3.length) {
      for (const block of config.top3) {
        // Cycling spotlight list (the storyboard's pixel-arrow ticker): each
        // entry takes focus in turn (3 → 2 → 1), #1 stays lit.
        const dur = 3400 + block.entries.length * 1150
        push('top3', dur, { kind: 'top3', block })
      }
    }
  }

  return { scenes }
}

/** Pick a kinetic treatment appropriate to the stat's shape. */
function statSoloVariant(stat: ShowcaseStat, bag: () => StatSoloVariant): StatSoloVariant {
  // Draw ALWAYS (PRNG stability), then coerce for text stats: numbers can use
  // any treatment; text stats read best typed-in or gradient-filled.
  const drawn = bag()
  if (stat.kind === 'text') {
    return drawn === 'counter' || drawn === 'ticker' ? 'typewriter' : drawn
  }
  return drawn
}

function statSoloDuration(stat: ShowcaseStat, variant: StatSoloVariant): number {
  const textLen = (stat.text ?? '').length
  const base = variant === 'typewriter' ? 3000 + textLen * 45 : 3100
  return clamp(base, 2700, 4200)
}
