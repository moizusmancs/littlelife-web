import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import type { TrustScore } from '@/api/trust'
import { ScoreMeter } from '@/features/trust/ScoreMeter'
import { isScored } from '@/features/trust/score'

export interface CredibilityCardProps {
  score: TrustScore | undefined
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

/**
 * The account's credibility score from `GET /accounts/{id}/trust-score`. The route reports an
 * implicit `0` (with no `updated_at`) for an account that has never been scored — that isn't a
 * score of zero, so it's shown as "Not scored yet". The mockup's itemised history isn't built: it
 * would come from `credibility_events`, a later backend phase, and the card says so. The bar
 * assumes a 0–100 scale, which is what every stored score so far fits (the API doesn't state one).
 */
export function CredibilityCard({ score, isLoading, error, onRetry }: CredibilityCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="credibility-heading">
      <h2 id="credibility-heading" className="font-heading text-h3 font-bold text-ink-900">
        Credibility
      </h2>

      {isLoading ? (
        <div className="mt-4 h-12 animate-pulse rounded-sm bg-surface-sunken" aria-busy="true" aria-label="Loading credibility" />
      ) : error ? (
        <div className="mt-3">
          <p role="alert" className="font-body text-body-sm text-status-critical">
            {error}
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : isScored(score) ? (
        <div className="mt-3">
          <div className="flex items-end gap-3">
            <span className="font-heading text-[32px] leading-none font-bold text-ink-900">{score.score}</span>
            <span className="pb-0.5 font-body text-body-sm text-ink-500">updated {format(parseISO(score.updated_at), 'd MMM yyyy')}</span>
          </div>
          <div className="mt-3">
            <ScoreMeter score={score.score} />
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="font-heading text-h3 font-bold text-ink-700">Not scored yet</p>
          <p className="mt-1 font-body text-body-sm text-ink-500">This account has no credibility score recorded.</p>
        </div>
      )}

      <p className="mt-4 border-t border-surface-border pt-3 font-body text-body-sm text-ink-500">
        An itemised history of what changed the score isn't recorded yet.
      </p>
    </section>
  )
}
