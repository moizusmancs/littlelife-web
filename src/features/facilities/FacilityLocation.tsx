import { useMemo, useState } from 'react'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { MapCanvas } from '@/features/map/MapCanvas'
import { MapLegend } from '@/features/map/MapLegend'
import { viewportToBBox, type BoundsTuple, type LatLng, type ViewportBounds } from '@/features/map/mapGeo'
import { sortHazards, type MapPlace } from '@/features/map/mapModel'
import { useAdminOverlay } from '@/features/hazardZones/useZoneData'
import { regionContains } from '@/features/regions/regionCoverage'
import { useRegionCoverage } from '@/features/regions/useRegionCoverage'
import { FacilityLocationDialog, type ZoneCheck } from './FacilityLocationDialog'

const noop = () => undefined

/**
 * The container behind the location dialog: it holds the map's viewport, asks the **admin** overlay for the zones in view (every active zone, low-confidence model output included — an admin
 * wants the whole picture), and answers "is this place inside an active zone?" from a **separate, tiny box around the point** rather than from what happens to be in view, so
 * panning away can never change the answer. The point-in-polygon is done here against the zones' own geometry. Nothing is requested while no place is chosen.
 */
export function FacilityLocation({ place, onClose }: { place: MapPlace | null; onClose: () => void }) {
  const open = place !== null
  const position = place?.position ?? null

  const [viewport, setViewport] = useState<ViewportBounds | null>(null)
  const bbox = useDebouncedValue(viewport ? viewportToBBox(viewport) : null, 350)
  const overlay = useAdminOverlay(bbox, 0, open, { fresh: true })

  const pointBox = useMemo(() => (position ? viewportToBBox({ west: position[1] - 0.05, south: position[0] - 0.05, east: position[1] + 0.05, north: position[0] + 0.05 }) : null), [position])
  const around = useAdminOverlay(pointBox, 0, open, { fresh: true })
  const coverage = useRegionCoverage(position, open)

  const zone = useMemo<ZoneCheck>(() => {
    if (!position) return { state: 'checking' }
    if (around.isError) return { state: 'error' }
    if (!around.data) return { state: 'checking' }
    const containing = sortHazards(around.data.filter((entry) => regionContains(entry, position as LatLng, { includeBoundary: false })))
    return containing.length > 0 ? { state: 'inside', zone: containing[0] } : { state: 'clear' }
  }, [position, around.data, around.isError])

  // About 35 km across, as on the shelter pages: wide enough to see the edges of a model zone (~60 km), not just the inside of it.
  const initialBounds = useMemo<BoundsTuple | null>(() => (position ? [[position[0] - 0.15, position[1] - 0.2], [position[0] + 0.15, position[1] + 0.2]] : null), [position])

  return (
    <FacilityLocationDialog
      place={place}
      onClose={onClose}
      coverage={coverage}
      zone={zone}
      map={
        place && initialBounds ? (
          <MapCanvas
            initialBounds={initialBounds}
            hazards={overlay.data ?? []}
            places={[place]}
            selectedHazardId={null}
            selectedPlaceKey={place.key}
            userPosition={null}
            focus={null}
            onViewportChange={setViewport}
            onSelectHazard={noop}
            onSelectPlace={noop}
            legend={<MapLegend showCitizenFloor={false} />}
          />
        ) : null
      }
    />
  )
}
