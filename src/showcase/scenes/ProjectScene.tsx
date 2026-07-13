import { SIZE_COLORS } from '../../constants'
import { topBreakdown } from '../compile'
import { cssVars, dly } from '../bits/anim'
import { ScCounter } from '../bits/ScCounter'
import { ScMaskText } from '../bits/ScMaskText'
import type { CollageSpec, KenBurnsVariant } from '../types'
import type { ShowcaseProject } from '../../lib/showcase'

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[(m ?? 1) - 1]} ${y}`
}

/** Shared content column: name, meta chips, dates, asset odometer, breakdown. */
function ProjectContent({
  project,
  index,
  total,
  showCode,
  pace,
}: {
  project: ShowcaseProject
  index: number
  total: number
  showCode: boolean
  pace: number
}) {
  const chips = [project.campaign, project.squad, `${project.people.length} ${project.people.length === 1 ? 'person' : 'people'}`]
  const breakdown = topBreakdown(project.assetBreakdown)
  const dates = [fmtDate(project.startDate), fmtDate(project.endDate)].filter(Boolean).join(' — ')

  return (
    <div className="sc-project-content">
      <p className="sc-kicker sc-a-riseSoft" style={dly(150)}>
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </p>
      <h2 className="sc-project-name">
        <ScMaskText text={project.name} per="word" delayMs={250} stepMs={60} />
      </h2>
      <div className="sc-chip-row">
        {chips.map((c, i) => (
          <span key={`${c}-${i}`} className="sc-chip sc-a-pop" style={dly(850 + i * 60)}>
            {c}
          </span>
        ))}
        <span
          className="sc-chip sc-chip-size sc-a-pop"
          style={{ ...dly(850 + chips.length * 60), background: SIZE_COLORS[project.size] }}
        >
          {project.size}
        </span>
      </div>
      <p className="sc-sub sc-a-riseSoft" style={dly(1150)}>
        {showCode && project.code ? `${project.code} · ` : ''}
        {dates}
        {project.durationDays ? ` · ${project.durationDays} days` : ''}
      </p>
      <div className="sc-project-assets">
        <span className="sc-stat-number sc-a-fade" style={dly(1250)}>
          <ScCounter value={project.assetTotal} delayMs={1350 * pace} durationMs={900 * pace} />
        </span>
        <span className="sc-stat-label sc-a-riseSoft" style={dly(1400)}>
          assets
        </span>
      </div>
      <div className="sc-chip-row">
        {breakdown.map((b, i) => (
          <span key={b.name} className="sc-chip sc-chip-quiet sc-a-pop" style={dly(1550 + i * 60)}>
            <strong>{b.value}</strong> {b.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProjectScene({
  project,
  index,
  total,
  kb,
  collage,
  showCode,
  pace,
}: {
  project: ShowcaseProject
  index: number
  total: number
  kb: KenBurnsVariant
  collage: CollageSpec[]
  showCode: boolean
  pace: number
}) {
  const images = project.images

  // 1 image → full-bleed Ken Burns hero with a scrim, content in the lower third.
  if (images.length === 1) {
    return (
      <div className="sc-body">
        <div className="sc-kb-wrap">
          <img src={images[0].url} alt="" className={`sc-kb sc-kb-${kb}`} />
        </div>
        <div className="sc-scrim sc-a-fade" />
        <div className="sc-project-lower">
          <ProjectContent project={project} index={index} total={total} showCode={showCode} pace={pace} />
        </div>
      </div>
    )
  }

  // 2+ images → content left, seeded collage stack right.
  if (images.length >= 2) {
    return (
      <div className="sc-body sc-project-split">
        <div className="sc-project-left">
          <ProjectContent project={project} index={index} total={total} showCode={showCode} pace={pace} />
        </div>
        <div className="sc-collage">
          {images.slice(0, 4).map((im, i) => {
            const spec = collage[i]
            return (
              <div
                key={im.url + i}
                className="sc-collage-card sc-a-pop"
                style={{
                  ...dly(i * 120),
                  ...cssVars({
                    '--rot': `${spec.rot}deg`,
                    '--dx': `${spec.dx}%`,
                    '--dy': `${spec.dy}%`,
                    '--bob-delay': `${spec.bobDelay}ms`,
                    zIndex: 4 - i,
                  }),
                }}
              >
                <img src={im.url} alt="" />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // No images → typographic layout with a giant code/year watermark.
  return (
    <div className="sc-body sc-project-typo">
      <span className="sc-watermark" aria-hidden>
        {showCode && project.code ? project.code : project.campaign}
      </span>
      <ProjectContent project={project} index={index} total={total} showCode={showCode} pace={pace} />
    </div>
  )
}
