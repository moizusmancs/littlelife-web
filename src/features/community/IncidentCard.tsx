import { format, formatDistanceStrict, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'
import { CaretRightIcon, MapPinIcon, UserIcon } from '@phosphor-icons/react'
import type { IncidentReport, VoteType } from '@/api/community'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from '@/features/map/mapGeo'
import { cn } from '@/lib/utils'
import { CATEGORY_CHIP, CATEGORY_LABEL, reporterLabel, statusBadge } from './feedModel'
import { MediaThumb } from './MediaThumb'
import type { MediaState } from './useCommunityFeed'
import { VoteButtons } from './VoteButtons'

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
  /** The report's page. With it the whole card opens the page (the vote buttons sit above that link and stay their own). */
  href?: string
  /** Router state for the link — the feed passes its own view, so Back returns to it. */
  linkState?: unknown
}

/**
 * One citizen report in the feed: who (as far as a citizen may know) and when, its category and status, what they wrote, a picture, and
 * the vote totals with Upvote / Downvote buttons (the viewer's own vote pressed). There is no title, severity or comment count — the
 * report has none. The "View details" link stretches over the card, so a click anywhere but the vote buttons opens the report. Purely presentational.
 */
export function IncidentCard({ report, mine, media, distance, now, vote, onVote, href, linkState }: IncidentCardProps) {
  const created = parseISO(report.created_at)
  const badge = statusBadge(report)
  const headingId = `report-${report.id}-title`
  const reporter = reporterLabel(mine)

  return (
    <article
      aria-labelledby={headingId}
      className={cn('relative flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm sm:flex-row', href && 'transition-colors hover:border-primary-200')}
    >
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
          {href && (
            <Link
              to={href}
              state={linkState}
              aria-describedby={headingId}
              className="ms-auto flex items-center gap-1 font-semibold text-primary-700 after:absolute after:inset-0 after:rounded-md after:content-[''] hover:underline"
            >
              View details
              <CaretRightIcon size={12} weight="bold" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <MediaThumb state={media} />
    </article>
  )
}
