import { RotateCcw } from 'lucide-react'
import { dly } from '../bits/anim'
import { ScMaskText } from '../bits/ScMaskText'

/** Final card — shown when the run ends and looping is off. */
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
      <h2 className="sc-team">
        <ScMaskText text="That’s a wrap." per="word" delayMs={200} stepMs={80} />
      </h2>
      <p className="sc-sub sc-a-riseSoft" style={dly(800)}>
        {teamName} · {year}
      </p>
      <button type="button" className="sc-play-again sc-a-pop" style={dly(1200)} onClick={onReplay}>
        <RotateCcw className="sc-icon" /> Play again
      </button>
    </div>
  )
}
