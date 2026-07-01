import type { AssetBreakdown, Squad, TaskInput } from '../types'
import { SQUADS, DEFAULT_CAMPAIGNS, DEFAULT_TYPES, DEFAULT_PEOPLE, SIZES } from '../constants'
import { deriveHalf } from './taskCode'

const DESCRIPTORS = [
  'Hero Suite', 'Social Pack', 'Digital Display Set', 'Signage Suite', 'Launch Assets',
  'Explainer Video', 'EDM Banners', 'Brochure Refresh', 'Landing Page Visuals', 'TikTok Series',
  'Motion Loop Pack', 'Print Collateral', 'Key Visual', 'Countdown Assets', 'Testimonial Reels',
  'Wrap-up Recap', 'Teaser Campaign', 'Info Pack', 'Booth Graphics', 'Offer Round Pack',
]

const ri = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(arr: T[]): T => arr[ri(arr.length)]
const pad = (n: number) => String(n).padStart(2, '0')

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(ri(copy.length), 1)[0])
  return out
}

/**
 * Generate varied demo tasks spread across the year (for dev/testing).
 * Returns plain TaskInput objects, so it works against any backend.
 */
export function generateSampleTasks(count = 60): TaskInput[] {
  const seqByDay = new Map<string, number>()
  const out: TaskInput[] = []

  for (let i = 0; i < count; i++) {
    const squad = pick(SQUADS) as Squad
    const campaign = pick(DEFAULT_CAMPAIGNS)
    const month = 1 + ri(12)
    const day = 1 + ri(28)
    const startDate = `2026-${pad(month)}-${pad(day)}`
    const half = deriveHalf(startDate)

    const key = `${month}-${day}`
    const seq = (seqByDay.get(key) ?? 0) + 1
    seqByDay.set(key, seq)
    const code = `26.${pad(month)}${pad(day)}.${String.fromCharCode(64 + Math.min(seq, 26))}`

    const name = `${campaign} ${pick(DESCRIPTORS)}`
    const types = sample(DEFAULT_TYPES, 1 + ri(4))
    const people = sample(DEFAULT_PEOPLE, 1 + ri(4))

    const assetBreakdown: AssetBreakdown = {
      Image: ri(13),
      Video: ri(7),
      Publication: ri(9),
      'HTML5 ad': ri(11),
      'GIF / Motion': ri(6),
    }
    let assetTotal = Object.values(assetBreakdown).reduce((a, v) => a + v, 0)
    if (assetTotal === 0) {
      assetBreakdown.Image = 1
      assetTotal = 1
    }

    let endDate: string | null = null
    if (Math.random() < 0.6) {
      const dt = new Date(Date.UTC(2026, month - 1, day))
      dt.setUTCDate(dt.getUTCDate() + 5 + ri(26))
      endDate = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
    }

    out.push({
      squad,
      campaign,
      code,
      name,
      types,
      assetTotal,
      assetBreakdown,
      people,
      startDate,
      endDate,
      half,
      size: pick(SIZES),
    })
  }

  return out
}
