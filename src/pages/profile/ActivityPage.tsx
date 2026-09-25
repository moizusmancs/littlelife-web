import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ActivityPanel } from '@/features/activity/ActivityPanel'
import { readFilter, type ActivityFilter } from '@/features/activity/activityModel'
import { useActivityTimeline } from '@/features/activity/useActivityTimeline'

/**
 * Container for /app/profile/activity — the paged query is in `useActivityTimeline`; ActivityPanel and its parts are pure presentation. The chosen
 * kind lives in the URL (`?show=donation`), mirrored from state rather than driving it (the same pattern as the other lists, so two quick presses can't
 * undo each other), so a reload or Back lands on the same view; an unknown value is All.
 */
export function ActivityPage() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<ActivityFilter>(() => readFilter(params.get('show')))
  const timeline = useActivityTimeline(filter)

  useEffect(() => {
    const next = new URLSearchParams()
    if (filter !== 'all') next.set('show', filter)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [filter, params, setParams])

  return (
    <ActivityPanel
      filter={filter}
      onFilterChange={setFilter}
      days={timeline.days}
      isPending={timeline.isPending}
      error={timeline.error}
      onRetry={timeline.retry}
      hasMore={timeline.hasMore}
      onLoadMore={timeline.loadMore}
      isLoadingMore={timeline.isLoadingMore}
      loadMoreError={timeline.loadMoreError}
    />
  )
}
