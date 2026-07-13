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

function getCardStyle(borderStyle: string, shadowStyle: string) {
  let borderClass = ''
  if (borderStyle === 'thin') borderClass = 'border border-white/20'
  else if (borderStyle === 'thick') borderClass = 'border-[6px] border-white/95'

  let shadowClass = 'shadow-md'
  if (shadowStyle === 'sm') shadowClass = 'shadow-sm'
  else if (shadowStyle === 'md') shadowClass = 'shadow-md'
  else if (shadowStyle === 'lg') shadowClass = 'shadow-lg'
  else if (shadowStyle === 'xl') shadowClass = 'shadow-2xl'

  return `${borderClass} ${shadowClass}`
}

function RenderDecoShape({ shape }: { shape: string }) {
  if (shape === 'circle') {
    return <div className="absolute -left-6 -top-6 w-20 h-20 rounded-full bg-white/10 -z-10 pointer-events-none" />
  }
  if (shape === 'square') {
    return <div className="absolute -right-6 -bottom-6 w-16 h-16 bg-[#ffb81c]/10 rotate-12 -z-10 pointer-events-none" />
  }
  if (shape === 'dots') {
    return (
      <div
        className="absolute -right-6 -top-6 w-16 h-16 -z-10 pointer-events-none opacity-25"
        style={{
          backgroundImage: 'radial-gradient(circle, #fff 1.5px, transparent 1.5px)',
          backgroundSize: '8px 8px',
        }}
      />
    )
  }
  return null
}

/** Shared content column: name, meta chips, dates, asset odometer, breakdown. */
function ProjectContent({
  project,
  index,
  total,
  showCode,
  pace,
  revealDelay,
  revealStagger,
  typoEffect,
  showCampaign,
  showSquad,
  showPeople,
  showSize,
  showDates,
  showNote,
  showAssetTotal,
  showAssetBreakdown,
}: {
  project: ShowcaseProject
  index: number
  total: number
  showCode: boolean
  pace: number
  revealDelay: number
  revealStagger: number
  typoEffect: string
  showCampaign: boolean
  showSquad: boolean
  showPeople: boolean
  showSize: boolean
  showDates: boolean
  showNote: boolean
  showAssetTotal: boolean
  showAssetBreakdown: boolean
}) {
  const chips = []
  if (showCampaign) chips.push(project.campaign)
  if (showSquad) chips.push(project.squad)
  if (showPeople && project.people.length > 0) {
    chips.push(`${project.people.length} ${project.people.length === 1 ? 'creative' : 'creatives'}`)
  }

  const breakdown = topBreakdown(project.assetBreakdown)
  const dates = [fmtDate(project.startDate), fmtDate(project.endDate)].filter(Boolean).join(' — ')
  const durationText = project.durationDays ? ` · ${project.durationDays} days` : ''

  const showSub = (showCode && project.code) || showDates

  const baseKicker = revealDelay
  const baseName = revealDelay + 100
  const baseChips = baseName + 450
  const baseSub = baseChips + 250
  const baseAssets = baseSub + 100
  const baseBreakdown = baseAssets + 250
  const baseNote = baseBreakdown + 150

  return (
    <div className="sc-project-content">
      <p className="sc-kicker sc-a-riseSoft" style={dly(baseKicker)}>
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </p>
      <h2 className="sc-project-name">
        <ScMaskText text={project.name} per="word" delayMs={baseName} stepMs={revealStagger} effect={typoEffect} />
      </h2>
      
      {(chips.length > 0 || showSize) && (
        <div className="sc-chip-row">
          {chips.map((c, i) => (
            <span key={`${c}-${i}`} className="sc-chip sc-a-pop" style={dly(baseChips + i * revealStagger)}>
              {c}
            </span>
          ))}
          {showSize && (
            <span
              className="sc-chip sc-chip-size sc-a-pop"
              style={{ ...dly(baseChips + chips.length * revealStagger), background: SIZE_COLORS[project.size] }}
            >
              {project.size}
            </span>
          )}
        </div>
      )}

      {showSub && (
        <p className="sc-sub sc-a-riseSoft" style={dly(baseSub)}>
          {showCode && project.code ? `${project.code}` : ''}
          {showCode && project.code && showDates && dates ? ' · ' : ''}
          {showDates ? `${dates}${durationText}` : ''}
        </p>
      )}

      {showAssetTotal && (
        <div className="sc-project-assets">
          <span className="sc-stat-number sc-a-fade" style={dly(baseAssets)}>
            <ScCounter value={project.assetTotal} delayMs={(baseAssets + 100) * pace} durationMs={900 * pace} />
          </span>
          <span className="sc-stat-label sc-a-riseSoft" style={dly(baseAssets + 150)}>
            assets
          </span>
        </div>
      )}

      {showAssetBreakdown && breakdown.length > 0 && (
        <div className="sc-chip-row">
          {breakdown.map((b, i) => (
            <span key={b.name} className="sc-chip sc-chip-quiet sc-a-pop" style={dly(baseBreakdown + i * revealStagger)}>
              <strong>{b.value}</strong> {b.name}
            </span>
          ))}
        </div>
      )}

      {showNote && project.note && (
        <p className="sc-project-note sc-a-riseSoft" style={dly(baseNote)}>
          * “{project.note}”
        </p>
      )}
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
  layoutVariant,
  cameraMove,
  revealDelay,
  revealStagger,
  typoEffect,
  borderStyle,
  shadowStyle,
  decoShape,
  showCampaign,
  showSquad,
  showPeople,
  showSize,
  showDates,
  showNote,
  showAssetTotal,
  showAssetBreakdown,
}: {
  project: ShowcaseProject
  index: number
  total: number
  kb: KenBurnsVariant
  collage: CollageSpec[]
  showCode: boolean
  pace: number
  layoutVariant: number
  cameraMove: string
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
}) {
  const images = project.images

  const contentProps = {
    project,
    index,
    total,
    showCode,
    pace,
    revealDelay,
    revealStagger,
    typoEffect,
    showCampaign,
    showSquad,
    showPeople,
    showSize,
    showDates,
    showNote,
    showAssetTotal,
    showAssetBreakdown,
  }

  const baseName = revealDelay + 100
  const baseChips = baseName + 450
  const cardDecorations = getCardStyle(borderStyle, shadowStyle)

  // ── No images (Typographic layout variants) ───────────────────
  if (images.length === 0) {
    const isEditorialSplit = layoutVariant % 2 === 1
    if (isEditorialSplit) {
      return (
        <div className={`sc-body sc-project-split-banner sc-camera-${cameraMove}`}>
          <div className="sc-split-banner-left sc-a-pop" style={dly(revealDelay)}>
            <div className="sc-banner-inner">
              <span className="sc-banner-massive-text sc-a-rise" style={dly(revealDelay + 150)}>
                {project.size}
              </span>
              <span className="sc-banner-subtitle">PROJECT {String(index + 1).padStart(2, '0')}</span>
            </div>
          </div>
          <div className="sc-split-banner-right">
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    return (
      <div className={`sc-body sc-project-typo sc-camera-${cameraMove}`}>
        <span className="sc-watermark" aria-hidden>
          {showCode && project.code ? project.code : project.campaign}
        </span>
        <ProjectContent {...contentProps} />
      </div>
    )
  }

  // ── 1 Image layout variants ──────────────────────────────────
  if (images.length === 1) {
    const oneImageVar = layoutVariant % 3
    if (oneImageVar === 1) {
      // Editorial layout: details left, tilted floating card right
      const spec = collage[0] || { rot: 3, dx: 0, dy: 0, bobDelay: 0 }
      return (
        <div className={`sc-body sc-project-split sc-floating-layout sc-camera-${cameraMove}`}>
          <div className="sc-project-left">
            <ProjectContent {...contentProps} />
          </div>
          <div className="sc-floating-card-wrap relative">
            <RenderDecoShape shape={decoShape} />
            <div
              className={`sc-single-floating-card sc-a-pop ${cardDecorations}`}
              style={{
                ...dly(baseChips + 100),
                ...cssVars({
                  '--rot': `${spec.rot || 3}deg`,
                  '--dx': `0%`,
                  '--dy': `0%`,
                  '--bob-delay': `${spec.bobDelay || 0}ms`,
                }),
              }}
            >
              <img src={images[0].url} alt="" />
            </div>
          </div>
        </div>
      )
    }

    if (oneImageVar === 2) {
      // Editorial layout: wide vertical image card left, details right
      return (
        <div className={`sc-body sc-project-split sc-asymmetric-layout sc-camera-${cameraMove}`}>
          <div className="sc-vertical-banner-wrap relative">
            <RenderDecoShape shape={decoShape} />
            <div className={`sc-vertical-banner-img-container sc-a-pop ${cardDecorations}`} style={dly(revealDelay + 50)}>
              <img src={images[0].url} alt="" className="sc-vertical-banner-img" />
            </div>
          </div>
          <div className="sc-project-right">
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // Default 1-image variant: Full-bleed Ken Burns background
    return (
      <div className={`sc-body sc-camera-${cameraMove}`}>
        <div className="sc-kb-wrap">
          <img src={images[0].url} alt="" className={`sc-kb sc-kb-${kb}`} />
        </div>
        <div className="sc-scrim sc-a-fade" />
        <div className="sc-project-lower">
          <ProjectContent {...contentProps} />
        </div>
      </div>
    )
  }

  // ── 2+ Images layout variants ─────────────────────────────────
  const multiImageVar = layoutVariant % 3
  if (multiImageVar === 1) {
    // Layout 1: Grid Collage
    return (
      <div className={`sc-body sc-project-split sc-grid-layout sc-camera-${cameraMove}`}>
        <div className="sc-project-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-collage-grid relative">
          <RenderDecoShape shape={decoShape} />
          {images.slice(0, 4).map((im, i) => (
            <div
              key={im.url + i}
              className={`sc-grid-card sc-grid-card-${i + 1} sc-a-pop ${cardDecorations}`}
              style={dly(baseChips + i * revealStagger * 1.5)}
            >
              <img src={im.url} alt="" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (multiImageVar === 2) {
    // Layout 2: RMIT publication curved arch collage
    const archPositions = [
      { rot: -18, x: -8, y: 5 },
      { rot: -4, x: 0, y: -2 },
      { rot: 12, x: 8, y: 4 },
      { rot: 25, x: 15, y: 10 },
    ]
    return (
      <div className={`sc-body sc-project-split sc-arch-layout sc-camera-${cameraMove}`}>
        <div className="sc-project-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-fan-arch relative">
          <div className="sc-arch-glow sc-a-bloom" />
          <RenderDecoShape shape={decoShape} />
          {images.slice(0, 4).map((im, i) => {
            const pos = archPositions[i] || archPositions[archPositions.length - 1]
            const spec = collage[i] || { bobDelay: 0 }
            return (
              <div
                key={im.url + i}
                className={`sc-arch-card sc-a-pop ${cardDecorations}`}
                style={{
                  ...dly(baseChips + i * revealStagger),
                  ...cssVars({
                    '--rot': `${pos.rot}deg`,
                    '--dx': `${pos.x}em`,
                    '--dy': `${pos.y}em`,
                    '--bob-delay': `${spec.bobDelay}ms`,
                    zIndex: 10 + i,
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

  // Default 2+ images layout: Left content, right floating collage stack
  return (
    <div className={`sc-body sc-project-split sc-camera-${cameraMove}`}>
      <div className="sc-project-left">
        <ProjectContent {...contentProps} />
      </div>
      <div className="sc-collage relative">
        <RenderDecoShape shape={decoShape} />
        {images.slice(0, 4).map((im, i) => {
          const spec = collage[i]
          return (
            <div
              key={im.url + i}
              className={`sc-collage-card sc-a-pop ${cardDecorations}`}
              style={{
                ...dly(baseChips + i * revealStagger),
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
