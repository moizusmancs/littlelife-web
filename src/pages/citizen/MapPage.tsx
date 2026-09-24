import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { hazardZoneQueryKey, getHazardZone, type MapOverlayEntry } from '@/api/floodIntel'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { HazardCard } from '@/features/map/HazardCard'
import { LayerChips } from '@/features/map/LayerChips'
import { LocationNote } from '@/features/map/LocationNote'
import { MapCanvas, type MapFocus } from '@/features/map/MapCanvas'
import { MapLegend } from '@/features/map/MapLegend'
import { MapSidePane, type PaneNotice } from '@/features/map/MapSidePane'
import { PlaceCard } from '@/features/map/PlaceCard'
import { boundaryBounds, distanceMeters, viewportToBBox, type LatLng, type ViewportBounds } from '@/features/map/mapGeo'
import { DEFAULT_LAYERS, type LayerId, type LayerState } from '@/features/map/mapLayers'
import { hazardMatches, placeMatches, sortHazards, type MapPlace, type PlaceKind } from '@/features/map/mapModel'
import { useGeolocation } from '@/features/map/useGeolocation'
import { useFloodOverlay, useHazardDetail, useMapRegions, usePlaces, useRiskCheck } from '@/features/map/useMapData'

type Selection = { kind: 'hazard'; entry: MapOverlayEntry } | { kind: 'place'; place: MapPlace } | null

const PLACE_LAYER: Record<PlaceKind, LayerId> = { shelter: 'shelters', infrastructure: 'infrastructure', essential: 'essentials' }
const layerOf = (selection: NonNullable<Selection>): LayerId => (selection.kind === 'hazard' ? 'flood' : PLACE_LAYER[selection.place.kind])

/**
 * Container for /app/map — the Citizen Map (Pattern W-Map-Split, mockup §2f). It owns everything the two halves share: which
 * layers are on, the search text, what is selected, where the map is looking, and the data — flood zones for the visible
 * rectangle (debounced, and rounded so a small pan reuses the same request), and the facility layers per top-level region.
 * MapCanvas draws the map, MapSidePane the list and cards; both are presentation.
 *
 * On a phone one half shows at a time: the map (with the layer chips over it and the selected card at the bottom) or the list.
 * The map stays mounted while the list is up so it keeps its position. Nothing asks for the viewer's location until they
 * press the location button; the position, once given, is checked against the hazard zones by the server.
 *
 * Not here yet: Reports and Missing Persons layers, and the Report Incident / Request Help buttons — they belong to
 * Community and Relief Operations (Phases 5 and 6) and are retrofitted then.
 */
export function MapPage() {
  const queryClient = useQueryClient()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS)
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [hazardsOpen, setHazardsOpen] = useState(true)
  const [viewport, setViewport] = useState<ViewportBounds | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map')
  const [zoneError, setZoneError] = useState(false)

  const regions = useMapRegions()
  const bbox = useDebouncedValue(viewport ? viewportToBBox(viewport) : null, 350)
  const overlay = useFloodOverlay(bbox, layers.flood)
  const placeData = usePlaces(layers, regions.roots)
  const handleFix = useCallback((position: LatLng) => setFocus({ center: position, zoom: 14 }), [])
  const location = useGeolocation(handleFix)
  const risk = useRiskCheck(location.position)
  const hazardDetail = useHazardDetail(selection?.kind === 'hazard' ? selection.entry.hazard_zone_id : null)

  const searching = search.trim() !== ''
  const facilityLayerOn = layers.shelters || layers.infrastructure || layers.essentials

  const visiblePlaces = useMemo(() => placeData.places.filter((place) => placeMatches(place, search)), [placeData.places, search])
  const hazards = useMemo(() => (layers.flood ? sortHazards(overlay.data ?? []).filter((entry) => hazardMatches(entry, search)) : []), [layers.flood, overlay.data, search])
  const distanceOf = useCallback((place: MapPlace) => (location.position ? distanceMeters(location.position, place.position) : null), [location.position])

  const selectPlace = (place: MapPlace, fly: boolean) => {
    setZoneError(false)
    setSelection({ kind: 'place', place })
    if (fly) {
      setFocus({ center: place.position, zoom: 15 })
      setMobileView('map')
    }
  }
  const selectHazard = (entry: MapOverlayEntry, fly: boolean) => {
    setZoneError(false)
    setSelection({ kind: 'hazard', entry })
    if (fly) {
      const bounds = boundaryBounds(entry.boundary)
      if (bounds) setFocus({ bounds })
      setMobileView('map')
    }
  }

  const toggleLayer = (id: LayerId) => {
    if (layers[id] && selection && layerOf(selection) === id) setSelection(null)
    setLayers((previous) => ({ ...previous, [id]: !previous[id] }))
  }

  /** The zone the server's risk check named — from the overlay if it's in view, else fetched by id. */
  const showZone = async (id: string) => {
    const known = overlay.data?.find((entry) => entry.hazard_zone_id === id)
    if (known) return selectHazard(known, true)
    try {
      const detail = await queryClient.fetchQuery({ queryKey: hazardZoneQueryKey(id), queryFn: () => getHazardZone(id) })
      selectHazard(
        {
          hazard_zone_id: detail.id,
          risk_level: detail.risk_level,
          boundary: detail.boundary,
          detected_at: detail.detected_at,
          ...(detail.confidence_score === undefined ? {} : { confidence_score: detail.confidence_score }),
        },
        true,
      )
    } catch {
      setZoneError(true)
    }
  }

  const notices: PaneNotice[] = []
  if (regions.error) notices.push({ id: 'regions', tone: 'critical', text: "Couldn't load the regions that places are found by.", onRetry: regions.retry })
  if (layers.flood && overlay.isError) notices.push({ id: 'overlay', tone: 'critical', text: "Couldn't load flood zones.", onRetry: () => void overlay.refetch() })
  if (facilityLayerOn && placeData.error) notices.push({ id: 'places', tone: 'critical', text: "Couldn't load some places.", onRetry: placeData.refetch })
  if (facilityLayerOn && regions.settled && !regions.error && regions.roots.length === 0) notices.push({ id: 'no-regions', tone: 'info', text: "No regions have been set up yet, so places can't be shown." })
  if (facilityLayerOn && placeData.isPending && regions.roots.length > 0) notices.push({ id: 'loading-places', tone: 'info', text: 'Loading places…' })
  if (zoneError) notices.push({ id: 'zone', tone: 'caution', text: "Couldn't load that hazard zone." })

  const selectedCard =
    selection?.kind === 'place' ? (
      <PlaceCard place={selection.place} distanceMeters={distanceOf(selection.place)} onClose={() => setSelection(null)} />
    ) : selection?.kind === 'hazard' ? (
      <HazardCard
        entry={selection.entry}
        detail={hazardDetail.data}
        detailLoading={hazardDetail.isPending}
        detailError={hazardDetail.isError}
        onClose={() => setSelection(null)}
        onZoom={() => {
          const bounds = boundaryBounds(selection.entry.boundary)
          if (bounds) setFocus({ bounds })
        }}
      />
    ) : null

  const showPane = isDesktop || mobileView === 'list'
  const showMobileOverlays = !isDesktop && mobileView === 'map'

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div role="group" aria-label="View" className="flex flex-none gap-1 border-b border-surface-border bg-surface-raised p-2 md:hidden">
        {(['map', 'list'] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={mobileView === view}
            onClick={() => setMobileView(view)}
            className={cn('h-10 flex-1 rounded-md font-body text-label font-semibold', mobileView === view ? 'bg-primary-50 text-primary-700' : 'text-ink-500')}
          >
            {view === 'map' ? 'Map' : 'List & filters'}
          </button>
        ))}
      </div>

      {showPane && (
        <aside aria-label="Map filters and lists" className="min-h-0 flex-1 bg-surface-raised md:w-100 md:flex-none md:border-r md:border-surface-border">
          <MapSidePane
            search={search}
            onSearchChange={setSearch}
            layers={layers}
            onToggleLayer={toggleLayer}
            notices={notices}
            locationNote={<LocationNote status={location.status} risk={{ isPending: risk.isPending, isError: risk.isError, data: risk.data }} onShowZone={(id) => void showZone(id)} />}
            selectedCard={selectedCard}
            placeResults={searching ? visiblePlaces : null}
            selectedPlaceKey={selection?.kind === 'place' ? selection.place.key : null}
            distanceOf={distanceOf}
            onSelectPlace={(place) => selectPlace(place, true)}
            hazards={hazards}
            hazardsEnabled={layers.flood}
            hazardsLoading={overlay.isPending && overlay.fetchStatus !== 'idle'}
            hazardsOpen={hazardsOpen}
            onToggleHazards={() => setHazardsOpen((open) => !open)}
            selectedHazardId={selection?.kind === 'hazard' ? selection.entry.hazard_zone_id : null}
            onSelectHazard={(entry) => selectHazard(entry, true)}
          />
        </aside>
      )}

      <div className={cn('relative min-h-0 min-w-0 flex-1', !isDesktop && mobileView === 'list' && 'hidden')}>
        <MapCanvas
          initialBounds={regions.initialBounds}
          hazards={hazards}
          places={visiblePlaces}
          selectedHazardId={selection?.kind === 'hazard' ? selection.entry.hazard_zone_id : null}
          selectedPlaceKey={selection?.kind === 'place' ? selection.place.key : null}
          userPosition={location.position}
          focus={focus}
          onViewportChange={setViewport}
          onSelectHazard={(id) => {
            const entry = overlay.data?.find((candidate) => candidate.hazard_zone_id === id)
            if (entry) selectHazard(entry, false)
          }}
          onSelectPlace={(key) => {
            const place = placeData.places.find((candidate) => candidate.key === key)
            if (place) selectPlace(place, false)
          }}
          onRecenter={location.locate}
          locating={location.status === 'locating'}
          legend={<MapLegend />}
          overlays={
            <>
              {showMobileOverlays && (
                <>
                  <div className="absolute top-3 right-16 left-3 z-900 overflow-x-auto">
                    <LayerChips layers={layers} onToggle={toggleLayer} className="flex-nowrap" />
                  </div>
                  {selectedCard && <div className="absolute inset-x-3 bottom-8 z-900 max-h-[55%] overflow-y-auto rounded-md shadow-lg">{selectedCard}</div>}
                </>
              )}
            </>
          }
        />
      </div>
    </div>
  )
}
