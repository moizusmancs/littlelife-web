import { useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { divIcon, type LeafletMouseEvent } from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapPinIcon } from '@phosphor-icons/react'
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { Region } from '@/api/geo'
import { Select } from '@/components/ui/select'
import { areaChoices, coverageBounds, drawableAreas, type CoverageArea } from '@/features/regions/coverageAreas'
import { regionContains } from '@/features/regions/regionCoverage'
import { MapResizer } from './MapCanvas'
import { MAP_MAX_BOUNDS, PAKISTAN_BOUNDS, unionBounds, type BoundsTuple, type LatLng } from './mapGeo'
import { OSM_ATTRIBUTION, OSM_TILES } from './tiles'

export interface LocationPickerProps {
  /** Where the pin is; `null` while nothing is chosen. */
  value: LatLng | null
  /** A click on the map, or the end of a drag of the pin. Rounded to about a metre, so what the form shows is what was picked. */
  onChange: (position: LatLng) => void
  /**
   * The regions places can be added in, drawn as shaded areas: the map opens on them, a menu jumps to any one, and a note says places can only go
   * inside them. Left out (or empty, or not loaded) the map is just a map of Pakistan, as before.
   */
  areas?: readonly Region[]
  /** What to show while there is no pin and no areas to show. Defaults to a frame of Pakistan. */
  frame?: BoundsTuple
  /** Names the map for a screen reader — the coordinate fields beside it are the keyboard way to set the same thing. */
  label: string
}

const PIN = divIcon({
  html: renderToStaticMarkup(<MapPinIcon size={38} weight="fill" color="#f2477d" style={{ filter: 'drop-shadow(0 2px 3px rgba(34,16,25,0.45))' }} />),
  className: '',
  iconSize: [38, 38],
  iconAnchor: [19, 36],
})

/** The trust teal — nothing else on this map is that colour (the pin is pink, hazards are red to yellow). */
const AREA_STYLE = { color: '#1f7a8c', weight: 1.5, opacity: 0.85, fillColor: '#1f7a8c', fillOpacity: 0.13 }

const NO_REGIONS: readonly Region[] = []
const round = (value: number) => Number(value.toFixed(6))
const keyOf = ([lat, lng]: LatLng) => `${lat},${lng}`

/** Turns a click into a pin. */
function ClickToPlace({ onPlace }: { onPlace: (position: LatLng) => void }) {
  useMapEvents({ click: (event: LeafletMouseEvent) => onPlace([event.latlng.lat, event.latlng.lng]) })
  return null
}

/**
 * Brings the map to a pin that was set from *outside* the map — typed coordinates, "use my location" — but not to one the person
 * just placed by clicking or dragging, which is already where they are looking (zooming in on every click would fight them).
 * A pin in one of the shaded areas is zoomed to; one in **none** is shown together with all of them (`openOn`), since zooming in on
 * it would leave a blank map with nothing to say where it should have gone.
 */
function FollowPin({ value, ownKey, regions, openOn }: { value: LatLng | null; ownKey: { current: string | null }; regions: readonly Region[]; openOn: BoundsTuple | null }) {
  const map = useMap()
  const lat = value?.[0]
  const lng = value?.[1]
  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    if (ownKey.current === keyOf([lat, lng])) return
    const outside = openOn !== null && !regions.some((region) => regionContains(region, [lat, lng]))
    const both = outside ? unionBounds([openOn, [[lat, lng], [lat, lng]]]) : null
    if (both) map.fitBounds(both, { paddingTopLeft: [24, 56], paddingBottomRight: [24, 24], animate: false }) // room above for the pin's head — its tip is the point
    else map.setView([lat, lng], Math.max(map.getZoom(), 13), { animate: false })
  }, [map, lat, lng, ownKey, regions, openOn])
  return null
}

/**
 * Opens the map on the shaded areas — once, when they arrive, and only if there is no pin yet (a pin already says where to look). The fit is
 * not animated: Leaflet drops a `fitBounds` made while an earlier animated zoom is still running.
 */
function FitToAreas({ bounds, hasPin }: { bounds: BoundsTuple | null; hasPin: boolean }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !bounds) return
    done.current = true
    if (!hasPin) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12, animate: false })
  }, [map, bounds, hasPin])
  return null
}

/** Moves the map to whichever area was picked from the menu. A new `target` object each time, so choosing the same area again after panning away still goes there. */
function JumpTo({ target }: { target: { bounds: BoundsTuple } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.fitBounds(target.bounds, { padding: [24, 24], maxZoom: 13, animate: false })
  }, [map, target])
  return null
}

/**
 * The regions as shaded shapes, widest first so a district sits on top of its province. They take part in the pointer (hovering names the area) but
 * a click on one still reaches the map, so it still places the pin.
 */
function CoverageAreas({ areas }: { areas: readonly CoverageArea[] }) {
  return areas.map((area) => (
    <Polygon key={area.id} positions={area.positions} pathOptions={AREA_STYLE}>
      <Tooltip sticky>{area.name}</Tooltip>
    </Polygon>
  ))
}

/**
 * A small map for choosing one point: click to place a pin, drag it to adjust. The pin is the value, so it follows coordinates typed
 * in the form. When it is given the regions, they are shaded on the map — the only places a point can be saved — and a menu jumps to any
 * of them, so nobody has to know where they are. Pointer-only by nature; a keyboard or screen-reader user sets the same value through
 * the latitude and longitude fields (the pin is deliberately not a tab stop — it can't be moved from the keyboard). The mouse wheel doesn't
 * zoom it, so scrolling the form past it works. Purely presentational: the position and the regions are the parent's.
 */
export function LocationPicker({ value, onChange, areas, frame = PAKISTAN_BOUNDS, label }: LocationPickerProps) {
  const ownKey = useRef<string | null>(null)
  const place = useMemo(
    () => (position: LatLng) => {
      const rounded: LatLng = [round(position[0]), round(position[1])]
      ownKey.current = keyOf(rounded)
      onChange(rounded)
    },
    [onChange],
  )
  const drawn = useMemo(() => drawableAreas(areas ?? []), [areas])
  const choices = useMemo(() => areaChoices(areas ?? []), [areas])
  const openOn = useMemo(() => coverageBounds(drawn), [drawn])
  const [jump, setJump] = useState<{ bounds: BoundsTuple } | null>(null)

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      {choices.length > 0 && (
        <Select
          compact
          aria-label="Jump to an area"
          value=""
          onChange={(event) => {
            const choice = choices.find((entry) => entry.id === event.target.value)
            if (choice) setJump({ bounds: choice.bounds })
          }}
        >
          <option value="">Jump to an area…</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </Select>
      )}
      <div className="h-64 overflow-hidden rounded-md border border-surface-border">
        <MapContainer
          bounds={value ? undefined : frame}
          center={value ?? undefined}
          zoom={value ? 13 : undefined}
          scrollWheelZoom={false}
          minZoom={5}
          maxZoom={18}
          maxBounds={MAP_MAX_BOUNDS}
          maxBoundsViscosity={0.7}
          className="h-full w-full"
        >
          <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
          <MapResizer />
          <CoverageAreas areas={drawn} />
          <ClickToPlace onPlace={place} />
          <FitToAreas bounds={openOn} hasPin={value !== null} />
          <JumpTo target={jump} />
          <FollowPin value={value} ownKey={ownKey} regions={areas ?? NO_REGIONS} openOn={openOn} />
          {value && (
            <Marker
              position={value}
              icon={PIN}
              draggable
              keyboard={false}
              title="Shelter location — drag to adjust"
              eventHandlers={{ dragend: (event) => place([event.target.getLatLng().lat, event.target.getLatLng().lng]) }}
            />
          )}
        </MapContainer>
      </div>
      {drawn.length > 0 && (
        <p className="flex items-center gap-2 font-body text-body-sm text-ink-500">
          <span aria-hidden="true" className="h-3 w-5 flex-none rounded-[3px] border border-status-trust bg-status-trust/30" />
          Places can only be added inside the shaded areas.
        </p>
      )}
    </div>
  )
}
