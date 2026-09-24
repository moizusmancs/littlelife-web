import { useMemo } from 'react'
import { keepPreviousData, useQueries, useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { REGIONS_QUERY_KEY, getRegions, type Region } from '@/api/geo'
import {
  facilityQueryKey,
  getEssentialLocations,
  getInfrastructure,
  getShelters,
  type EssentialLocation,
  type Infrastructure,
  type Shelter,
} from '@/api/facilities'
import { floodOverlayQueryKey, getFloodOverlay, getHazardZone, hazardZoneQueryKey, checkRisk, riskCheckQueryKey } from '@/api/floodIntel'
import { PROFILE_QUERY_KEY, getProfile } from '@/api/profiling'
import { extractErrorMessage } from '@/api/errors'
import { boundaryBounds, unionBounds, PAKISTAN_BOUNDS, type BoundsTuple, type LatLng } from './mapGeo'
import type { LayerState } from './mapLayers'
import { collapseDuplicateZones, dedupePlaces, essentialPlace, infrastructurePlace, shelterPlace, type MapPlace } from './mapModel'

/**
 * Flood zones intersecting the current viewport, one per distinct boundary (see `collapseDuplicateZones`). Keeps showing the
 * previous ones while a new viewport loads, so panning doesn't flash.
 */
export function useFloodOverlay(bbox: string | null, enabled: boolean) {
  return useQuery({
    queryKey: floodOverlayQueryKey(bbox ?? ''),
    queryFn: () => getFloodOverlay(bbox as string),
    enabled: enabled && bbox !== null,
    placeholderData: keepPreviousData,
    select: collapseDuplicateZones,
  })
}

/** The tooltip-shape detail of the selected zone — the model's confidence, version and validity window. */
export function useHazardDetail(id: string | null) {
  return useQuery({ queryKey: hazardZoneQueryKey(id ?? ''), queryFn: () => getHazardZone(id as string), enabled: id !== null })
}

/**
 * Where the map should open. The citizen's own home region if they set one; otherwise the box around every region
 * there is (so the map opens on the country's real coverage); otherwise a frame of Pakistan. Also the top-level
 * regions the facility layers are fetched for.
 *
 * The facility routes only answer per region, and a place inside a district is also returned for its province, so
 * asking for each **top-level** region (no parent) covers everything reachable without one request per district.
 */
export function useMapRegions() {
  const regionsQuery = useQuery({ queryKey: REGIONS_QUERY_KEY, queryFn: () => getRegions() })
  // A failed profile (staff have none) just means no home region.
  const profileQuery = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => getProfile(), retry: false })
  const regions = regionsQuery.data
  const homeRegionId = profileQuery.data?.home_region_id
  const { isPending: regionsPending, isError: regionsFailed, error: regionsError, refetch: refetchRegions } = regionsQuery
  const profilePending = profileQuery.isPending

  return useMemo(() => {
    const all = regions ?? []
    const ids = new Set(all.map((region) => region.id))
    const roots = all.filter((region) => !region.parent_region_id || !ids.has(region.parent_region_id))
    const home = homeRegionId ? all.find((region) => region.id === homeRegionId) : undefined
    const homeBounds = home ? boundaryBounds(home.boundary) : null
    const coverage = unionBounds(roots.map((region) => boundaryBounds(region.boundary)))
    const initialBounds: BoundsTuple = homeBounds ?? coverage ?? PAKISTAN_BOUNDS
    return {
      roots,
      /** The citizen's own home region, once both it and the region list have loaded; `null` when they have none. */
      home: home ?? null,
      initialBounds,
      settled: !regionsPending && !profilePending,
      error: regionsFailed ? extractErrorMessage(regionsError) : null,
      retry: () => void refetchRegions(),
    }
  }, [regions, homeRegionId, regionsPending, regionsFailed, regionsError, refetchRegions, profilePending])
}

type PlaceQueryOptions = UseQueryOptions<unknown[], Error, MapPlace[]>

const placeQuery = <Row,>(
  kind: 'shelters' | 'infrastructure' | 'essential-locations',
  regionId: string,
  fetcher: (regionId: string) => Promise<Row[]>,
  toPlace: (row: Row) => MapPlace,
): PlaceQueryOptions => ({
  queryKey: facilityQueryKey(kind, regionId),
  queryFn: () => fetcher(regionId),
  select: (rows) => (rows as Row[]).map(toPlace),
})

const combinePlaces = (results: Array<{ data: MapPlace[] | undefined; isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown }>) => ({
  places: dedupePlaces(results.flatMap((result) => result.data ?? [])),
  isPending: results.some((result) => result.isPending),
  error: results.find((result) => result.isError)?.error ?? null,
  refetch: () => results.forEach((result) => void result.refetch()),
})

/**
 * Every place for the switched-on facility layers, across the top-level regions. Nothing is requested for a layer
 * that is off, and a region is asked once however often the layers are toggled (the cache holds it).
 */
export function usePlaces(layers: LayerState, roots: readonly Region[]) {
  const queries = useMemo(
    () =>
      roots.flatMap((region) => [
        ...(layers.shelters ? [placeQuery<Shelter>('shelters', region.id, getShelters, shelterPlace)] : []),
        ...(layers.infrastructure ? [placeQuery<Infrastructure>('infrastructure', region.id, getInfrastructure, infrastructurePlace)] : []),
        ...(layers.essentials ? [placeQuery<EssentialLocation>('essential-locations', region.id, getEssentialLocations, essentialPlace)] : []),
      ]),
    [layers.shelters, layers.infrastructure, layers.essentials, roots],
  )
  return useQueries({ queries, combine: combinePlaces })
}

/** A position rounded to three decimals (about 110 m): a steadier cache key, and less precise than the GPS fix that is sent. */
export const coarsen = (value: number) => Math.round(value * 1000) / 1000

/** The server's own answer to "am I in danger here?" for the located position — only asked once there is one. */
export function useRiskCheck(position: LatLng | null) {
  const lat = position ? coarsen(position[0]) : null
  const lng = position ? coarsen(position[1]) : null
  return useQuery({
    queryKey: riskCheckQueryKey(lat ?? 0, lng ?? 0),
    queryFn: () => checkRisk(lat as number, lng as number),
    enabled: lat !== null && lng !== null,
    staleTime: 60_000,
  })
}
