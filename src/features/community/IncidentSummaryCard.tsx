import { format, formatDistanceStrict, parseISO } from 'date-fns'
import { UserIcon } from '@phosphor-icons/react'
import type { IncidentReport, VoteType } from '@/api/community'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CATEGORY_CHIP, CATEGORY_LABEL, reporterLabel, statusBadge } from './feedModel'
import { VoteButtons } from './VoteButtons'

export interface IncidentSummaryCardProps {
  report: IncidentReport
  mine: boolean
  now: Date
  /** The viewer's vote (`null` = none); `undefined` while unknown, when the totals are shown without buttons. */
  vote: VoteType | null | undefined
  onVote?: (pressed: VoteType) => void
}

/**
 * The top of a report's page: its category (as the heading — a report has no title) and status, who filed it and when, everything they
 * wrote, and the large Upvote / Downvote pair under a plain question about what a vote means. Purely presentational.
 */
export function IncidentSummaryCard({ report, mine, now, vote, onVote }: IncidentSummaryCardProps) {
  const created = parseISO(report.created_at)
  const badge = statusBadge(report)
  const reporter = reporterLabel(mine)

  return (
    <section aria-labelledby="incident-title" className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded-full px-2 py-0.5 font-body text-[11px] font-semibold', CATEGORY_CHIP[report.category])}>{CATEGORY_LABEL[report.category]}</span>
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </div>
      <h1 id="incident-title" className="font-heading text-h1 font-bold text-ink-900">
        {CATEGORY_LABEL[report.category]}
      </h1>
      <div className="flex items-center gap-2 font-body text-body-sm text-ink-500">
        <span className={cn('flex size-7 flex-none items-center justify-center rounded-full', mine ? 'bg-primary-100 text-primary-700' : 'bg-surface-sunken text-ink-500')} aria-hidden="true">
          <UserIcon size={14} weight="bold" />
        </span>
        <span className="min-w-0">
          Reported by <span className="font-semibold text-ink-900">{reporter.toLowerCase()}</span>{' '}
          <time dateTime={report.created_at} className="whitespace-nowrap">
            {formatDistanceStrict(created, now, { addSuffix: true })}
          </time>
          <span className="whitespace-nowrap"> ({format(created, 'd MMMM yyyy, HH:mm')})</span>
        </span>
      </div>
      {report.description ? (
        <p className="font-body text-body-lg whitespace-pre-line text-ink-900 [overflow-wrap:anywhere]">{report.description}</p>
      ) : (
        <p className="font-body text-body-md text-ink-500 italic">No description given.</p>
      )}
      <div className="flex flex-col gap-2 border-t border-surface-border pt-4">
        <p className="font-body text-body-sm text-ink-700">Is this report accurate? Your vote helps responders judge it.</p>
        <VoteButtons up={report.upvote_count} down={report.downvote_count} vote={vote} onVote={onVote} size="lg" />
      </div>
    </section>
  )
}
