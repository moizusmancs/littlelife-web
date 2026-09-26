import { ChatsCircleIcon, CrosshairIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { LocationStatusNote } from '@/features/map/LocationNote'
import type { LocationStatus } from '@/features/map/useGeolocation'
import type { IncidentReport, VoteType } from '@/api/community'
import type { FeedItem } from './feedModel'
import { IncidentCard } from './IncidentCard'
import { OfficialUpdateCard } from './OfficialUpdateCard'
import type { MediaState } from './useCommunityFeed'

export interface FeedListProps {
  /** The items to draw, already filtered, ordered and cut to the page. */
  items: readonly FeedItem[]
  /** How many there are in all, when `items` is only the first few. */
  total: number
  isMine: (reporterAccountId: string) => boolean
  mediaOf: (reportId: string) => MediaState
  homeName: string | null
  now: Date
  onShowMore: () => void
  /** The viewer's vote on a report (`null` = none); `undefined` while unknown, when the cards show plain totals. */
  voteOf?: (reportId: string) => VoteType | null | undefined
  onVote?: (report: IncidentReport, pressed: VoteType) => void
  /** Each report's page; with it every report card opens its page. */
  hrefOf?: (reportId: string) => string
  /** Router state passed with those links (the feed's own view, for Back). */
  linkState?: unknown
}

/** The cards, and "Show more" when there are more than are shown. Purely presentational. */
export function FeedList({ items, total, isMine, mediaOf, homeName, now, onShowMore, voteOf, onVote, hrefOf, linkState }: FeedListProps) {
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Reports and updates" className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.key}>
            {item.kind === 'report' ? (
              <IncidentCard
                report={item.report}
                mine={isMine(item.report.reporter_account_id)}
                media={mediaOf(item.report.id)}
                distance={item.distance}
                now={now}
                vote={voteOf?.(item.report.id)}
                onVote={onVote ? (pressed) => onVote(item.report, pressed) : undefined}
                href={hrefOf?.(item.report.id)}
                linkState={linkState}
              />
            ) : (
              <OfficialUpdateCard update={item.update} homeName={homeName} now={now} />
            )}
          </li>
        ))}
      </ul>
      {total > items.length && (
        <div className="text-center">
          <Button type="button" variant="secondary" size="sm" onClick={onShowMore}>
            Show more ({total - items.length} more)
          </Button>
        </div>
      )}
    </div>
  )
}

/** A skeleton of cards while the feed loads. */
export function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading reports">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-md border border-surface-border bg-surface-sunken" aria-hidden="true" />
      ))}
    </div>
  )
}

/** Why the list is empty, with a way out when a filter or search is the reason. */
export function FeedEmpty({ message, onClear }: { message: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-surface-border p-8 text-center">
      <p className="font-body text-body-md text-ink-500">{message}</p>
      {onClear && (
        <Button type="button" variant="secondary" size="sm" onClick={onClear}>
          Clear search and filters
        </Button>
      )}
    </div>
  )
}

/** The list couldn't load: the server's own words and a retry. */
export function FeedError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-critical bg-status-critical-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
      <span className="min-w-0 flex-1">Couldn't load community reports: {message}</span>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/** Nearby before the viewer has said where they are: nothing is asked of the browser until they press the button. */
export function NearbyPrompt({ status, onLocate }: { status: LocationStatus; onLocate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-surface-border p-8 text-center">
      <CrosshairIcon size={28} className="text-ink-500" aria-hidden="true" />
      <p className="max-w-md font-body text-body-md text-ink-700">See the reports closest to you first. Your location is only used on this page and isn't sent to anyone.</p>
      <Button type="button" onClick={onLocate} isLoading={status === 'locating'}>
        Use my location
      </Button>
      <LocationStatusNote
        status={status}
        className="w-full rounded-md border px-3.5 py-3 text-start font-body text-body-sm text-ink-900"
        deniedText="Location is blocked for this site. Allow it in your browser's site settings to see the reports nearest you."
      />
    </div>
  )
}

/** Q&A has no backend behind it — the design's own "Coming soon" state. */
export function QaComingSoon() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-surface-border p-10 text-center">
      <ChatsCircleIcon size={32} className="text-ink-500" aria-hidden="true" />
      <h2 className="font-heading text-h3 font-bold text-ink-900">Questions and answers</h2>
      <p className="max-w-md font-body text-body-md text-ink-500">Coming soon — a place to ask your community and local responders a question.</p>
    </div>
  )
}
