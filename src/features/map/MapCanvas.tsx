import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import 'leaflet/dist/leaflet.css'
import type { LatLngExpression, Polygon as LeafletPolygon } from 'leaflet'
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { MapOverlayEntry } from '@/api/floodIntel'
import { hazardStyle } from './floodColor'
import { MapControls } from './MapControls'
import { MAP_MAX_BOUNDS, PAKISTAN_BOUNDS, boundaryToLatLngs, type BoundsTuple, type LatLng, type ViewportBounds } from './mapGeo'
import { drawOrder, type MapPlace } from './mapModel'
import { USER_ICON, placeIcon } from './placeIcon'
import { OSM_ATTRIBUTION, OSM_TILES } from './tiles'

/** A request to move the map — a new object each time, so asking for the same place twice moves it twice. */
export interface MapFocus {
  bounds?: BoundsTuple
  center?: LatLng
  zoom?: number
}

export interface MapCanvasProps {
  /** Where to open — re-applied as better information arrives (regions loading), until the user first moves the map. */
  initialBounds: BoundsTuple
  hazards: readonly MapOverlayEntry[]
  places: readonly MapPlace[]
  selectedHazardId: string | null
  selectedPlaceKey: string | null
  userPosition: LatLng | null
  focus: MapFocus | null
  onViewportChange: (view: ViewportBounds) => void
  onSelectHazard: (id: string) => void
  onSelectPlace: (key: string) => void
  /** Omit on a screen that has no use for the visitor's position: the map then has no locate button. */
  onRecenter?: () => void
  locating?: boolean
  legend: ReactNode
  /**
   * Things laid over the map (the phone's layer chips and selected-place card, the zoom hint). They render inside the canvas's own
   * stacking context, under the control stack — outside it they would paint over the open legend.
   */
  overlays?: ReactNode
  /** Whether the mouse wheel zooms the map. Off when the map sits inside a scrolling page, so scrolling past it doesn't zoom it. Default on. */
  scrollWheelZoom?: boolean
}

/**
 * Fits the map to `bounds` on mount and whenever they improve, until the person first touches the map — after that it is theirs.
 * The fit is not animated: Leaflet silently drops a `fitBounds` made while an earlier animated zoom is still running, so when the
 * regions arrived a moment before the profile, the fit to the home region was lost and the map stayed on the wider view.
 */
function FitInitial({ bounds }: { bounds: BoundsTuple }) {
  const map = useMap()
  const userMoved = useRef(false)

  useEffect(() => {
    const element = map.getContainer()
    const mark = () => {
      userMoved.current = true
    }
    const events = ['mousedown', 'touchstart', 'wheel', 'keydown'] as const
    events.forEach((name) => element.addEventListener(name, mark, { passive: true }))
    return () => events.forEach((name) => element.removeEventListener(name, mark))
  }, [map])

  useEffect(() => {
    if (!userMoved.current) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12, animate: false })
  }, [map, bounds])

  return null
}

/** Reports the visible box after every move (and once on mount), which is what the flood overlay is queried by. */
function ViewportReporter({ onChange }: { onChange: (view: ViewportBounds) => void }) {
  const map = useMap()
  useEffect(() => {
    const report = () => {
      const box = map.getBounds()
      onChange({ west: box.getWest(), south: box.getSouth(), east: box.getEast(), north: box.getNorth() })
    }
    report()
    map.on('moveend', report)
    return () => {
      map.off('moveend', report)
    }
  }, [map, onChange])
  return null
}

/**
 * Leaflet only measures its container on window resize, so a map shown again after being hidden (the phone's Map/List switch) would stay blank or misplaced.
 * **A map that has just been hidden is left alone**: `invalidateSize` keeps the centre by panning, so measuring a 0×0 container pans the map by half its size, and
 * measuring it again on the way back pans it back — with the markers a frame or more out of place in between. Nothing needs re-measuring until it has a size again.
 */
export function MapResizer() {
  const map = useMap()
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect
      if (box && (box.width === 0 || box.height === 0)) return
      map.invalidateSize()
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

/**
 * Flies to what the page asks it to. On a phone the map may have been **shown in the same update** as the request (choosing a zone in the list switches to
 * the map), before its size observer has run — and Leaflet's `flyTo` divides by the map's size, so on a map still cached as 0×0 (mounted while hidden) it computes
 * NaN and takes the whole page down with "Invalid LatLng". So it measures first, and does nothing while the map genuinely has no size.
 */
function FocusController({ focus }: { focus: MapFocus | null }) {
  const map = useMap()
  useEffect(() => {
    if (!focus) return
    map.invalidateSize({ pan: false, animate: false })
    const size = map.getSize()
    if (!size.x || !size.y) return
    if (focus.bounds) map.flyToBounds(focus.bounds, { padding: [56, 56], maxZoom: focus.zoom ?? 13, duration: 0.6 })
    else if (focus.center) map.flyTo(focus.center, focus.zoom ?? 14, { duration: 0.6 })
  }, [map, focus])
  return null
}

function shelterLabel(place: MapPlace) {
  return place.kind === 'shelter' ? `${place.name} · ${place.data.capacity_current}/${place.data.capacity_total}` : place.name
}

/** One flood zone. The selected one is brought to the front, so it is never hidden under a zone drawn after it. */
function ZonePolygon({ entry, positions, selected, onSelect }: { entry: MapOverlayEntry; positions: LatLngExpression[] | LatLngExpression[][] | LatLngExpression[][][]; selected: boolean; onSelect: (id: string) => void }) {
  const ref = useRef<LeafletPolygon>(null)
  useEffect(() => {
    if (selected) ref.current?.bringToFront()
  }, [selected])
  return (
    <Polygon
      ref={ref}
      positions={positions}
      pathOptions={{ ...hazardStyle(entry, selected), className: `hazard-zone hazard-${entry.risk_level}` }}
      eventHandlers={{ click: () => onSelect(entry.hazard_zone_id) }}
    />
  )
}

/**
 * The Leaflet map: OpenStreetMap tiles, the flood zones as polygons (drawn from their real geometry, not a grid box —
 * see `hazardStyle` for the colouring), the facility markers, the viewer's own dot, and the control stack. It only draws
 * what it is handed and reports what the person does with callbacks; which layers are on, what is selected and what
 * is loaded all live in the page. The pane is where a keyboard user selects a zone (SVG polygons aren't focusable), and
 * markers are focusable buttons named by `title`.
 */
export function MapCanvas({
  initialBounds,
  hazards,
  places,
  selectedHazardId,
  selectedPlaceKey,
  userPosition,
  focus,
  onViewportChange,
  onSelectHazard,
  onSelectPlace,
  onRecenter,
  locating = false,
  legend,
  overlays,
  scrollWheelZoom = true,
}: MapCanvasProps) {
  const zones = useMemo(
    () =>
      drawOrder(hazards).flatMap((entry) => {
        const positions = boundaryToLatLngs(entry.boundary)
        return positions ? [{ entry, positions }] : []
      }),
    [hazards],
  )

  return (
    <div className="relative isolate h-full w-full">
      <MapContainer bounds={PAKISTAN_BOUNDS} zoomControl={false} scrollWheelZoom={scrollWheelZoom} minZoom={5} maxZoom={18} maxBounds={MAP_MAX_BOUNDS} maxBoundsViscosity={0.7} className="h-full w-full">
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
        <FitInitial bounds={initialBounds} />
        <ViewportReporter onChange={onViewportChange} />
        <MapResizer />
        <FocusController focus={focus} />

        {zones.map(({ entry, positions }) => (
          <ZonePolygon key={entry.hazard_zone_id} entry={entry} positions={positions} selected={entry.hazard_zone_id === selectedHazardId} onSelect={onSelectHazard} />
        ))}

        {places.map((place) => {
          const selected = place.key === selectedPlaceKey
          return (
            <Marker
              key={place.key}
              position={place.position}
              icon={placeIcon(place, selected)}
              title={`${place.name}, ${place.typeLabel}, ${place.statusLabel}`}
              zIndexOffset={selected ? 1000 : 0}
              eventHandlers={{
                click: () => onSelectPlace(place.key),
                // Leaflet makes a marker a focusable `role="button"` but leaves Enter and Space to the app (its docs say Enter clicks; 1.9.4 does not), so a keyboard user could Tab to
                // a marker and nothing would happen.
                keypress: (event) => {
                  const key = event.originalEvent.key
                  if (key !== 'Enter' && key !== ' ') return
                  event.originalEvent.preventDefault()
                  onSelectPlace(place.key)
                },
              }}
            >
              {selected && (
                <Tooltip permanent direction="top" offset={[0, -22]}>
                  {shelterLabel(place)}
                </Tooltip>
              )}
            </Marker>
          )
        })}

        {userPosition && <Marker position={userPosition} icon={USER_ICON} interactive={false} keyboard={false} zIndexOffset={2000} />}

        <MapControls onRecenter={onRecenter} locating={locating} legend={legend} />
      </MapContainer>
      {overlays}
    </div>
  )
}
