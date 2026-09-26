import { format, formatDistanceStrict, parseISO } from 'date-fns'
import { ArrowFatDownIcon, ArrowFatUpIcon, MapPinIcon, UserIcon } from '@phosphor-icons/react'
import type { IncidentReport, VoteType } from '@/api/community'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from '@/features/map/mapGeo'
import { cn } from '@/lib/utils'
import { CATEGORY_CHIP, CATEGORY_LABEL, reporterLabel, statusBadge, votesLabel } from './feedModel'
import { MediaThumb } from './MediaThumb'
import type { MediaState } from './useCommunityFeed'

export interface IncidentCardProps {
  report: IncidentReport
  /** Whether the viewer filed it — shown as "You"; anyone else is "A community member" (the API gives no name). */
  mine: boolean
  media: MediaState
  /** Metres from the viewer, when they have said where they are. */
  distance: number | null
  now: Date
  /** The viewer's vote on it (`null` = none); `undefined` while their votes are unknown, when the totals are shown without buttons. */
  vote?: VoteType | null
  onVote?: (pressed: VoteType) => void
}

/**
 * One citizen report in the feed: who (as far as a citizen may know) and when, its category and status, what they wrote, a picture, and
 * the vote totals with Upvote / Downvote buttons (the viewer's own vote pressed). There is no title, severity or comment count — the
 * report has none. Purely presentational.
 */
export function IncidentCard({ report, mine, media, distance, now, vote, onVote }: IncidentCardProps) {
  const created = parseISO(report.created_at)
  const badge = statusBadge(report)
  const headingId = `report-${report.id}-title`
  const reporter = reporterLabel(mine)

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-body text-body-sm text-ink-500">
          <span className={cn('flex size-7 flex-none items-center justify-center rounded-full', mine ? 'bg-primary-100 text-primary-700' : 'bg-surface-sunken text-ink-500')} aria-hidden="true">
            <UserIcon size={14} weight="bold" />
          </span>
          {/* One run of text, so on a narrow card it wraps like a sentence rather than stranding the "·" at a line's end or start. */}
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-ink-900">{reporter}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={report.created_at} title={format(created, 'd MMMM yyyy, HH:mm')} className="whitespace-nowrap">
              {formatDistanceStrict(created, now, { addSuffix: true })}
            </time>
          </span>
          <span className="flex basis-full flex-wrap items-center gap-1.5 sm:ms-auto sm:basis-auto">
            <span className={cn('rounded-full px-2 py-0.5 font-body text-[11px] font-semibold', CATEGORY_CHIP[report.category])}>{CATEGORY_LABEL[report.category]}</span>
            <Badge tone={badge.tone}>{badge.text}</Badge>
          </span>
        </div>

        <h3 id={headingId} className="sr-only">
          {CATEGORY_LABEL[report.category]} reported by {reporter.toLowerCase()}
        </h3>
        {report.description ? (
          <p className="line-clamp-3 font-body text-body-md text-ink-900 [overflow-wrap:anywhere]">{report.description}</p>
        ) : (
          <p className="font-body text-body-md text-ink-500 italic">No description given.</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-body-sm text-ink-700">
          <VoteButtons up={report.upvote_count} down={report.downvote_count} vote={vote} onVote={onVote} />
          {distance !== null && (
            <span className="flex items-center gap-1 text-ink-500">
              <MapPinIcon size={14} aria-hidden="true" />
              {formatDistance(distance)} away
            </span>
          )}
        </div>
      </div>
      <MediaThumb state={media} />
    </article>
  )
}

const voteButton = (pressed: boolean) =>
  cn(
    'flex h-8 items-center gap-1.5 rounded-full border px-3 font-body text-body-sm font-semibold transition-colors',
    pressed ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
  )

/**
 * The totals, and — once the viewer's own vote is known — a pair of toggle buttons (`aria-pressed`) for it. A press is the caller's; what it
 * means (cast, switch, take back) is decided above. Until the vote is known the totals are plain text, so nothing can be pressed blind.
 */
function VoteButtons({ up, down, vote, onVote }: { up: number; down: number; vote: VoteType | null | undefined; onVote?: (pressed: VoteType) => void }) {
  const label = votesLabel(up, down)
  if (vote === undefined || !onVote) {
    return (
      <span className="flex items-center gap-3" role="img" aria-label={label}>
        <span className="flex items-center gap-1" aria-hidden="true">
          <ArrowFatUpIcon size={15} />
          {up}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <ArrowFatDownIcon size={15} />
          {down}
        </span>
      </span>
    )
  }
  return (
    <span role="group" aria-label={label} className="flex items-center gap-2">
      <button type="button" aria-pressed={vote === 'upvote'} aria-label="Upvote" onClick={() => onVote('upvote')} className={voteButton(vote === 'upvote')}>
        <ArrowFatUpIcon size={15} weight={vote === 'upvote' ? 'fill' : 'regular'} aria-hidden="true" />
        <span aria-hidden="true">{up}</span>
      </button>
      <button type="button" aria-pressed={vote === 'downvote'} aria-label="Downvote" onClick={() => onVote('downvote')} className={voteButton(vote === 'downvote')}>
        <ArrowFatDownIcon size={15} weight={vote === 'downvote' ? 'fill' : 'regular'} aria-hidden="true" />
        <span aria-hidden="true">{down}</span>
      </button>
    </span>
  )
}
