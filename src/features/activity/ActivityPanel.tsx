import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ActivityFilters } from './ActivityFilters'
import { ActivityRow } from './ActivityRow'
import { filterLabel, type ActivityDay, type ActivityFilter } from './activityModel'

export interface ActivityPanelProps {
  filter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  days: ActivityDay[]
  /** The first page is still loading. */
  isPending: boolean
  /** The first page failed. */
  error: string | null
  onRetry: () => void
  hasMore: boolean
  onLoadMore: () => void
  isLoadingMore: boolean
  /** A later page failed — the list stays, with the message and a retry under it. */
  loadMoreError: string | null
}

/**
 * /app/profile/activity — what the account has done, newest first, from `GET /profile/activity-timeline`: incident reports and votes, aid
 * requests, donations, place status reports and missing-person reports and sightings, grouped under a heading per day, filterable by kind, a
 * page at a time. (The mockup's "interactions" — chat messages — wait on Communication.) Not built into this screen because they aren't in the
 * API: links to most subjects, which arrive with their screens (see `describeActivity`). Purely presentational.
 */
export function ActivityPanel({ filter, onFilterChange, days, isPending, error, onRetry, hasMore, onLoadMore, isLoadingMore, loadMoreError }: ActivityPanelProps) {
  return (
    <div className="flex max-w-140 flex-col gap-5">
      <div>
        <h1 className="font-heading text-h2 font-bold text-ink-900">Activity</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">What you've reported, voted on, requested and donated, newest first.</p>
      </div>

      <ActivityFilters filter={filter} onFilterChange={onFilterChange} />

      {isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading your activity">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3.5 rounded-md border border-surface-border bg-surface-raised p-4" aria-hidden="true">
              <div className="size-10 flex-none animate-pulse rounded-full bg-surface-sunken" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-56 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
                <div className="mt-2 h-4 w-20 animate-pulse rounded-full bg-surface-sunken" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-surface-border bg-surface-raised p-6">
          <p role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {error}
          </p>
          <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border px-6 py-10 text-center">
          <ClockCounterClockwiseIcon size={32} className="text-ink-300" aria-hidden="true" />
          <p className="mt-3 font-body text-body-md font-semibold text-ink-900">{filter === 'all' ? 'No activity yet' : `No ${filterLabel(filter).toLowerCase()} yet`}</p>
          <p className="mt-1 max-w-sm font-body text-body-sm text-ink-500">
            {filter === 'all' ? 'Reports, votes, requests and donations you make will show up here.' : 'Try another filter, or choose All.'}
          </p>
        </div>
      ) : (
        <>
          {days.map((day) => (
            <section key={day.key} aria-labelledby={`day-${day.key}`}>
              <h2 id={`day-${day.key}`} className="font-body text-[11px] font-bold tracking-[0.8px] text-ink-500 uppercase">
                {day.heading}
              </h2>
              <ul className="mt-2 divide-y divide-surface-border rounded-md border border-surface-border bg-surface-raised px-4 shadow-sm">
                {day.items.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          ))}

          {loadMoreError && (
            <p role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
              {loadMoreError}
            </p>
          )}
          {hasMore && (
            <div>
              <Button type="button" variant="secondary" isLoading={isLoadingMore} onClick={onLoadMore}>
                {loadMoreError ? 'Try again' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
