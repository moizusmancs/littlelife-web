import { scorePercent, SCORE_MAX } from './score'

/** A thin horizontal bar for a credibility score (0–100), with the reading as its accessible name. */
export function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`Credibility score ${score} out of ${SCORE_MAX}`}>
      <div className="h-full rounded-full bg-status-trust" style={{ width: `${scorePercent(score)}%` }} />
    </div>
  )
}
