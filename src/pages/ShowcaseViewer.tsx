import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Clapperboard, Hourglass, Loader2 } from 'lucide-react'
import { createRepository } from '../data/store'
import { isExpired, SHOWCASE_CONFIG_VERSION, type ShowcaseRecord } from '../lib/showcase'
import { ShowcasePlayerView } from '../showcase/ShowcasePlayerView'

type ViewerState =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'expired' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; record: ShowcaseRecord }

/** Centered message screen on the viewer's dark backdrop. */
function Screen({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[#050510] p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="text-white/40">{icon}</span>
        <p className="text-lg font-semibold text-white/90">{title}</p>
        {sub && <p className="text-sm text-white/50">{sub}</p>}
      </div>
    </div>
  )
}

/**
 * Public, chrome-free showcase viewer — /showcase/:id. No sign-in, no store,
 * no sidebar. Loads the frozen config by id and plays it.
 */
export function ShowcaseViewerPage() {
  const { id } = useParams<{ id: string }>()
  // One repository instance for this page; no StoreProvider involved.
  const repo = useMemo(createRepository, [])
  const [state, setState] = useState<ViewerState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    if (!id) {
      setState({ kind: 'notFound' })
      return
    }
    repo
      .getShowcase(id)
      .then((record) => {
        if (cancelled) return
        if (!record) setState({ kind: 'notFound' })
        else if (isExpired(record.meta)) setState({ kind: 'expired' })
        else if (record.config.configVersion !== SHOWCASE_CONFIG_VERSION) setState({ kind: 'unsupported' })
        else setState({ kind: 'ready', record })
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [repo, id])

  // The viewer owns the whole document — give it a dark canvas + a title.
  useEffect(() => {
    const prevTitle = document.title
    document.title = state.kind === 'ready' ? `${state.record.meta.title || 'Showcase'} — GCMC` : 'Showcase — GCMC'
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.title = prevTitle
      document.body.style.overflow = prevOverflow
    }
  }, [state])

  switch (state.kind) {
    case 'loading':
      return <Screen icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Loading showcase…" />
    case 'notFound':
      return (
        <Screen
          icon={<Clapperboard className="h-8 w-8" />}
          title="Showcase not found"
          sub="The link may be wrong, deleted — or it was created in a different browser (local mode links only open where they were made)."
        />
      )
    case 'expired':
      return (
        <Screen
          icon={<Hourglass className="h-8 w-8" />}
          title="This showcase has expired"
          sub="Its link lifetime has passed. Ask the team to generate a fresh one."
        />
      )
    case 'unsupported':
      return (
        <Screen
          icon={<Clapperboard className="h-8 w-8" />}
          title="Newer showcase format"
          sub="This showcase was made with a newer version of the app — refresh or update to view it."
        />
      )
    case 'error':
      return <Screen icon={<Clapperboard className="h-8 w-8" />} title="Couldn’t load the showcase" sub={state.message} />
    case 'ready':
      return <ShowcasePlayerView config={state.record.config} />
  }
}
