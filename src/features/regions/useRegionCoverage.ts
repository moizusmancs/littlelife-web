import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { REGIONS_QUERY_KEY, getRegions, type Region } from '@/api/geo'
import type { LatLng } from '@/features/map/mapGeo'
import { regionPathFor } from './regionCoverage'

/** `none` is "nothing to say": no point yet, or the regions haven't loaded (or failed) so it can't be told — never a claim either way. */
export type RegionCoverage = { status: 'none' } | { status: 'inside'; path: string } | { status: 'outside' }

/**
 * The answer itself, from a region list and a point: `none` when either is missing (or there are no regions at all — nothing can be claimed), otherwise the most specific region's path or
 * `outside`. Pure, so a form can ask it at the moment of saving instead of trusting what the settled, debounced display last said.
 */
export function coverageFor(regions: readonly Region[] | undefined, position: LatLng | null): RegionCoverage {
  if (!position || !regions || regions.length === 0) return { status: 'none' }
  const path = regionPathFor(regions, position)
  return path ? { status: 'inside', path } : { status: 'outside' }
}

/** Every region with its boundary. `GET /regions` is public and shared with the pickers and Admin Regions (one cache entry); it is only fetched when `enabled`. */
export function useRegionList(enabled: boolean): Region[] | undefined {
  return useQuery({ queryKey: REGIONS_QUERY_KEY, queryFn: () => getRegions(), enabled }).data
}

/**
 * Whether a point is inside any region the platform knows. Anything that keeps the answer from being trusted — a failed load, no regions at
 * all — yields `none`, so the screen stays silent rather than saying "outside" wrongly.
 */
export function useRegionCoverage(position: LatLng | null, enabled: boolean): RegionCoverage {
  const regions = useRegionList(enabled)
  const lat = position?.[0]
  const lng = position?.[1]
  return useMemo<RegionCoverage>(() => coverageFor(regions, lat === undefined || lng === undefined ? null : [lat, lng]), [regions, lat, lng])
}
