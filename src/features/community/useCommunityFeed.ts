import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  WORLD_BBOX,
  communityUpdatesQueryKey,
  incidentMediaQueryKey,
  incidentReportsQueryKey,
  listCommunityUpdates,
  listIncidentMedia,
  listIncidentReports,
  type IncidentMedia,
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
