import { cn } from '@/lib/utils'
import { isOnScale, scorePercent, SCORE_MAX } from './score'

export interface ScoreRingProps {
  /** The score, or `null` for an account with none — an empty ring and a dash. */
  score: number | null
  className?: string
}

/**
 * A ring filled to the score (a conic gradient behind a round window), with the number in the middle and "of 100"
 * under it when the score is on the scale. A score of `null` draws the empty track and a dash. The reading is the
 * ring's accessible name; the digits inside are decoration for it.
 */
export function ScoreRing({ score, className }: ScoreRingProps) {
  const percent = score === null ? 0 : scorePercent(score)
  return (
    <div
      role="img"
      aria-label={score === null ? 'No credibility score yet' : `Credibility score ${score} out of ${SCORE_MAX}`}
      className={cn('flex size-32 flex-none items-center justify-center rounded-full', className)}
      style={{ background: `conic-gradient(var(--color-status-trust) ${percent}%, var(--color-surface-border) 0)` }}
    >
      <div aria-hidden="true" className="flex size-[calc(100%-20px)] flex-col items-center justify-center rounded-full bg-surface-raised">
        <span className="font-heading text-[34px] leading-none font-extrabold text-ink-900">{score === null ? '—' : score}</span>
        {score !== null && isOnScale(score) && <span className="mt-1 font-body text-body-sm text-ink-500">of {SCORE_MAX}</span>}
      </div>
    </div>
  )
}
