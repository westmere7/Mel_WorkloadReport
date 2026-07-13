import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { ShowcaseConfig } from '../lib/showcase'
import { compileScenes } from './compile'
import { PACE } from './theme'
import { ShowcaseStage } from './ShowcaseStage'
import { useShowcasePlayer } from './useShowcasePlayer'
import { useReducedMotion } from './useReducedMotion'
import { useImagePreload } from './useImagePreload'
import { Switch } from '../components/ui/Switch'
import { IntroScene } from './scenes/IntroScene'
import { SectionScene } from './scenes/SectionScene'
import { ProjectScene } from './scenes/ProjectScene'
import { StatTrioScene } from './scenes/StatTrioScene'
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
          kb={payload.kb}
          collage={payload.collage}
          showCode={payload.showCode}
          pace={pace}
        />
      )
    case 'statTrio':
      return <StatTrioScene stats={payload.stats} pace={pace} />
    case 'statDist':
      return <StatDistScene stat={payload.stat} pace={pace} />
    case 'top3':
      return <Top3Scene block={payload.block} pace={pace} />
  }
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
  const { scenes, decor } = useMemo(() => compileScenes(config), [config])

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
    <ShowcaseStage
      canvas={config.canvas}
      theme={config.theme}
      background={config.style.background}
      grain={config.style.grain}
      decor={decor}
      pace={pace}
      paused={player.paused}
    >
      {/* Scenes (≤2 mounted during a transition) */}
      {player.status === 'playing' &&
        player.mounted.map((m) => (
          <div
            key={m.key}
            className="sc-scene"
            data-enter={m.scene.enter}
            data-state={m.phase}
            style={{ zIndex: m.z }}
          >
            <SceneContent payload={m.scene.payload} pace={pace} />
          </div>
        ))}

      {/* Idle poster */}
      {player.status === 'idle' && (
        <div className="sc-scene" style={{ zIndex: 2 }}>
          <div className="sc-body sc-center-col">
            <p className="sc-kicker sc-a-riseSoft">{config.teamName}</p>
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

      {/* End card (loop off) */}
      {player.status === 'ended' && (
        <div className="sc-scene" data-enter="zoom" style={{ zIndex: 2 }}>
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
