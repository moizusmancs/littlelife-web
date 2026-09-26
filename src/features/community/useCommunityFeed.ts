import { useMemo } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  WORLD_BBOX,
  communityUpdatesQueryKey,
  getIncidentReport,
  incidentMediaQueryKey,
  incidentReportQueryKey,
  incidentReportsQueryKey,
  listCommunityUpdates,
  listIncidentMedia,
  listIncidentReports,
  type IncidentMedia,
  type IncidentReport,
} from '@/api/community'
import type { Region } from '@/api/geo'
import { extractErrorMessage } from '@/api/errors'
import { platformWideOnly } from './feedModel'

/**
 * Every incident report, nationwide, newest first — one request (the route has no paging; fine for hundreds, a backend conversation for
 * tens of thousands). Asked by `bbox`, not by region, because reports carry no region and many real ones lie outside every region.
 */
export function useIncidentReports() {
  const query = useQuery({ queryKey: incidentReportsQueryKey(WORLD_BBOX), queryFn: () => listIncidentReports(WORLD_BBOX) })
  return { ...query, errorText: query.isError ? extractErrorMessage(query.error) : null }
}

/**
 * The official updates a citizen should see. With a home region: that region's posts plus the platform-wide ones. Without one: only the
 * platform-wide posts — the route needs *some* region, so any region is asked and the region-specific posts are dropped. Nothing is asked
 * until the profile and the region list have both answered, and nothing at all when there are no regions.
 */
export function useOfficialUpdates({ home, roots, settled }: { home: Region | null; roots: readonly Region[]; settled: boolean }) {
  const regionId = home?.id ?? roots[0]?.id ?? null
  const query = useQuery({
    queryKey: communityUpdatesQueryKey(regionId ?? 'none'),
    queryFn: () => listCommunityUpdates(regionId as string),
    enabled: settled && regionId !== null,
    select: (updates) => (home ? updates : platformWideOnly(updates)),
  })
  return {
    updates: query.data ?? [],
    isPending: settled && regionId !== null && query.isPending,
    errorText: query.isError ? extractErrorMessage(query.error) : null,
    refetch: () => void query.refetch(),
  }
}

/**
 * One report, by `GET /incident-reports/{id}` (added 2026-09-26). When the feed's nationwide list is already cached and holds the report, that
 * copy is the starting data, dated when the list was fetched — so opening a report from the feed makes no request while the list is fresh, and
 * never shows a skeleton; a direct link asks for this one report, not the whole country. A `404` or `400` is "not found" (not retried).
 */
export function useIncidentReport(reportId: string) {
  const queryClient = useQueryClient()
  const listKey = incidentReportsQueryKey(WORLD_BBOX)
  const query = useQuery({
    queryKey: incidentReportQueryKey(reportId),
    queryFn: () => getIncidentReport(reportId),
    initialData: () => queryClient.getQueryData<IncidentReport[]>(listKey)?.find((report) => report.id === reportId),
    initialDataUpdatedAt: () => queryClient.getQueryState(listKey)?.dataUpdatedAt,
    // Never retry "not found"; anything else follows the client's own retry setting (the app's is one retry).
    retry: (failures, error) => !isNotFound(error) && withinDefaultRetries(queryClient.getDefaultOptions().queries?.retry, failures, error),
  })
  const notFound = query.isError && isNotFound(query.error)
  return { ...query, notFound, errorText: query.isError && !notFound ? extractErrorMessage(query.error) : null }
}

const isNotFound = (error: unknown) => isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 400)

/** What TanStack's own `retry` setting would decide (a boolean, a count, or a function; its default is three). */
function withinDefaultRetries(setting: unknown, failures: number, error: Error): boolean {
  if (typeof setting === 'function') return Boolean(setting(failures, error))
  if (typeof setting === 'number') return failures < setting
  if (typeof setting === 'boolean') return setting
  return failures < 3
}

export type MediaState = { status: 'pending' } | { status: 'error' } | { status: 'success'; media: IncidentMedia[] }

/**
 * The media of the reports on screen — one request per card (the list carries none), so the page asks only for the cards it shows, and a
 * card whose media fails keeps the rest of it. Cached per report.
 */
export function useReportMedia(reportIds: readonly string[]): Record<string, MediaState> {
  const queries = useMemo(
    () => reportIds.map((id) => ({ queryKey: incidentMediaQueryKey(id), queryFn: () => listIncidentMedia(id), staleTime: 5 * 60_000 })),
    [reportIds],
  )
  return useQueries({
    queries,
    combine: (results) => {
      const byId: Record<string, MediaState> = {}
      results.forEach((result, index) => {
        byId[reportIds[index]] = result.isError ? { status: 'error' } : result.data ? { status: 'success', media: result.data } : { status: 'pending' }
      })
      return byId
    },
  })
}
