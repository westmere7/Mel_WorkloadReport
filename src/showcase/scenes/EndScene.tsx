import { RotateCcw } from 'lucide-react'
import { dly } from '../bits/anim'
import { ScMaskText } from '../bits/ScMaskText'

/** Final card — brand-red wrap panel (the player shell paints the background). */
export function EndScene({
  teamName,
  year,
  onReplay,
}: {
  teamName: string
  year: number
  onReplay: () => void
}) {
  return (
    <div className="sc-body sc-center-col">
      <span className="sc-tag sc-a-pop" style={dly(150)}>
        {teamName}
      </span>
      <h2 className="sc-team sc-sheen">
        <ScMaskText text="That’s a wrap." per="word" delayMs={350} stepMs={80} />
      </h2>
      <p className="sc-sub sc-a-riseSoft" style={dly(900)}>
        {year} · Ready for what’s next
      </p>
      <button type="button" className="sc-play-again sc-a-pop" style={dly(1300)} onClick={onReplay}>
        <RotateCcw className="sc-icon" /> Play again
      </button>
    </div>
  )
}
