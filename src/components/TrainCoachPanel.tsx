import './TrainCoachPanel.css'
import type { CoachPlainBlock } from '../lib/TrainPivotalBreak'

export type TrainCoachPanelProps = {
  Open: boolean
  Content: CoachPlainBlock
  OnContinue: () => void
}

export function TrainCoachPanel({ Open, Content, OnContinue }: TrainCoachPanelProps) {
  if (!Open) return null

  return (
    <section
      className="TrainCoachPanel"
      role="region"
      aria-labelledby="train-coach-title"
    >
      <p className="TrainCoachPanel-kicker">Training pause — look at the chart</p>
      <h2 id="train-coach-title" className="TrainCoachPanel-title">
        {Content.Title}
      </h2>
      <p className={`TrainCoachPanel-action TrainCoachPanel-action--${Content.Action.toLowerCase()}`}>
        Action: {Content.Action}
      </p>
      <p className="TrainCoachPanel-body">{Content.Body}</p>
      <button type="button" className="Btn TrainCoachPanel-continue" onClick={OnContinue}>
        Continue
      </button>
    </section>
  )
}
