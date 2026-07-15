import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { cx } from '../lib/format'
import type { ShowcaseConfig } from '../lib/showcase'
import { compileScenes } from './compile'
import { PACE } from './theme'
import { ShowcaseStage } from './ShowcaseStage'
import { useShowcasePlayer } from './useShowcasePlayer'
import { useReducedMotion } from './useReducedMotion'
import { useImagePreload } from './useImagePreload'
import { Switch } from '../components/ui/Switch'
import { ScPixels } from './bits/ScPixels'
import { IntroScene } from './scenes/IntroScene'
import { SectionScene } from './scenes/SectionScene'
import { ProjectScene } from './scenes/ProjectScene'
import { StatSoloScene } from './scenes/StatSoloScene'
import { StatDistScene } from './scenes/StatDistScene'
import { Top3Scene } from './scenes/Top3Scene'
import { EndScene } from './scenes/EndScene'
import type { Scene, ScenePayload } from './types'
import './showcase.css'

function SceneContent({ payload, pace }: { payload: ScenePayload; pace: number }) {
  switch (payload.kind) {
    case 'intro':
      return <IntroScene year={payload.year} title={payload.title} teamName={payload.teamName} staff={payload.staff} />
    case 'section':
      return <SectionScene kicker={payload.kicker} word={payload.word} sub={payload.sub} />
    case 'project':
      return (
        <ProjectScene
          project={payload.project}
          index={payload.index}
          total={payload.total}
          collage={payload.collage}
          showCode={payload.showCode}
          pace={pace}
          layoutVariant={payload.layoutVariant}
          flip={payload.flip}
          sheen={payload.sheen}
          titleWeight={payload.titleWeight}
          revealDelay={payload.revealDelay}
          revealStagger={payload.revealStagger}
          typoEffect={payload.typoEffect}
          borderStyle={payload.borderStyle}
          shadowStyle={payload.shadowStyle}
          showCampaign={payload.showCampaign}
          showSquad={payload.showSquad}
          showPeople={payload.showPeople}
          showSize={payload.showSize}
          showDates={payload.showDates}
          showNote={payload.showNote}
          showAssetTotal={payload.showAssetTotal}
          showAssetBreakdown={payload.showAssetBreakdown}
        />
      )
    case 'statSolo':
      return <StatSoloScene stat={payload.stat} variant={payload.variant} pace={pace} />
    case 'statDist':
      return <StatDistScene stat={payload.stat} pace={pace} />
    case 'top3':
      return <Top3Scene block={payload.block} />
  }
}

/** Scene shell class: brand panel + optional ambient gradient drift. */
function sceneShellClass(scene: Scene, movingGradients: boolean): string {
  return cx('sc-scene', `sc-bg-${scene.bg}`, movingGradients && 'sc-anim-grad')
}

/** Thin progress hairline along the stage bottom (reads the clock via ref — no scene re-renders). */
function ProgressHairline({ getProgress, active }: { getProgress: () => number; active: boolean }) {
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    let raf: number
    const step = () => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${getProgress()})`
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, getProgress])
  if (!active) return null
  return (
    <div className="sc-progress">
      <div ref={barRef} className="sc-progress-fill" />
    </div>
  )
}

/**
 * The full player: idle poster (Play + loop toggle) → deterministic scene run →
 * end card with Play again (unless looping).
 */
export function ShowcasePlayerView({ config }: { config: ShowcaseConfig }) {
  const reducedMotion = useReducedMotion()
  const pace = PACE[config.pacing]
  const { scenes } = useMemo(() => compileScenes(config), [config])
  const movingGradients = config.style.movingGradients ?? true

  const [loop, setLoop] = useState(false)
  const player = useShowcasePlayer(scenes, { loop, pace, reducedMotion })

  // Preload the next scenes' images from whichever scene is currently on top.
  const topScene: Scene | undefined = player.mounted[player.mounted.length - 1]?.scene
  const currentIndex = topScene ? scenes.findIndex((s) => s.id === topScene.id) : 0
  useImagePreload(scenes, Math.max(0, currentIndex))

  // Keyboard: Space / Enter starts or replays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (player.status === 'idle' || player.status === 'ended') {
        e.preventDefault()
        player.play()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [player])

  return (
    <ShowcaseStage canvas={config.canvas} style={config.style} pace={pace} paused={player.paused}>
      {/* Scenes (≤2 mounted during a transition) — each paints its own panel. */}
      {player.status === 'playing' &&
        player.mounted.map((m) => (
          <div
            key={m.key}
            className={sceneShellClass(m.scene, movingGradients)}
            data-enter={m.scene.enter}
            data-state={m.phase}
            data-ink={m.scene.bg === 'white' ? m.scene.whiteInk : undefined}
            style={{ zIndex: m.z }}
          >
            {m.scene.pixels && <ScPixels spec={m.scene.pixels} />}
            <SceneContent payload={m.scene.payload} pace={pace} />
          </div>
        ))}

      {/* Idle poster — navy brand panel. */}
      {player.status === 'idle' && (
        <div className="sc-scene sc-bg-navy" style={{ zIndex: 2 }}>
          <div className="sc-body sc-center-col">
            <span className="sc-tag sc-a-pop">{config.teamName}</span>
            <h1 className="sc-poster-title sc-a-fade">{config.title || `${config.year} Showcase`}</h1>
            <button type="button" className="sc-play sc-a-pop" onClick={player.play} title="Play showcase">
              <Play className="sc-play-icon" fill="currentColor" />
            </button>
            <label className="sc-loop">
              <Switch checked={loop} onChange={setLoop} label="Loop showcase" />
              <span>Loop</span>
            </label>
          </div>
        </div>
      )}

      {/* End card (loop off) — red wrap panel. */}
      {player.status === 'ended' && (
        <div className="sc-scene sc-bg-red" data-enter="zoom" style={{ zIndex: 2 }}>
          <EndScene teamName={config.teamName} year={config.year} onReplay={player.replay} />
          <label className="sc-loop sc-loop-end">
            <Switch checked={loop} onChange={setLoop} label="Loop showcase" />
            <span>Loop</span>
          </label>
        </div>
      )}

      <ProgressHairline getProgress={player.getProgress} active={player.status === 'playing'} />
    </ShowcaseStage>
  )
}
