import { format, parseISO } from 'date-fns'
import { EyeIcon, SealCheckIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { TrustScore } from '@/api/trust'
import { isScored } from './score'
import { ScoreRing } from './ScoreRing'

export interface CredibilityPanelProps {
  score: TrustScore | undefined
  /** `GET /trust-score` is in flight. */
  isLoading: boolean
  /** A message once it has failed. */
  error: string | null
  onRetry: () => void
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-status-trust-tint text-status-trust" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-body text-body-md font-semibold text-ink-900">{title}</p>
        <p className="mt-0.5 font-body text-body-md text-ink-700">{children}</p>
      </div>
    </li>
  )
}

/**
 * /app/profile/credibility — the account's own score (`GET /trust-score`) and what it's for. The mockup (Batch 3 §3h)
 * adds a level ("Level 4 · Trusted reporter"), progress to the next level, report statistics, "how to raise your score"
 * with points, and a list of recent changes; the API has **none** of those — it returns `{score, updated_at?}` and nothing
 * else, and nothing writes scores yet (`credibility_events` is a later backend phase) — so they are not drawn. What's left
 * is honest: the number, when it last changed, and a plain account of what it's designed to mean. An account that has never
 * been scored comes back as an implicit `0` with no `updated_at`; that is shown as "Not scored yet", never as a zero.
 * The card is white with a teal ring (the design's "trust" colour) rather than the mockup's pink gradient hero, which
 * was built around the level line. Purely presentational.
 */
export function CredibilityPanel({ score, isLoading, error, onRetry }: CredibilityPanelProps) {
  return (
    <div className="flex max-w-140 flex-col gap-5">
      <div>
        <h1 className="font-heading text-h2 font-bold text-ink-900">Credibility</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">How much the community can rely on what you report.</p>
      </div>

      <section
        className="rounded-md border border-surface-border bg-surface-raised p-6 shadow-sm"
        aria-labelledby="score-heading"
        aria-busy={isLoading || undefined}
      >
        <h2 id="score-heading" className="sr-only">
          Your credibility score
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-6" aria-label="Loading your credibility score" role="status">
            <div className="size-32 flex-none animate-pulse rounded-full bg-surface-sunken" aria-hidden="true" />
            <div className="min-w-0 flex-1" aria-hidden="true">
              <div className="h-6 w-40 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
              <div className="mt-3 h-4 w-56 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
            </div>
          </div>
        ) : error ? (
          <div>
            <p role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
              {error}
            </p>
            <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <ScoreRing score={isScored(score) ? score.score : null} />
            <div className="min-w-0 flex-1">
              {isScored(score) ? (
                <>
                  <p className="font-heading text-h2 font-bold text-ink-900">Your credibility score</p>
                  <p className="mt-1 font-body text-body-md text-ink-500">Last updated {format(parseISO(score.updated_at), 'd MMM yyyy')}</p>
                </>
              ) : (
                <>
                  <p className="font-heading text-h2 font-bold text-ink-900">Not scored yet</p>
                  <p className="mt-1 font-body text-body-md text-ink-500">Your score appears here once your reports have been reviewed.</p>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-md border border-surface-border bg-surface-raised p-6 shadow-sm" aria-labelledby="how-heading">
        <h2 id="how-heading" className="font-heading text-h3 font-bold text-ink-900">
          How it works
        </h2>
        <ul className="mt-4 flex flex-col gap-4">
          <Point icon={<SealCheckIcon size={20} />} title="It follows your reports">
            It's designed to rise when the community reports you submit are verified by NGOs and admins, and to fall when they're rejected.
          </Point>
          <Point icon={<EyeIcon size={20} />} title="NGOs and admins can see it">
            NGO staff and admins can look up your score when they review what you report.
          </Point>
        </ul>
        <p className="mt-5 border-t border-surface-border pt-3 font-body text-body-sm text-ink-500">
          An itemised history of what changed your score isn't recorded yet.
        </p>
      </section>
    </div>
  )
}
