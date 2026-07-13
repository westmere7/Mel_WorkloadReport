import { dly } from '../bits/anim'
import { ScMaskText } from '../bits/ScMaskText'

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
      <ScMaskText text={String(year)} per="letter" delayMs={200} stepMs={45} className="sc-year" />
      <p className="sc-kicker sc-a-riseSoft" style={dly(950)}>
        {title}
      </p>
      <h1 className="sc-team">
        <span className="sc-sweep" style={dly(1900)}>
          <ScMaskText text={teamName} per="word" delayMs={1300} stepMs={60} />
        </span>
      </h1>
      <div className="sc-chip-row" style={{ maxWidth: '72em' }}>
        {staff.map((name, i) => (
          <span key={name} className="sc-chip sc-a-pop" style={dly(1900 + i * 60)}>
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
