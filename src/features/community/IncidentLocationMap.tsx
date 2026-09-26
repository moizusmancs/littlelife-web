import 'leaflet/dist/leaflet.css'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { MapResizer } from '@/features/map/MapCanvas'
import type { LatLng } from '@/features/map/mapGeo'
import { OSM_ATTRIBUTION, OSM_TILES } from '@/features/map/tiles'

/** The report's pin, in the brand colour with a soft ring — the only thing on this map. */
const PIN = divIcon({
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#f2477d;border:3px solid #fff;box-shadow:0 0 0 8px rgba(242,71,125,0.25),0 1px 4px rgba(34,16,25,0.4)"></div>',
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

/**
 * A small map with one marker: where the report was made. It has no bounds of its own (a report can be anywhere the API accepted it), the
 * mouse wheel doesn't zoom it (the page scrolls past it), and it is named for a screen reader — the coordinates beside it say the same in text.
 * Purely presentational. (Incident markers on the full Map are this phase's last step; until then this is where a report's place is shown.)
 */
export function IncidentLocationMap({ position, label }: { position: LatLng; label: string }) {
  return (
    <div role="group" aria-label={label} className="h-56 overflow-hidden rounded-md border border-surface-border">
      <MapContainer center={position} zoom={14} scrollWheelZoom={false} minZoom={4} maxZoom={18} className="h-full w-full">
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
        <MapResizer />
        <Marker position={position} icon={PIN} keyboard={false} />
      </MapContainer>
    </div>
  )
}
