import type { ShowcaseConfig, ShowcaseStat } from '../lib/showcase'
import { jitter, mulberry32, pick, range } from './prng'
import type { CollageSpec, CompiledShowcase, KenBurnsVariant, Scene, SceneEnter, ScenePayload } from './types'

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
 * Expand a config into the flat, deterministic scene list. All seeded variance
 * is drawn HERE (in a fixed order) and baked into payloads — scenes never touch
 * the PRNG at render time.
 */
export function compileScenes(config: ShowcaseConfig): CompiledShowcase {
  const rng = mulberry32(config.seed)
  const scenes: Scene[] = []

  // Stage decor first so blob phases don't shift when sections change.
  const decor = {
    blobDelays: [-range(rng, 0, 24), -range(rng, 0, 24), -range(rng, 0, 24)] as [number, number, number],
    ringOffset: Math.round(range(rng, 0, 360)),
  }

  let sectionNo = 0
  const nextWipe = (): SceneEnter => (pick(rng, [0, 1]) === 0 ? 'wipeX' : 'wipeCircle')

  const push = (kind: Scene['kind'], durationMs: number, enter: SceneEnter, payload: ScenePayload) =>
    scenes.push({ id: `${scenes.length}-${kind}`, kind, durationMs: Math.round(durationMs), enter, payload })

  for (const section of config.sectionOrder) {
    if (section === 'intro') {
      push('intro', clamp(5200 + config.staff.length * 90, 5200, 7000), 'zoom', {
        kind: 'intro',
        year: config.year,
        title: config.title,
        teamName: config.teamName,
        staff: config.staff,
      })
      continue
    }

    if (section === 'projects' && config.projects.length) {
      sectionNo++
      push('section', 2800, nextWipe(), {
        kind: 'section',
        kicker: `Chapter ${String(sectionNo).padStart(2, '0')}`,
        word: 'The Work',
        sub: `${config.projects.length} project${config.projects.length === 1 ? '' : 's'} in ${config.year}`,
      })
      config.projects.forEach((project, index) => {
        const images = config.style.showImages ? project.images : []
        const chips = topBreakdown(project.assetBreakdown).length
        const dur = clamp(
          6000 + (images.length >= 2 ? 800 : 0) + (project.name.length > 28 ? 400 : 0) + chips * 120,
          5200,
          8200,
        )
        // Draw variance for EVERY project regardless of image count so the
        // sequence stays deterministic even if showImages is toggled.
        const kb = pick(rng, ['a', 'b', 'c', 'd'] as KenBurnsVariant[])
        const layoutVariant = pick(rng, [0, 1, 2])
        const collage: CollageSpec[] = Array.from({ length: 4 }, (_, i) => ({
          rot: jitter(rng, 6.5),
          dx: jitter(rng, 3.5),
          dy: jitter(rng, 3),
          bobDelay: -Math.round(range(rng, 0, 8000)) - i * 350,
        }))
        push('project', dur, 'zoom', {
          kind: 'project',
          project: { ...project, images },
          index,
          total: config.projects.length,
          kb,
          collage,
          showCode: config.style.showCodes,
          showImages: config.style.showImages,
          layoutVariant,
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
      push('section', 2800, nextWipe(), {
        kind: 'section',
        kicker: `Chapter ${String(sectionNo).padStart(2, '0')}`,
        word: 'By the Numbers',
        sub: `${config.year} at a glance`,
      })
      // Chunk consecutive scalar stats (number/text) into trios; each series
      // stat becomes its own distribution scene at its position in the order.
      let buffer: ShowcaseStat[] = []
      const flush = () => {
        if (!buffer.length) return
        push('statTrio', 4200 + buffer.length * 300, 'zoom', { kind: 'statTrio', stats: buffer })
        buffer = []
      }
      for (const stat of config.stats) {
        if (stat.kind === 'series') {
          flush()
          const rows = stat.monthly ? 12 : Math.min(stat.series?.length ?? 0, 7)
          push('statDist', clamp(4200 + rows * 180, 4200, 6500), 'zoom', { kind: 'statDist', stat })
        } else {
          buffer.push(stat)
          if (buffer.length === 3) flush()
        }
      }
      flush()
      continue
    }

    if (section === 'top3' && config.top3.length) {
      for (const block of config.top3) {
        push('top3', 6200, nextWipe(), { kind: 'top3', block })
      }
    }
  }

  return { scenes, decor }
}
