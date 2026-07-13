import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TRANSITION_MS, TRANSITION_MS_REDUCED } from './theme'
import type { Scene } from './types'

export type PlayerStatus = 'idle' | 'playing' | 'ended'

export interface MountedScene {
  scene: Scene
  phase: 'enter' | 'exit'
  /** React key — cycle-prefixed so loops remount scenes fresh. */
  key: string
  /** Stacking: the exiting scene sits under the entering one. */
  z: 1 | 2
}

interface PlayerOptions {
  loop: boolean
  pace: number
  reducedMotion: boolean
}

/**
 * The showcase clock. One rAF loop over `performance.now()`; scenes overlap by
 * the transition window (exit below, enter above — max two mounted). State only
 * updates when the mounted set actually changes, so renders happen ~twice per
 * scene, not per frame. Progress is exposed via a getter (read from a ref).
 */
export function useShowcasePlayer(scenes: Scene[], { loop, pace, reducedMotion }: PlayerOptions) {
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [mounted, setMounted] = useState<MountedScene[]>([])

  const trans = (reducedMotion ? TRANSITION_MS_REDUCED : TRANSITION_MS) * pace

  // Precomputed timeline: effective start of each scene (overlapped), total length.
  const timeline = useMemo(() => {
    const starts: number[] = []
    let cursor = 0
    scenes.forEach((s, i) => {
      starts.push(cursor)
      cursor += s.durationMs * pace
      if (i < scenes.length - 1) cursor -= trans
    })
    return { starts, total: Math.max(cursor, 1) }
  }, [scenes, pace, trans])

  const rafRef = useRef<number>()
  const startRef = useRef(0)
  const pausedAccumRef = useRef(0)
  const pauseStartRef = useRef<number | null>(null)
  const signatureRef = useRef('')
  const progressRef = useRef(0)
  const statusRef = useRef<PlayerStatus>('idle')
  statusRef.current = status

  const stopRaf = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
  }

  const tick = useCallback(() => {
    const now = performance.now()
    const raw = now - startRef.current - pausedAccumRef.current
    const { starts, total } = timeline

    if (!loop && raw >= total) {
      progressRef.current = 1
      signatureRef.current = ''
      setMounted([])
      setStatus('ended')
      stopRaf()
      return
    }

    const cycle = loop ? Math.floor(raw / total) : 0
    const t = loop ? raw % total : raw
    progressRef.current = t / total

    // Active scenes at t (≤2 thanks to the pairwise overlap).
    const active: MountedScene[] = []
    for (let i = 0; i < scenes.length; i++) {
      const start = starts[i]
      const end = start + scenes[i].durationMs * pace
      if (t >= start && t < end) {
        const exiting = t >= end - trans && i < scenes.length - 1
        active.push({
          scene: scenes[i],
          phase: exiting ? 'exit' : 'enter',
          key: `${cycle}:${scenes[i].id}`,
          z: exiting ? 1 : 2,
        })
      }
      if (start > t) break
    }

    const signature = active.map((m) => `${m.key}/${m.phase}`).join('|')
    if (signature !== signatureRef.current) {
      signatureRef.current = signature
      setMounted(active)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [scenes, timeline, pace, trans, loop])

  const play = useCallback(() => {
    stopRaf()
    startRef.current = performance.now()
    pausedAccumRef.current = 0
    pauseStartRef.current = null
    signatureRef.current = ''
    progressRef.current = 0
    setStatus('playing')
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const stop = useCallback(() => {
    stopRaf()
    signatureRef.current = ''
    setMounted([])
    setStatus('idle')
  }, [])

  // Freeze the clock (and, via [data-paused] CSS, the animations) while hidden.
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (statusRef.current === 'playing' && pauseStartRef.current == null) {
          pauseStartRef.current = performance.now()
          setPaused(true)
        }
      } else if (pauseStartRef.current != null) {
        pausedAccumRef.current += performance.now() - pauseStartRef.current
        pauseStartRef.current = null
        setPaused(false)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Cleanup on unmount / when the timeline itself changes.
  useEffect(() => stopRaf, [tick])

  const getProgress = useCallback(() => progressRef.current, [])

  return { status, mounted, paused, play, replay: play, stop, getProgress }
}
