import { SIZE_COLORS } from '../../constants'
import { topBreakdown } from '../compile'
import { cx } from '../../lib/format'
import { cssVars, dly } from '../bits/anim'
import { ScCounter } from '../bits/ScCounter'
import { ScMaskText } from '../bits/ScMaskText'
import type { CollageSpec } from '../types'
import type { ShowcaseProject } from '../../lib/showcase'

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[(m ?? 1) - 1]} ${y}`
}

/** Card chrome variants (borders stay brand-neutral; shadows are plain black). */
function cardChrome(borderStyle: string, shadowStyle: string) {
  const border = borderStyle === 'thin' ? 'sc-cardline-thin' : borderStyle === 'thick' ? 'sc-cardline-thick' : ''
  const shadow =
    shadowStyle === 'sm' ? 'shadow-sm' : shadowStyle === 'lg' ? 'shadow-lg' : shadowStyle === 'xl' ? 'shadow-2xl' : 'shadow-md'
  return `${border} ${shadow}`
}

interface ContentProps {
  project: ShowcaseProject
  index: number
  total: number
  showCode: boolean
  pace: number
  revealDelay: number
  revealStagger: number
  typoEffect: string
  titleWeight: string
  sheen: boolean
  showCampaign: boolean
  showSquad: boolean
  showPeople: boolean
  showSize: boolean
  showDates: boolean
  showNote: boolean
  showAssetTotal: boolean
  showAssetBreakdown: boolean
}

/** Shared content column: kicker, kinetic name, meta chips, dates, asset odometer, breakdown. */
function ProjectContent(props: ContentProps) {
  const {
    project, index, total, showCode, pace, revealDelay, revealStagger, typoEffect, titleWeight, sheen,
    showCampaign, showSquad, showPeople, showSize, showDates, showNote, showAssetTotal, showAssetBreakdown,
  } = props

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
      <h2 className={cx('sc-project-name', titleWeight === 'black' && 'sc-w-black', sheen && 'sc-sheen')}>
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
              className="sc-chip sc-chip-size sc-a-pop font-bold"
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
  collage,
  showCode,
  pace,
  layoutVariant,
  flip,
  sheen,
  titleWeight,
  revealDelay,
  revealStagger,
  typoEffect,
  borderStyle,
  shadowStyle,
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
  collage: CollageSpec[]
  showCode: boolean
  pace: number
  layoutVariant: number
  flip: boolean
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
}) {
  const images = project.images

  const contentProps: ContentProps = {
    project, index, total, showCode, pace, revealDelay, revealStagger, typoEffect, titleWeight, sheen,
    showCampaign, showSquad, showPeople, showSize, showDates, showNote, showAssetTotal, showAssetBreakdown,
  }

  const baseName = revealDelay + 100
  const baseChips = baseName + 450
  const chrome = cardChrome(borderStyle, shadowStyle)
  const splitCls = cx('sc-body sc-project-split', flip && 'sc-flip')

  // ── No images: typographic archetypes ────────────────────────
  if (images.length === 0) {
    const v = layoutVariant % 5

    // 1: Solid side panel — giant size letter on the OTHER brand colour.
    if (v === 1) {
      return (
        <div className={splitCls}>
          <div className="sc-side-panel sc-a-pop" style={dly(revealDelay)}>
            <span className="sc-side-panel-big sc-a-rise" style={dly(revealDelay + 150)}>
              {project.size}
            </span>
            <span className="sc-side-panel-sub">Project {String(index + 1).padStart(2, '0')}</span>
          </div>
          <div className="sc-project-left">
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // 2: Indented editorial block.
    if (v === 2) {
      return (
        <div className="sc-body sc-project-typo flex flex-col justify-center items-start pl-16 text-left w-full">
          <ProjectContent {...contentProps} />
        </div>
      )
    }

    // 3: Ticker headline — the name slides through the frame, oversized.
    if (v === 3) {
      return (
        <div className="sc-body flex flex-col justify-center gap-8 w-full text-left">
          <h2 className={cx('sc-hero-word', sheen && 'sc-sheen')} style={{ maxWidth: '100%' }}>
            <ScMaskText text={project.name} per="word" delayMs={revealDelay} stepMs={revealStagger + 30} effect="ticker" />
          </h2>
          <div>
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // 4: Accent quote bar.
    if (v === 4) {
      return (
        <div className="sc-body flex items-stretch gap-6 w-full pl-8">
          <div className="w-1.5 shrink-0 rounded-full" style={{ background: 'var(--sc-accent)' }} />
          <div className="flex-1 flex items-center text-left">
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // 0: Ghost watermark (code/campaign echoes behind the content).
    return (
      <div className="sc-body sc-project-typo">
        <span className="sc-watermark sc-w-black" aria-hidden>
          {showCode && project.code ? project.code : project.campaign}
        </span>
        <ProjectContent {...contentProps} />
      </div>
    )
  }

  // ── 1 image: hero archetypes ──────────────────────────────────
  if (images.length === 1) {
    const v = layoutVariant % 6

    // 1: Tilted floating card beside content.
    if (v === 1) {
      const spec = collage[0] || { rot: 3, dx: 0, dy: 0 }
      return (
        <div className={cx(splitCls, 'sc-floating-layout')}>
          <div className="sc-project-left">
            <ProjectContent {...contentProps} />
          </div>
          <div className="sc-floating-card-wrap relative">
            <div
              className={`sc-single-floating-card sc-a-pop ${chrome}`}
              style={{ ...dly(baseChips + 100), ...cssVars({ '--rot': `${spec.rot || 3}deg` }) }}
            >
              <img src={images[0].url} alt="" />
            </div>
          </div>
        </div>
      )
    }

    // 2: Tall vertical banner beside content.
    if (v === 2) {
      return (
        <div className={cx(splitCls, 'sc-asymmetric-layout')}>
          <div className="sc-vertical-banner-wrap relative">
            <div className={`sc-a-pop ${chrome}`} style={dly(revealDelay + 50)}>
              <img src={images[0].url} alt="" className="sc-vertical-banner-img" />
            </div>
          </div>
          <div className="sc-project-right">
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // 3: Full-bleed image with a GIANT overlaid asset count (storyboard "9,000+").
    if (v === 3) {
      return (
        <div className="sc-body">
          <div className="sc-kb-wrap">
            <img src={images[0].url} alt="" className="sc-kb" />
          </div>
          <div className="sc-scrim sc-a-fade" />
          <div className="sc-overlay-stat">
            <h2 className="sc-hero-number sc-sheen sc-a-zoom-fade" style={dly(revealDelay + 100)}>
              {showAssetTotal ? (
                <ScCounter value={project.assetTotal} delayMs={(revealDelay + 250) * pace} durationMs={900 * pace} />
              ) : (
                <ScMaskText text={project.name} per="word" delayMs={revealDelay + 100} stepMs={revealStagger} />
              )}
            </h2>
            {showAssetTotal && (
              <p className="sc-hero-label sc-a-riseSoft" style={dly(revealDelay + 700)}>
                assets · {project.name}
              </p>
            )}
          </div>
        </div>
      )
    }

    // 4: Framed circular crop beside content.
    if (v === 4) {
      return (
        <div className={cx('sc-body sc-crop-circle-layout', flip && 'sc-flip')}>
          <div className="sc-project-left">
            <ProjectContent {...contentProps} />
          </div>
          <div className="sc-circle-crop-wrap">
            <div className={`sc-circle-crop-container sc-a-pop ${chrome}`} style={dly(baseChips + 50)}>
              <img src={images[0].url} alt="" />
            </div>
          </div>
        </div>
      )
    }

    // 5: Horizontal banner above content.
    if (v === 5) {
      return (
        <div className="sc-body flex flex-col gap-6 justify-center w-full max-w-[50em] mx-auto text-left">
          <div className={`w-full h-[14em] rounded-2xl overflow-hidden relative sc-a-pop ${chrome}`} style={dly(revealDelay)}>
            <img src={images[0].url} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <ProjectContent {...contentProps} />
          </div>
        </div>
      )
    }

    // 0: Full-bleed hero, content anchored low.
    return (
      <div className="sc-body">
        <div className="sc-kb-wrap">
          <img src={images[0].url} alt="" className="sc-kb" />
        </div>
        <div className="sc-scrim sc-a-fade" />
        <div className="sc-project-lower">
          <ProjectContent {...contentProps} />
        </div>
      </div>
    )
  }

  // ── 2+ images: collage archetypes ─────────────────────────────
  const v = layoutVariant % 6

  // 1: Straight grid collage.
  if (v === 1) {
    return (
      <div className={cx(splitCls, 'sc-grid-layout')}>
        <div className="sc-project-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-collage-grid relative">
          {images.slice(0, 4).map((im, i) => (
            <div
              key={im.url + i}
              className={`sc-grid-card sc-grid-card-${i + 1} sc-a-pop ${chrome}`}
              style={dly(baseChips + i * revealStagger * 1.5)}
            >
              <img src={im.url} alt="" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 2: Tilted wall-of-work — a rotated plane of cards behind the content
  //    (the storyboard's slanted collage wall).
  if (v === 2) {
    const cards = [...images, ...images, ...images].slice(0, 9)
    return (
      <div className="sc-body">
        <div className="sc-wall-wrap">
          <div className="sc-wall">
            {cards.map((im, i) => (
              <div key={im.url + i} className={`sc-wall-card ${chrome}`} style={dly(200 + i * 90)}>
                <img src={im.url} alt="" />
              </div>
            ))}
          </div>
          <div className="sc-wall-scrim" />
        </div>
        <div className="sc-project-typo" style={{ position: 'absolute', inset: '6em 8em', maxWidth: '46%' }}>
          <ProjectContent {...contentProps} />
        </div>
      </div>
    )
  }

  // 3: Masonry steps.
  if (v === 3) {
    return (
      <div className={cx('sc-body sc-masonry-layout', flip && 'sc-flip')}>
        <div className="sc-project-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-masonry-container">
          {images.slice(0, 3).map((im, i) => (
            <div
              key={im.url + i}
              className={`sc-masonry-card sc-masonry-card-${i + 1} sc-a-pop ${chrome}`}
              style={dly(baseChips + i * revealStagger)}
            >
              <img src={im.url} alt="" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 4: Filmstrip row.
  if (v === 4) {
    return (
      <div className="sc-body sc-filmstrip-layout">
        <div className="text-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-filmstrip-container relative">
          {images.slice(0, 3).map((im, i) => (
            <div key={im.url + i} className={`sc-filmstrip-card sc-a-pop ${chrome}`} style={dly(baseChips + i * revealStagger)}>
              <img src={im.url} alt="" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 5: Featured split (one hero card + side stack).
  if (v === 5) {
    return (
      <div className={cx('sc-body sc-featured-split-layout', flip && 'sc-flip')}>
        <div className="sc-project-left">
          <ProjectContent {...contentProps} />
        </div>
        <div className="sc-featured-images-grid relative">
          <div className={`sc-featured-main sc-a-pop ${chrome}`} style={dly(baseChips)}>
            <img src={images[0].url} alt="" />
          </div>
          <div className="sc-featured-side-stack">
            {images.slice(1, 3).map((im, i) => (
              <div
                key={im.url + i}
                className={`sc-featured-side-card sc-a-pop ${chrome}`}
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

  // 0: Scattered collage stack (seeded tilts, locked camera — no bob).
  return (
    <div className={splitCls}>
      <div className="sc-project-left">
        <ProjectContent {...contentProps} />
      </div>
      <div className="sc-collage relative">
        {images.slice(0, 4).map((im, i) => {
          const spec = collage[i]
          return (
            <div
              key={im.url + i}
              className={`sc-collage-card sc-a-pop ${chrome}`}
              style={{
                ...dly(baseChips + i * revealStagger),
                ...cssVars({
                  '--rot': `${spec.rot}deg`,
                  '--dx': `${spec.dx}%`,
                  '--dy': `${spec.dy}%`,
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
