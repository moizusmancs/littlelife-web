import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { extractErrorMessage } from '@/api/errors'
import { getShelter, shelterQueryKey, type Shelter } from '@/api/facilities'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { MapCanvas, type MapFocus } from '@/features/map/MapCanvas'
import { MapLegend } from '@/features/map/MapLegend'
import { distanceMeters, unionBounds, viewportToBBox, type BoundsTuple, type LatLng, type ViewportBounds } from '@/features/map/mapGeo'
import { shelterPlace } from '@/features/map/mapModel'
import { useGeolocation } from '@/features/map/useGeolocation'
import { useFloodOverlay } from '@/features/map/useMapData'
import { ShelterCapacityCard } from '@/features/shelters/ShelterCapacityCard'
import { ShelterDetailState } from '@/features/shelters/ShelterDetailState'
import { ShelterFactsCard } from '@/features/shelters/ShelterFactsCard'
import { ShelterHeader } from '@/features/shelters/ShelterHeader'
import { ShelterLocationCard } from '@/features/shelters/ShelterLocationCard'

const noop = () => undefined

/**
 * Container for /app/map/shelters/:id. One public read, `GET /shelters/{id}`: the page, "not found" (a `404`, or a `400` for an id
 * that isn't a UUID) or a load error with retry. Once there is a shelter, `ShelterDetail` shows it.
 */
export function ShelterDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: shelterQueryKey(id), queryFn: () => getShelter(id) })

  if (query.isPending) return <ShelterDetailState kind="loading" onRetry={noop} />
  if (query.isError) {
    const code = isAxiosError(query.error) ? query.error.response?.status : undefined
    if (code === 404 || code === 400) return <ShelterDetailState kind="not-found" onRetry={noop} />
    return <ShelterDetailState kind="error" message={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  }
  return <ShelterDetail shelter={query.data} />
}

/**
 * A loaded shelter: its header, capacity, details and — reusing the map's canvas — where it is, with any flood zones around it (the
 * same overlay the map draws, asked for the box in view). The visitor's position is requested only when they ask, and then the map
 * fits both places and the distance is shown.
 */
function ShelterDetail({ shelter }: { shelter: Shelter }) {
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
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-24 md:pb-0">
      <ShelterHeader shelter={shelter} />

      <div className="grid gap-5 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="lg:col-start-3 lg:row-start-1">
          <ShelterCapacityCard shelter={shelter} />
        </div>
        <div className="lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
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
          />
        </div>
        <div className="lg:col-start-3 lg:row-start-2">
          <ShelterFactsCard shelter={shelter} />
        </div>
      </div>
    </div>
  )
}
