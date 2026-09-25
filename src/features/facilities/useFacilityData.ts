import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { REGIONS_QUERY_KEY, getRegions, type Region } from '@/api/geo'
import { ADMIN_NGOS_QUERY_KEY, getAllNgos } from '@/api/identity'
import { extractErrorMessage } from '@/api/errors'
import {
  addEssentialLocation,
  addInfrastructure,
  essentialReportsQueryKey,
  facilityQueryKey,
  getEssentialReports,
  updateInfrastructureStatus,
  type FacilityKind,
  type InfrastructureStatus,
} from '@/api/facilities'
import { dedupeById } from './facilityModel'

const NO_REGIONS: Region[] = []

/**
 * Which regions the list is read for. The facility routes answer only per region (`region_id` is required, and a place inside a district is also
 * returned for its province), so "everywhere" is one request per **top-level** region and a chosen region is one request for it. An id in the
 * URL that isn't a region we know is treated as "everywhere" (`unknownRegion` says so) rather than sent — the API would `400` a malformed one.
 * Nothing is asked until the region list has loaded, so the wrong scope is never fetched first.
 */
export function useRegionScope(regionParam: string | null) {
  const query = useQuery({ queryKey: REGIONS_QUERY_KEY, queryFn: () => getRegions() })
  const regions = query.data ?? NO_REGIONS
  const scope = useMemo(() => (regionParam ? (regions.find((region) => region.id === regionParam) ?? null) : null), [regions, regionParam])
  const regionIds = useMemo(() => {
    if (scope) return [scope.id]
    const known = new Set(regions.map((region) => region.id))
    return regions.filter((region) => !region.parent_region_id || !known.has(region.parent_region_id)).map((region) => region.id)
  }, [regions, scope])

  return {
    regions,
    scope,
    regionIds,
    ready: query.isSuccess,
    error: query.isError ? extractErrorMessage(query.error) : null,
    unknownRegion: query.isSuccess && regionParam !== null && scope === null,
    retry: () => void query.refetch(),
  }
}

interface RowsResult<Row> {
  data: Row[] | undefined
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => unknown
}

function combineRows<Row extends { id: string }>(results: RowsResult<Row>[]) {
  return {
    rows: dedupeById(results.flatMap((result) => result.data ?? [])),
    isPending: results.some((result) => result.isPending),
    /** How many of the regions' requests failed — the rest are still shown. */
    failed: results.filter((result) => result.isError).length,
    error: results.find((result) => result.isError)?.error ?? null,
    refetch: () => results.forEach((result) => void result.refetch()),
  }
}

/**
 * One kind of facility across the regions in scope, de-duplicated. The cache entries are the citizen map's own (`['map', kind, regionId]`), so a region already
 * fetched there — or on another tab here — is not fetched again. Nothing is requested while `enabled` is false (the tab isn't showing).
 */
export function useFacilityRows<Row extends { id: string }>(kind: FacilityKind, fetcher: (regionId: string) => Promise<Row[]>, regionIds: readonly string[], enabled: boolean) {
  const queries = useMemo(
    () => (enabled ? regionIds.map((regionId) => ({ queryKey: facilityQueryKey(kind, regionId), queryFn: () => fetcher(regionId) })) : []),
    [enabled, regionIds, kind, fetcher],
  )
  return useQueries({ queries, combine: combineRows<Row> })
}

/**
 * The names of every organisation, so a shelter's `managed_by_ngo_id` can be shown as a name (only an admin can look them up — `GET /admin/ngos`, all pages, the
 * NGOs screen's own cache entry). If it fails the ids simply stay unnamed: the oversight list is still useful without them.
 */
export function useOrganisationNames(enabled: boolean) {
  const query = useQuery({ queryKey: ADMIN_NGOS_QUERY_KEY, queryFn: getAllNgos, enabled })
  const names = useMemo(() => new Map((query.data?.ngos ?? []).map((ngo) => [ngo.id, ngo.name] as const)), [query.data])
  return { names, failed: query.isError }
}

/**
 * The writes an admin can make, and what each does to what is cached: a new place or a new status makes that kind's lists stale (the map's own caches, shared with the
 * citizen map in this session), so the next read is the server's word. Callers pass `onSuccess`/`onError` to `mutate` for what the *screen* does next.
 */
export function useFacilityMutations() {
  const queryClient = useQueryClient()
  const refresh = (kind: FacilityKind) => void queryClient.invalidateQueries({ queryKey: ['map', kind] })

  return {
    addInfrastructure: useMutation({ mutationFn: addInfrastructure, onSuccess: () => refresh('infrastructure') }),
    addEssential: useMutation({ mutationFn: addEssentialLocation, onSuccess: () => refresh('essential-locations') }),
    setInfrastructureStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: InfrastructureStatus }) => updateInfrastructureStatus(id, status),
      onSuccess: () => refresh('infrastructure'),
      // Most likely the place is gone (`404`) or someone else changed it — either way the list is what to look at now.
      onError: () => refresh('infrastructure'),
    }),
  }
}

/** A place's report log (`GET /essential-locations/{id}/status-reports`), fetched only while its dialog is open. */
export function useEssentialReports(id: string | null) {
  const query = useQuery({ queryKey: essentialReportsQueryKey(id ?? ''), queryFn: () => getEssentialReports(id as string), enabled: id !== null })
  return { entries: query.data, isPending: query.isPending, error: query.isError ? extractErrorMessage(query.error) : null, retry: () => void query.refetch() }
}
