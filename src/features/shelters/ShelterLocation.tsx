import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Shelter } from '@/api/facilities'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { MapCanvas, type MapFocus } from '@/features/map/MapCanvas'
import { MapLegend } from '@/features/map/MapLegend'
import { distanceMeters, unionBounds, viewportToBBox, type BoundsTuple, type LatLng, type ViewportBounds } from '@/features/map/mapGeo'
import { shelterPlace } from '@/features/map/mapModel'
import { useGeolocation } from '@/features/map/useGeolocation'
import { useFloodOverlay } from '@/features/map/useMapData'
import { ShelterLocationCard } from './ShelterLocationCard'

const noop = () => undefined

/**
 * A shelter's "Location" card with its map, shared by the citizen's shelter page and the organisation's. It holds the map's own state:
 * the embedded canvas (reusing the map's component) showing the shelter, selected, with the flood zones the citizen overlay draws for
 * the box in view — so "is it in a flood zone?" is answered by looking. The visitor's position is requested only when they ask, and
 * then the map fits both places and the distance is shown. `children` go under the coordinates (the organisation's page puts the
 * region note there).
 */
export function ShelterLocation({ shelter, children }: { shelter: Shelter; children?: ReactNode }) {
  const place = useMemo(() => shelterPlace(shelter), [shelter])
  const [lat, lng] = place.position
  // About 35 km across: wide enough to see the edges of the flood zone the shelter is in (a model zone is ~60 km), not just the inside of it.
  const initialBounds = useMemo<BoundsTuple>(() => [[lat - 0.15, lng - 0.2], [lat + 0.15, lng + 0.2]], [lat, lng])

  const [viewport, setViewport] = useState<ViewportBounds | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const bbox = useDebouncedValue(viewport ? viewportToBBox(viewport) : null, 350)
  const overlay = useFloodOverlay(bbox, true)

  const handleFix = useCallback(
    (position: LatLng) => {
      const bounds = unionBounds([[position, position], [place.position, place.position]])
      if (bounds) setFocus({ bounds })
    },
    [place.position],
  )
  const location = useGeolocation(handleFix)
  const distance = location.position ? distanceMeters(location.position, place.position) : null

  return (
    <ShelterLocationCard
      position={place.position}
      distanceMeters={distance}
      locationStatus={location.status}
      onLocate={location.locate}
      mapNotice={overlay.isError ? "Couldn't load flood zones for this area." : undefined}
      map={
        <MapCanvas
          initialBounds={initialBounds}
          hazards={overlay.data ?? []}
          places={[place]}
          selectedHazardId={null}
          selectedPlaceKey={place.key}
          userPosition={location.position}
          focus={focus}
          onViewportChange={setViewport}
          onSelectHazard={noop}
          onSelectPlace={noop}
          onRecenter={location.locate}
          locating={location.status === 'locating'}
          legend={<MapLegend />}
          scrollWheelZoom={false}
        />
      }
    >
      {children}
    </ShelterLocationCard>
  )
}
