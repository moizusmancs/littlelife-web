import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { REGIONS_QUERY_KEY, getRegions } from '@/api/geo'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { coverageFor, useRegionCoverage, useRegionList, type RegionCoverage } from '@/features/regions/useRegionCoverage'
import type { LatLng } from './mapGeo'
import { readPosition } from './pointForm'
import { useGeolocation } from './useGeolocation'

/**
 * What a form that chooses a point on the map needs besides its fields: the point the typed coordinates settle on (the pin and the coverage
 * note follow them after a short pause, so they don't chase every keystroke), the regions to draw on the map (`areas`), whether that point is
 * inside one, and the browser's position — asked for only when `location.locate` is called. `onPick` is how a fix reaches the form's fields
 * (see `pointWriter`). `coverageAt` answers for the values *being submitted*, which the settled display may lag behind, and `coverageForSave` is the same question asked of a fresh
 * list of regions before a save is refused on it. The regions are fetched only while `enabled` (a drawer is open).
 */
export function usePointPicker({ latitude, longitude, onPick, enabled }: { latitude: string; longitude: string; onPick: (position: LatLng) => void; enabled: boolean }) {
  const settled = useDebouncedValue(`${latitude}|${longitude}`, 300)
  const position = useMemo<LatLng | null>(() => {
    const [lat, lng] = settled.split('|')
    return readPosition(lat, lng)
  }, [settled])
  const areas = useRegionList(enabled)
  const coverage = useRegionCoverage(position, enabled)
  const location = useGeolocation(onPick)
  const coverageAt = (lat: string, lng: string) => coverageFor(areas, readPosition(lat, lng))
  const queryClient = useQueryClient()
  /**
   * Where a point is *for the purpose of a save*: the coverage from the list held here — and, when that says "outside" (the reason a save is refused), from a fresh one, because the
   * list can be up to thirty seconds old and an administrator may have just added the region this point is in. The fresh answer is what counts. Fails open: if a fresh list can't be
   * had, nothing is refused on the strength of an old one (`none`).
   */
  const coverageForSave = async (lat: string, lng: string): Promise<RegionCoverage> => {
    const now = coverageAt(lat, lng)
    if (now.status !== 'outside') return now
    try {
      const latest = await queryClient.fetchQuery({ queryKey: REGIONS_QUERY_KEY, queryFn: () => getRegions(), staleTime: 0 })
      return coverageFor(latest, readPosition(lat, lng))
    } catch {
      return { status: 'none' }
    }
  }
  return { position, areas, coverage, coverageAt, coverageForSave, location }
}
