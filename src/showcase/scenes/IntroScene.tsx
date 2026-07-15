import { dly } from '../bits/anim'
import { ScMaskText } from '../bits/ScMaskText'

/**
 * Title card, storyboard-style: rotated brand tag plate (team name), a giant
 * year in Museo, the showcase title, then the staff roll.
 */
export function IntroScene({
  year,
  title,
  teamName,
  staff,
}: {
  year: number
  title: string
  teamName: string
  staff: string[]
}) {
  return (
    <div className="sc-body sc-center-col">
      <span className="sc-tag sc-a-pop" style={dly(150)}>
        {teamName}
      </span>
      <h1 className="sc-year sc-sheen">
        <ScMaskText text={String(year)} per="letter" delayMs={350} stepMs={70} />
      </h1>
      <p className="sc-kicker sc-a-riseSoft" style={dly(1150)}>
        {title}
      </p>
      <div className="sc-chip-row" style={{ maxWidth: '72em' }}>
        {staff.map((name, i) => (
          <span key={name} className="sc-chip sc-a-pop" style={dly(1600 + i * 60)}>
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
