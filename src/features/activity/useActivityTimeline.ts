import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ACTIVITY_PAGE_SIZE, activityTimelineQueryKey, getActivityTimeline } from '@/api/profiling'
import { extractErrorMessage } from '@/api/errors'
import { groupByDay, mergePages, type ActivityFilter } from './activityModel'

/**
 * The timeline for one filter, a page at a time. Paging is the API's `limit`/`offset`: "Load more" asks for `offset` = how many events are
 * already held, and a page shorter than the page size is the last. Each filter is its own query (the `type` is in the key), so switching starts
 * that filter from its first page rather than mixing lists. Pages are merged with each id kept once — an event that arrives between two
 * presses would otherwise appear at the end of one page and the start of the next — and grouped under a heading per day.
 */
export function useActivityTimeline(filter: ActivityFilter) {
  const type = filter === 'all' ? undefined : filter

  const query = useInfiniteQuery({
    queryKey: activityTimelineQueryKey(type),
    queryFn: ({ pageParam }) => getActivityTimeline({ type, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length < ACTIVITY_PAGE_SIZE ? undefined : allPages.reduce((count, page) => count + page.length, 0)),
  })

  const days = useMemo(() => groupByDay(mergePages(query.data?.pages ?? [])), [query.data])

  return {
    days,
    isPending: query.isPending,
    /** The first page failed — nothing to show but the message. */
    error: query.isError && !query.isFetchNextPageError ? extractErrorMessage(query.error) : null,
    retry: () => void query.refetch(),
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
    /** A later page failed — the list so far stays, with a retry beside it. */
    loadMoreError: query.isFetchNextPageError ? extractErrorMessage(query.error) : null,
  }
}
