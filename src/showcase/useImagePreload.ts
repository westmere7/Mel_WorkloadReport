import { useEffect, useRef } from 'react'
import type { Scene } from './types'

/** Warm the browser cache for the next scenes' images so entrances never pop in blank. */
export function useImagePreload(scenes: Scene[], currentIndex: number, lookahead = 2): void {
  const warmed = useRef(new Set<string>())
  useEffect(() => {
    for (let i = Math.max(0, currentIndex); i <= Math.min(scenes.length - 1, currentIndex + lookahead); i++) {
      const p = scenes[i].payload
      if (p.kind !== 'project') continue
      for (const im of p.project.images) {
        if (warmed.current.has(im.url)) continue
        warmed.current.add(im.url)
        const img = new Image()
        img.src = im.url
      }
    }
  }, [scenes, currentIndex, lookahead])
}
