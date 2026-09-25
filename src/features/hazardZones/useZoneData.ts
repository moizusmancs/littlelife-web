import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminOverlayQueryKey,
  adminPredictionsQueryKey,
  adminZonesQueryKey,
  declareHazardZone,
  getAdminFloodOverlay,
  getAdminFloodPredictions,
  getAdminHazardZones,
  hazardZoneQueryKey,
  resolveHazardZone,
  type DeclareZoneInput,
  type PredictionFilters,
  type ZoneFilters,
} from '@/api/floodIntel'
import { collapseDuplicateZones } from '@/features/map/mapModel'

/** One page of the admin zone table. The previous page stays on screen while the next loads, so paging and filtering don't flash. */
export function useAdminZones(filters: ZoneFilters, enabled: boolean) {
  return useQuery({ queryKey: adminZonesQueryKey(filters), queryFn: () => getAdminHazardZones(filters), enabled, placeholderData: keepPreviousData })
}

/** One page of the model's predictions. */
export function useAdminPredictions(filters: PredictionFilters, enabled: boolean) {
  return useQuery({ queryKey: adminPredictionsQueryKey(filters), queryFn: () => getAdminFloodPredictions(filters), enabled, placeholderData: keepPreviousData })
}

/**
 * Every active zone in the visible box, low-confidence model output included, with model zones under `minConfidence` dropped (declared zones
 * always stay). One zone per distinct boundary — the pipeline stacks the same box many times over — and the previous zones stay while a new box loads.
 */
export function useAdminOverlay(bbox: string | null, minConfidence: number, enabled: boolean, { fresh = false }: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: adminOverlayQueryKey(bbox ?? '', minConfidence),
    queryFn: () => getAdminFloodOverlay(bbox as string, minConfidence),
    enabled: enabled && bbox !== null,
    placeholderData: keepPreviousData,
    select: collapseDuplicateZones,
    // `fresh` is for an answer someone acts on ("is this place inside an active hazard zone?"): nothing is kept after it is closed, so every opening asks again instead
    // of repeating what was true up to thirty seconds ago — a zone resolved in the meantime must not still be reported.
    ...(fresh ? { gcTime: 0, staleTime: 0 } : {}),
  })
}

/** After a zone is declared or resolved, everything that lists or draws zones is stale — the admin's own views and the citizen overlay in this session. */
function useRefreshZones() {
  const queryClient = useQueryClient()
  return (zoneId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
    void queryClient.invalidateQueries({ queryKey: ['map', 'flood-overlay'] })
    if (zoneId) void queryClient.invalidateQueries({ queryKey: hazardZoneQueryKey(zoneId) })
  }
}

export function useResolveZone() {
  const refresh = useRefreshZones()
  return useMutation({ mutationFn: (id: string) => resolveHazardZone(id), onSettled: (_data, _error, id) => refresh(id) })
}

export function useDeclareZone() {
  const refresh = useRefreshZones()
  return useMutation({ mutationFn: (input: DeclareZoneInput) => declareHazardZone(input), onSuccess: (zone) => refresh(zone.id) })
}
