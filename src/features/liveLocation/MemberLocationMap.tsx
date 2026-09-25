import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import { MapResizer } from '@/features/map/MapCanvas'
import { MAP_MAX_BOUNDS, type LatLng } from '@/features/map/mapGeo'
import { OSM_ATTRIBUTION, OSM_TILES } from '@/features/map/tiles'

const dot = (colour: string) =>
  divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${colour};border:3px solid #fff;box-shadow:0 0 0 8px ${colour}40,0 1px 4px rgba(34,16,25,0.4)"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })

/** Teal ("trust") while the member is live, grey once the position is old. */
const LIVE_DOT = dot('#1f7a8c')
const STALE_DOT = dot('#b79aa6')

/** Keeps the member in view as they move — until the viewer has touched the map, after which it's theirs (the same rule as the flood map's opening fit). */
function Follow({ position }: { position: LatLng }) {
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

  const lat = position[0]
  const lng = position[1]
  useEffect(() => {
    if (!userMoved.current) map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: false })
  }, [map, lat, lng])

  return null
}

export interface MemberLocationMapProps {
  position: LatLng
  /** Live (teal) or a position that has gone stale (grey). */
  live: boolean
  /** Names the map for a screen reader — the coordinates beside it say the same in text. */
  label: string
}

/** A small map with one marker: where a connected member last was. Purely presentational. */
export function MemberLocationMap({ position, live, label }: MemberLocationMapProps) {
  return (
    <div role="group" aria-label={label} className="h-64 overflow-hidden rounded-md border border-surface-border">
      <MapContainer center={position} zoom={15} scrollWheelZoom={false} minZoom={5} maxZoom={18} maxBounds={MAP_MAX_BOUNDS} maxBoundsViscosity={0.7} className="h-full w-full">
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
        <MapResizer />
        <Follow position={position} />
        <Marker position={position} icon={live ? LIVE_DOT : STALE_DOT} keyboard={false} />
      </MapContainer>
    </div>
  )
}
