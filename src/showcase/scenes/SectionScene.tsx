import { dly } from '../bits/anim'
import { ScMaskText } from '../bits/ScMaskText'

export function SectionScene({ kicker, word, sub }: { kicker: string; word: string; sub: string }) {
  return (
    <div className="sc-body sc-center-col">
      <p className="sc-kicker sc-a-riseSoft" style={dly(200)}>
        {kicker}
      </p>
      <h2 className="sc-section-word">
        <ScMaskText text={word} per="letter" delayMs={400} stepMs={45} />
      </h2>
      <span className="sc-underline sc-a-barx" style={dly(1200)} />
      <p className="sc-sub sc-a-riseSoft" style={dly(1400)}>
        {sub}
      </p>
    </div>
  )
}
