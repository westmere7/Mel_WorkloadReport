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
    return <div className="absolute -left-6 -top-6 w-20 h-20 rounded-full bg-white/10 -z-10 pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />
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
  fontStyle,
  titleWeight,
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
  fontStyle: string
  titleWeight: string
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
      <p className={`sc-kicker sc-a-riseSoft sc-font-${fontStyle}`} style={dly(baseKicker)}>
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </p>
      <h2 className={`sc-project-name sc-font-${fontStyle} sc-weight-${titleWeight}`}>
        <ScMaskText text={project.name} per="word" delayMs={baseName} stepMs={revealStagger} effect={typoEffect} />
      </h2>
      
      {(chips.length > 0 || showSize) && (
        <div className="sc-chip-row">
          {chips.map((c, i) => (
            <span key={`${c}-${i}`} className={`sc-chip sc-a-pop sc-font-${fontStyle}`} style={dly(baseChips + i * revealStagger)}>
              {c}
            </span>
          ))}
          {showSize && (
            <span
              className={`sc-chip sc-chip-size sc-a-pop sc-font-${fontStyle} font-bold`}
              style={{ ...dly(baseChips + chips.length * revealStagger), background: SIZE_COLORS[project.size] }}
            >
              {project.size}
            </span>
          )}
        </div>
      )}

      {showSub && (
        <p className={`sc-sub sc-a-riseSoft sc-font-${fontStyle}`} style={dly(baseSub)}>
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
          <span className={`sc-stat-label sc-a-riseSoft sc-font-${fontStyle}`} style={dly(baseAssets + 150)}>
            assets
          </span>
        </div>
      )}

      {showAssetBreakdown && breakdown.length > 0 && (
        <div className="sc-chip-row">
          {breakdown.map((b, i) => (
            <span key={b.name} className={`sc-chip sc-chip-quiet sc-a-pop sc-font-${fontStyle}`} style={dly(baseBreakdown + i * revealStagger)}>
              <strong>{b.value}</strong> {b.name}
            </span>
          ))}
        </div>
      )}

      {showNote && project.note && (
        <p className={`sc-project-note sc-a-riseSoft sc-font-${fontStyle}`} style={dly(baseNote)}>
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
  fontStyle,
  titleWeight,
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
    fontStyle,
    titleWeight,
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
    const typoVar = layoutVariant % 5
    
    // Preset 1: Editorial Split Banner
    if (typoVar === 1) {
      return (
        <div className="sc-body sc-project-split-banner">
          <div className="sc-split-banner-left sc-a-pop" style={dly(revealDelay)}>
            <div className="sc-banner-inner">
              <span className={`sc-banner-massive-text sc-a-rise sc-font-${fontStyle} sc-weight-black`} style={dly(revealDelay + 150)}>
                {project.size}
              </span>
              <span className={`sc-banner-subtitle sc-font-${fontStyle}`}>PROJECT {String(index + 1).padStart(2, '0')}</span>
            </div>
          </div>
          <div className="sc-split-banner-right">
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // Preset 2: Indented staggered typography block
    if (typoVar === 2) {
      return (
        <div className="sc-body sc-project-typo flex flex-col justify-center items-start pl-16 text-left w-full">
          <ProjectContent {...contentProps} />
        </div>
      )
    }

    // Preset 3: Minimalist grid layout
    if (typoVar === 3) {
      return (
        <div className="sc-body grid grid-cols-2 gap-8 items-center w-full">
          <div className="text-left">
            <ProjectContent {...contentProps} />
          </div>
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/20 rounded-2xl bg-white/5">
            <span className={`text-[110px] leading-none font-black text-white tracking-tight sc-font-${fontStyle} sc-weight-black`}>
              {project.size}
            </span>
            <span className={`text-xs uppercase tracking-widest text-[#ffb81c] font-bold mt-3 sc-font-${fontStyle}`}>
              Scope & Scale
            </span>
          </div>
        </div>
      )
    }

    // Preset 4: Stretched Quote bar
    if (typoVar === 4) {
      return (
        <div className="sc-body flex items-stretch gap-6 w-full pl-8">
          <div className="w-1.5 bg-gradient-to-b from-[#e61e2a] to-[#ffb81c] rounded-full shrink-0" />
          <div className="flex-1 flex items-center text-left">
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // Preset 0 & fallback: Default centered typographic watermark layout
    return (
      <div className="sc-body sc-project-typo">
        <span className={`sc-watermark sc-font-${fontStyle} sc-weight-black`} aria-hidden>
          {showCode && project.code ? project.code : project.campaign}
        </span>
        <ProjectContent {...contentProps} />
      </div>
    )
  }

  // ── 1 Image layout variants ──────────────────────────────────
  if (images.length === 1) {
    const oneImageVar = layoutVariant % 6

    // Preset 1: Editorial details left, tilted floating card right
    if (oneImageVar === 1) {
      const spec = collage[0] || { rot: 3, dx: 0, dy: 0, bobDelay: 0 }
      return (
        <div className="sc-body sc-project-split sc-floating-layout">
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

    // Preset 2: Wide vertical banner left, details right
    if (oneImageVar === 2) {
      return (
        <div className="sc-body sc-project-split sc-asymmetric-layout">
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

    // Preset 3: Polaroid card composition centered
    if (oneImageVar === 3) {
      return (
        <div className="sc-body sc-polaroid-layout">
          <div className="sc-polaroid-frame relative sc-a-pop" style={dly(revealDelay + 100)}>
            <img src={images[0].url} alt="" />
            <span className="sc-polaroid-caption">{project.name}</span>
          </div>
        </div>
      )
    }

    // Preset 4: Framed Circular Crop right, details left
    if (oneImageVar === 4) {
      return (
        <div className="sc-body sc-crop-circle-layout">
          <div className="sc-project-left">
            <ProjectContent {...contentProps} />
          </div>
          <div className="sc-circle-crop-wrap">
            <RenderDecoShape shape={decoShape} />
            <div className={`sc-circle-crop-container sc-a-pop ${cardDecorations}`} style={dly(baseChips + 50)}>
              <img src={images[0].url} alt="" />
            </div>
          </div>
        </div>
      )
    }

    // Preset 5: Split horizontal banner layout (image top, text bottom)
    if (oneImageVar === 5) {
      return (
        <div className="sc-body flex flex-col gap-6 justify-center w-full max-w-[50em] mx-auto text-left">
          <div className={`w-full h-[14em] rounded-2xl overflow-hidden relative sc-a-pop ${cardDecorations}`} style={dly(revealDelay)}>
            <RenderDecoShape shape={decoShape} />
            <img src={images[0].url} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // Preset 0: Full-bleed Ken Burns background (default)
    return (
      <div className="sc-body">
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
  const multiImageVar = layoutVariant % 6

  // Preset 1: Grid Collage
  if (multiImageVar === 1) {
    return (
      <div className="sc-body sc-project-split sc-grid-layout">
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

  // Preset 2: RMIT curved arch publication fan
  if (multiImageVar === 2) {
    const archPositions = [
      { rot: -18, x: -8, y: 5 },
      { rot: -4, x: 0, y: -2 },
      { rot: 12, x: 8, y: 4 },
      { rot: 25, x: 15, y: 10 },
    ]
    return (
      <div className="sc-body sc-project-split sc-arch-layout">
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

  // Preset 3: Masonry staggered steps layout
  if (multiImageVar === 3) {
    return (
      <div className="sc-body sc-masonry-layout">
        <div className="sc-project-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-masonry-container">
          <RenderDecoShape shape={decoShape} />
          {images.slice(0, 3).map((im, i) => (
            <div
              key={im.url + i}
              className={`sc-masonry-card sc-masonry-card-${i + 1} sc-a-pop ${cardDecorations}`}
              style={dly(baseChips + i * revealStagger)}
            >
              <img src={im.url} alt="" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Preset 4: Horizontal Filmstrip layout
  if (multiImageVar === 4) {
    return (
      <div className="sc-body sc-filmstrip-layout">
        <div className="text-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-filmstrip-container relative">
          <RenderDecoShape shape={decoShape} />
          {images.slice(0, 3).map((im, i) => (
            <div
              key={im.url + i}
              className={`sc-filmstrip-card sc-a-pop ${cardDecorations}`}
              style={dly(baseChips + i * revealStagger)}
            >
              <img src={im.url} alt="" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Preset 5: Featured Center Split layout
  if (multiImageVar === 5) {
    return (
      <div className="sc-body sc-featured-split-layout">
        <div className="sc-project-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-featured-images-grid relative">
          <RenderDecoShape shape={decoShape} />
          <div className={`sc-featured-main sc-a-pop ${cardDecorations}`} style={dly(baseChips)}>
            <img src={images[0].url} alt="" />
          </div>
          <div className="sc-featured-side-stack">
            {images.slice(1, 3).map((im, i) => (
              <div
                key={im.url + i}
                className={`sc-featured-side-card sc-a-pop ${cardDecorations}`}
                style={dly(baseChips + 150 + i * revealStagger)}
              >
                <img src={im.url} alt="" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Preset 0: Default collage stack (left details, right collage stack)
  return (
    <div className="sc-body sc-project-split">
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
