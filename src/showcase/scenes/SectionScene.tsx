import { dly } from '../bits/anim'
import { ScMaskText } from '../bits/ScMaskText'

/** Chapter divider: tag plate, a huge Museo word sliding in, accent rule, sub. */
export function SectionScene({ kicker, word, sub }: { kicker: string; word: string; sub: string }) {
  return (
    <div className="sc-body sc-center-col">
      <span className="sc-tag sc-a-pop" style={dly(150)}>
        {kicker}
      </span>
      <h2 className="sc-section-word sc-sheen">
        <ScMaskText text={word} per="letter" delayMs={350} stepMs={42} />
      </h2>
      <span className="sc-underline sc-a-barx" style={dly(1100)} />
      <p className="sc-sub sc-a-riseSoft" style={dly(1300)}>
        {sub}
      </p>
    </div>
  )
}
